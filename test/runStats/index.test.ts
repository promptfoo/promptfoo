import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeRunStats } from '../../src/runStats/index';
import type { StatableResult } from '../../src/runStats/types';
import type { ApiProvider, EvaluateStats } from '../../src/types/index';
import { TokenUsageTracker } from '../../src/util/tokenUsage';

// Mock TokenUsageTracker
vi.mock('../../src/util/tokenUsage', () => ({
  TokenUsageTracker: {
    getInstance: vi.fn(),
  },
}));

describe('computeRunStats', () => {
  const mockTracker = {
    getProviderUsage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(TokenUsageTracker.getInstance).mockReturnValue(mockTracker as any);
    mockTracker.getProviderUsage.mockReturnValue(null);
  });

  const createStats = (overrides?: Partial<EvaluateStats>): EvaluateStats =>
    ({
      successes: 0,
      failures: 0,
      errors: 0,
      tokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
      },
      ...overrides,
    }) as EvaluateStats;

  const createProvider = (id: string): ApiProvider =>
    ({
      id: () => id,
    }) as ApiProvider;

  it('should compute all stats for empty input', () => {
    const runStats = computeRunStats({
      results: [],
      stats: createStats(),
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
        tokenUsage: {
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          numRequests: 0,
          reasoningTokens: 0,
        },
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

    const stats = createStats({
      successes: 2,
      failures: 1,
      errors: 0,
      tokenUsage: {
        total: 1000,
        prompt: 800,
        completion: 200,
        cached: 100,
        numRequests: 3,
      },
    } as any);

    const providers = [createProvider('openai:gpt-4')];

    const runStats = computeRunStats({ results, stats, providers });

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
      stats: createStats(),
      providers,
    });

    expect(runStats.models.isComparison).toBe(true);
    expect(runStats.models.ids).toEqual(['anthropic:claude-3', 'openai:gpt-4']);
  });

  it('should handle results with all errors', () => {
    const results: StatableResult[] = [
      { success: false, latencyMs: 100, error: 'Timeout error', provider: { id: 'openai:gpt-4' } },
      { success: false, latencyMs: 200, error: '429 Rate limit', provider: { id: 'openai:gpt-4' } },
    ];

    const providers = [createProvider('openai:gpt-4')];

    const runStats = computeRunStats({
      results,
      stats: createStats(),
      providers,
    });

    expect(runStats.errors.total).toBe(2);
    expect(runStats.errors.breakdown.timeout).toBe(1);
    expect(runStats.errors.breakdown.rate_limit).toBe(1);
    expect(runStats.cache.hitRate).toBeNull(); // No successful responses
  });

  it('should compute provider stats with token usage', () => {
    mockTracker.getProviderUsage.mockReturnValue({
      total: 500,
      prompt: 400,
      completion: 100,
      cached: 50,
    });

    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
    ];

    const providers = [createProvider('openai:gpt-4')];

    const runStats = computeRunStats({
      results,
      stats: createStats(),
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

  it('should detect custom providers', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'my-custom-provider' } },
    ];

    const providers = [createProvider('my-custom-provider')];

    const runStats = computeRunStats({
      results,
      stats: createStats(),
      providers,
    });

    expect(runStats.models.hasCustom).toBe(true);
  });

  it('should extract assertion token usage from stats', () => {
    const evalStats = createStats({
      tokenUsage: {
        total: 1000,
        prompt: 800,
        completion: 200,
        cached: 100,
        numRequests: 5,
        assertions: {
          total: 300,
          prompt: 200,
          completion: 100,
          cached: 25,
          numRequests: 2,
          completionDetails: {
            reasoning: 10,
          },
        },
      },
    } as any);

    const runStats = computeRunStats({
      results: [],
      stats: evalStats,
      providers: [],
    });

    expect(runStats.assertions.tokenUsage).toEqual({
      totalTokens: 300,
      promptTokens: 200,
      completionTokens: 100,
      cachedTokens: 25,
      numRequests: 2,
      reasoningTokens: 10,
    });
  });
});
