import { describe, expect, it } from 'vitest';
import { computeRunStats, computeRunStatsBatched } from '../../src/runStats/index';
import { type ApiProvider, ResultFailureReason } from '../../src/types/index';

import type { StatableResult } from '../../src/runStats/types';

describe('computeRunStats', () => {
  const createProvider = (id: string): ApiProvider =>
    ({
      id: () => id,
    }) as ApiProvider;

  it('honors explicit provider request counts without changing result outcome rates', () => {
    const runStats = computeRunStats({
      results: [0, 4].map((numRequests) => ({
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:fixture' },
        response: { output: 'hello', tokenUsage: { total: numRequests * 10, numRequests } },
      })),

      providers: [],
    });
    expect(runStats.providers[0]).toMatchObject({
      requests: 4,
      successes: 2,
      successRate: 1,
      avgLatencyMs: 100,
      tokensPerRequest: 10,
    });
  });

  it('groups result-derived assertion labels into a bounded custom category', () => {
    const privateLabel = 'internal research cohort';
    const runStats = computeRunStats({
      results: [
        {
          success: true,
          latencyMs: 1,
          gradingResult: {
            componentResults: [
              { pass: true, score: 1, reason: '', assertion: { type: privateLabel as any } },
              {
                pass: false,
                score: 0,
                reason: '',
                assertion: { type: 'promptfoo:redteam:private-project' },
              },
              { pass: true, score: 1, reason: '', assertion: { type: 'not-equals' } },
            ],
          },
        },
      ],

      providers: [],
    });
    expect(runStats.assertions.breakdown).toEqual([
      { type: 'custom', pass: 1, fail: 1, total: 2, passRate: 0.5 },
      { type: 'not-equals', pass: 1, fail: 0, total: 1, passRate: 1 },
    ]);
    expect(JSON.stringify(runStats)).not.toContain(privateLabel);
    expect(JSON.stringify(runStats)).not.toContain('private-project');
  });

  it('should compute all stats for empty input', () => {
    const runStats = computeRunStats({
      results: [],

      providers: [],
    });

    expect(runStats).toEqual({
      latency: { avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
      cache: { hits: 0, misses: 0, hitRate: null },
      errors: {
        total: 0,
        types: [],
        breakdown: {
          timeout: 0,
          rate_limit: 0,
          auth: 0,
          server_error: 0,
          network: 0,
          other: 0,
        },
      },
      providers: [],
      assertions: {
        total: 0,
        passed: 0,
        passRate: 0,
        modelGraded: 0,
        breakdown: [],
      },
      models: { ids: [], isComparison: false, hasCustom: false },
    });
  });

  it('should compute comprehensive stats for realistic input', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: { cached: false },
        gradingResult: {
          componentResults: [
            { pass: true, score: 1, reason: '', assertion: { type: 'equals' } },
            { pass: false, score: 0, reason: '', assertion: { type: 'contains' } },
          ],
        },
      },
      {
        success: true,
        latencyMs: 200,
        provider: { id: 'openai:gpt-4' },
        response: { cached: true },
        gradingResult: {
          componentResults: [{ pass: true, score: 1, reason: '', assertion: { type: 'equals' } }],
        },
      },
      {
        success: false,
        latencyMs: 50,
        provider: { id: 'openai:gpt-4' },
        error: 'Rate limit exceeded',
      },
    ];

    const providers = [createProvider('openai:gpt-4')];

    const runStats = computeRunStats({ results, providers });

    // Verify all stat categories are present
    expect(runStats.latency).toBeDefined();
    expect(runStats.cache).toBeDefined();
    expect(runStats.errors).toBeDefined();
    expect(runStats.providers).toBeDefined();
    expect(runStats.assertions).toBeDefined();
    expect(runStats.models).toBeDefined();

    // Spot check some values
    expect(runStats.latency.avgMs).toBe(117); // (100+200+50)/3 rounded
    expect(runStats.cache.hits).toBe(1);
    expect(runStats.cache.misses).toBe(1);
    expect(runStats.errors.total).toBe(1);
    expect(runStats.errors.breakdown.rate_limit).toBe(1);
    expect(runStats.assertions.total).toBe(3);
    expect(runStats.assertions.passed).toBe(2);
    expect(runStats.models.ids).toEqual(['openai:gpt-4']);
    expect(runStats.models.isComparison).toBe(false);
  });

  it('should detect model comparison correctly', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
      { success: true, latencyMs: 200, provider: { id: 'anthropic:claude-3' } },
    ];

    const providers = [createProvider('openai:gpt-4'), createProvider('anthropic:claude-3')];

    const runStats = computeRunStats({
      results,

      providers,
    });

    expect(runStats.models.isComparison).toBe(true);
    expect(runStats.models.ids).toEqual(['anthropic:claude-3', 'openai:gpt-4']);
  });

  it('should derive model information from result providers when available', () => {
    const runStats = computeRunStats({
      results: [{ success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } }],

      providers: [createProvider('anthropic:claude-3'), createProvider('openai:gpt-4')],
    });

    expect(runStats.models).toEqual({
      ids: ['openai:gpt-4'],
      isComparison: false,
      hasCustom: false,
    });
  });

  it('should handle results with all errors', () => {
    const results: StatableResult[] = [
      { success: false, latencyMs: 100, error: 'Timeout error', provider: { id: 'openai:gpt-4' } },
      { success: false, latencyMs: 200, error: '429 Rate limit', provider: { id: 'openai:gpt-4' } },
    ];

    const providers = [createProvider('openai:gpt-4')];

    const runStats = computeRunStats({
      results,

      providers,
    });

    expect(runStats.errors.total).toBe(2);
    expect(runStats.errors.breakdown.timeout).toBe(1);
    expect(runStats.errors.breakdown.rate_limit).toBe(1);
    expect(runStats.cache.hitRate).toBeNull(); // No successful responses
  });

  it('should compute provider stats with token usage', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: {
          tokenUsage: { total: 500, prompt: 400, completion: 100, cached: 50 },
        },
      },
    ];

    const providers = [createProvider('openai:gpt-4')];

    const runStats = computeRunStats({
      results,

      providers,
    });

    expect(runStats.providers[0]).toMatchObject({
      provider: 'openai:gpt-4',
      totalTokens: 500,
      promptTokens: 400,
      completionTokens: 100,
      cachedTokens: 50,
    });
  });

  it('should sort equal-count provider stats deterministically', () => {
    const runStats = computeRunStats({
      results: [
        { success: true, latencyMs: 100, provider: { id: 'provider-z' } },
        { success: true, latencyMs: 100, provider: { id: 'provider-a' } },
      ],

      providers: [],
    });

    expect(runStats.providers.map((provider) => provider.provider)).toEqual([
      'provider-a',
      'provider-z',
    ]);
  });

  it('should not classify an assertion miss as a provider failure', () => {
    const runStats = computeRunStats({
      results: [
        {
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          error: 'Expected output to include "approved"',
          latencyMs: 100,
          provider: { id: 'openai:gpt-4' },
          response: { tokenUsage: { total: 10, prompt: 5, completion: 5 } },
        },
      ],

      providers: [createProvider('openai:gpt-4')],
    });

    expect(runStats.providers[0]).toMatchObject({
      requests: 1,
      successes: 1,
      failures: 0,
      successRate: 1,
    });
  });

  it('should detect custom providers', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'my-custom-provider' } },
    ];

    const providers = [createProvider('my-custom-provider')];

    const runStats = computeRunStats({
      results,

      providers,
    });

    expect(runStats.models.hasCustom).toBe(true);
  });

  it('should ignore flattened assert-set aggregate parents in aggregate assertion stats', () => {
    const equalsResult = {
      pass: true,
      score: 1,
      reason: '',
      assertion: { type: 'equals' as const },
      tokensUsed: {
        total: 10,
        prompt: 7,
        completion: 3,
        numRequests: 1,
      },
    };
    const containsResult = {
      pass: false,
      score: 0,
      reason: '',
      assertion: { type: 'contains' as const },
      tokensUsed: {
        total: 12,
        prompt: 8,
        completion: 4,
        numRequests: 1,
      },
    };
    const runStats = computeRunStats({
      results: [
        {
          success: false,
          latencyMs: 100,
          gradingResult: {
            componentResults: [
              {
                pass: false,
                score: 0.5,
                reason: 'Aggregate failed',
                tokensUsed: {
                  total: 22,
                  prompt: 15,
                  completion: 7,
                  numRequests: 2,
                },
                componentResults: [equalsResult, containsResult],
              },
              equalsResult,
              containsResult,
            ],
          },
        },
      ],

      providers: [],
    });

    expect(runStats.assertions).toMatchObject({
      total: 2,
      passed: 1,
      breakdown: [
        { type: 'contains', pass: 0, fail: 1, total: 1, passRate: 0 },
        { type: 'equals', pass: 1, fail: 0, total: 1, passRate: 1 },
      ],
    });
  });

  it('should count zero-millisecond and uncached default responses in aggregate stats', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 0,
        provider: { id: 'openai:gpt-4' },
        response: {},
      },
      {
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: { cached: true },
      },
    ];

    const runStats = computeRunStats({
      results,

      providers: [createProvider('openai:gpt-4')],
    });

    expect(runStats.latency).toMatchObject({
      avgMs: 50,
      p50Ms: 50,
    });
    expect(runStats.cache).toEqual({
      hits: 1,
      misses: 1,
      hitRate: 0.5,
    });
  });

  it('should exclude operational error responses from aggregate cache stats', () => {
    const runStats = computeRunStats({
      results: [
        {
          success: true,
          latencyMs: 10,
          provider: { id: 'openai:gpt-4' },
          response: { cached: false },
        },
        {
          success: false,
          failureReason: ResultFailureReason.ERROR,
          error: '429 Rate limit exceeded',
          latencyMs: 20,
          provider: { id: 'openai:gpt-4' },
          response: { cached: false },
        },
      ],

      providers: [createProvider('openai:gpt-4')],
    });

    expect(runStats.cache).toEqual({
      hits: 0,
      misses: 1,
      hitRate: 0,
    });
  });

  it('should compute equivalent statistics from persisted result batches', async () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: { cached: true },
        gradingResult: {
          componentResults: [{ pass: true, score: 1, reason: '', assertion: { type: 'equals' } }],
        },
      },
      {
        success: false,
        latencyMs: 300,
        provider: { id: 'openai:gpt-4' },
        response: { cached: false },
        error: 'ETIMEDOUT while waiting for provider response',
        failureReason: ResultFailureReason.ERROR,
        gradingResult: {
          componentResults: [
            { pass: false, score: 0, reason: '', assertion: { type: 'contains' } },
          ],
        },
      },
    ];

    const providers = [createProvider('openai:gpt-4')];

    async function* resultBatches() {
      yield results.slice(0, 1);
      yield results.slice(1);
    }

    const batched = await computeRunStatsBatched({
      resultBatches: resultBatches(),

      providers,
    });

    expect(batched.runStats).toEqual(computeRunStats({ results, providers }));
    expect(batched.allProviderStats).toEqual(batched.runStats.providers);
    expect(batched.resultCount).toBe(2);
    expect(batched.hasTimedOutResult).toBe(true);
  });
});
