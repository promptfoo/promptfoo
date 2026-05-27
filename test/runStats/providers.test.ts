import { describe, expect, it } from 'vitest';
import { computeModelInfo, computeProviderStats } from '../../src/runStats/providers';
import { type ApiProvider, ResultFailureReason } from '../../src/types/index';

import type { StatableResult } from '../../src/runStats/types';

describe('computeProviderStats', () => {
  it('should return empty array for empty results', () => {
    const stats = computeProviderStats([]);
    expect(stats).toEqual([]);
  });

  it('should safely aggregate provider ids that overlap object prototype keys', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: '__proto__' } },
      {
        success: false,
        failureReason: ResultFailureReason.ERROR,
        error: 'Provider request failed',
        latencyMs: 200,
        provider: { id: 'constructor' },
      },
    ];
    const stats = computeProviderStats(results);
    expect(stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: '__proto__', requests: 1, successes: 1 }),
        expect.objectContaining({ provider: 'constructor', requests: 1, failures: 1 }),
      ]),
    );
  });

  it('should compute basic stats per provider', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
      { success: true, latencyMs: 200, provider: { id: 'openai:gpt-4' } },
      {
        success: false,
        failureReason: ResultFailureReason.ERROR,
        error: 'Provider request failed',
        latencyMs: 50,
        provider: { id: 'openai:gpt-4' },
      },
    ];

    const stats = computeProviderStats(results);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      provider: 'openai:gpt-4',
      requests: 3,
      successes: 2,
      failures: 1,
      successRate: 2 / 3,
      avgLatencyMs: 117, // (100+200+50)/3 = 116.67 rounded
    });
  });

  it('should count assertion failures as successful provider requests', () => {
    const stats = computeProviderStats([
      {
        success: false,
        failureReason: ResultFailureReason.ASSERT,
        error: 'Expected output to contain "safe"',
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: { tokenUsage: { total: 4, prompt: 2, completion: 2 } },
      },
    ]);

    expect(stats[0]).toMatchObject({
      requests: 1,
      successes: 1,
      failures: 0,
      successRate: 1,
    });
  });

  it('should handle multiple providers', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
      { success: true, latencyMs: 200, provider: { id: 'anthropic:claude-3' } },
      { success: true, latencyMs: 150, provider: { id: 'openai:gpt-4' } },
    ];

    const stats = computeProviderStats(results);
    expect(stats).toHaveLength(2);
    // Should be sorted by request count
    expect(stats[0].provider).toBe('openai:gpt-4');
    expect(stats[0].requests).toBe(2);
    expect(stats[1].provider).toBe('anthropic:claude-3');
    expect(stats[1].requests).toBe(1);
  });

  it('should sort providers with equal request counts by provider id', () => {
    const stats = computeProviderStats([
      { success: true, latencyMs: 100, provider: { id: 'provider-z' } },
      { success: true, latencyMs: 100, provider: { id: 'provider-a' } },
    ]);

    expect(stats.map((stat) => stat.provider)).toEqual(['provider-a', 'provider-z']);
  });

  it('should use "unknown" for missing provider id', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 200, provider: {} },
    ];

    const stats = computeProviderStats(results);
    expect(stats).toHaveLength(1);
    expect(stats[0].provider).toBe('unknown');
    expect(stats[0].requests).toBe(2);
  });

  it('should include token usage from result responses', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: { tokenUsage: { total: 400, prompt: 300, completion: 100, cached: 20 } },
      },
      {
        success: true,
        latencyMs: 200,
        provider: { id: 'openai:gpt-4' },
        response: { tokenUsage: { total: 600, prompt: 500, completion: 100, cached: 80 } },
      },
    ];

    const stats = computeProviderStats(results);
    expect(stats[0]).toMatchObject({
      totalTokens: 1000,
      promptTokens: 800,
      completionTokens: 200,
      cachedTokens: 100,
      tokensPerRequest: 500, // 1000/2
      cacheRate: 0.1, // 100/1000
    });
  });

  it('should limit to maxProviders', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'provider-a' } },
      { success: true, latencyMs: 100, provider: { id: 'provider-b' } },
      { success: true, latencyMs: 100, provider: { id: 'provider-c' } },
    ];

    const stats = computeProviderStats(results, 2);
    expect(stats).toHaveLength(2);
  });

  it('should handle zero tokens gracefully', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
    ];

    const stats = computeProviderStats(results);
    expect(stats[0].cacheRate).toBe(0);
    expect(stats[0].tokensPerRequest).toBe(0);
  });

  it('should handle undefined latencyMs', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: undefined as unknown as number,
        provider: { id: 'openai:gpt-4' },
      },
      { success: true, latencyMs: 200, provider: { id: 'openai:gpt-4' } },
    ];

    const stats = computeProviderStats(results);
    expect(stats[0].avgLatencyMs).toBe(100); // (0+200)/2
  });

  it('should sort by request count descending', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'provider-a' } },
      { success: true, latencyMs: 100, provider: { id: 'provider-b' } },
      { success: true, latencyMs: 100, provider: { id: 'provider-b' } },
      { success: true, latencyMs: 100, provider: { id: 'provider-b' } },
      { success: true, latencyMs: 100, provider: { id: 'provider-c' } },
      { success: true, latencyMs: 100, provider: { id: 'provider-c' } },
    ];

    const stats = computeProviderStats(results);
    expect(stats[0].provider).toBe('provider-b'); // 3 requests
    expect(stats[1].provider).toBe('provider-c'); // 2 requests
    expect(stats[2].provider).toBe('provider-a'); // 1 request
  });
});

describe('computeModelInfo', () => {
  const createProvider = (id: string): ApiProvider =>
    ({
      id: () => id,
    }) as ApiProvider;

  it('should return empty arrays for empty providers', () => {
    const info = computeModelInfo([]);
    expect(info).toEqual({
      ids: [],
      isComparison: false,
      hasCustom: false,
    });
  });

  it('should extract unique sorted model ids', () => {
    const providers = [
      createProvider('openai:gpt-4'),
      createProvider('anthropic:claude-3'),
      createProvider('openai:gpt-4'), // duplicate
    ];
    const info = computeModelInfo(providers);
    expect(info.ids).toEqual(['anthropic:claude-3', 'openai:gpt-4']);
  });

  it('should detect model comparison (multiple different models)', () => {
    const providers = [createProvider('openai:gpt-4'), createProvider('anthropic:claude-3')];
    const info = computeModelInfo(providers);
    expect(info.isComparison).toBe(true);
  });

  it('should not flag as comparison when same model used multiple times', () => {
    const providers = [createProvider('openai:gpt-4'), createProvider('openai:gpt-4')];
    const info = computeModelInfo(providers);
    expect(info.isComparison).toBe(false);
  });

  it('should not flag single provider as comparison', () => {
    const providers = [createProvider('openai:gpt-4')];
    const info = computeModelInfo(providers);
    expect(info.isComparison).toBe(false);
  });

  it('should detect custom providers (no colon in id)', () => {
    const providers = [createProvider('my-custom-provider')];
    const info = computeModelInfo(providers);
    expect(info.hasCustom).toBe(true);
  });

  it('should detect unknown prefix as custom', () => {
    const providers = [createProvider('unknown:something')];
    const info = computeModelInfo(providers);
    expect(info.hasCustom).toBe(true);
  });

  it('should detect endpoint-backed and executable providers as custom', () => {
    const providers = [
      createProvider('python:/Users/acme/private/grader.py:default'),
      createProvider('sagemaker:jumpstart:private-endpoint'),
      createProvider('azure:chat:private-deployment'),
      createProvider('internal:private-model'),
    ];
    const info = computeModelInfo(providers);
    expect(info.hasCustom).toBe(true);
  });

  it('should retain custom classification for already redacted provider buckets', () => {
    const info = computeModelInfo([createProvider('python:custom')]);

    expect(info.hasCustom).toBe(true);
  });

  it('should not flag standard providers as custom', () => {
    const providers = [
      createProvider('openai:gpt-4'),
      createProvider('anthropic:claude-3'),
      createProvider('openrouter:openai/gpt-5.4'),
    ];
    const info = computeModelInfo(providers);
    expect(info.hasCustom).toBe(false);
  });

  it('should handle mixed standard and custom providers', () => {
    const providers = [
      createProvider('openai:gpt-4'),
      createProvider('my-custom-provider'),
      createProvider('anthropic:claude-3'),
    ];
    const info = computeModelInfo(providers);
    expect(info.hasCustom).toBe(true);
    expect(info.isComparison).toBe(true);
    expect(info.ids).toContain('my-custom-provider');
  });
});
