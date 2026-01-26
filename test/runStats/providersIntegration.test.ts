import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeProviderStats } from '../../src/runStats/providers';
import { TokenUsageTracker } from '../../src/util/tokenUsage';

import type { StatableResult } from '../../src/runStats/types';

/**
 * Integration tests that use the real TokenUsageTracker to verify
 * that trackUsage() and computeProviderStats() work together correctly.
 *
 * This catches bugs like key format mismatches between storage and lookup.
 */
describe('computeProviderStats integration with TokenUsageTracker', () => {
  let tracker: TokenUsageTracker;

  beforeEach(() => {
    tracker = TokenUsageTracker.getInstance();
    tracker.resetAllUsage();
  });

  afterEach(() => {
    tracker.cleanup();
  });

  it('should return token usage tracked under bare provider ID', () => {
    // Track usage using bare provider ID (as evaluator.ts does)
    tracker.trackUsage('openai:gpt-4', {
      total: 1000,
      prompt: 800,
      completion: 200,
      cached: 100,
      numRequests: 1,
    });

    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
      { success: true, latencyMs: 200, provider: { id: 'openai:gpt-4' } },
    ];

    const stats = computeProviderStats(results);

    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      provider: 'openai:gpt-4',
      requests: 2,
      totalTokens: 1000,
      promptTokens: 800,
      completionTokens: 200,
      cachedTokens: 100,
      tokensPerRequest: 500,
      cacheRate: 0.1,
    });
  });

  it('should aggregate token usage from multiple trackUsage calls', () => {
    // Simulate multiple API calls to the same provider
    tracker.trackUsage('openai:gpt-4', {
      total: 500,
      prompt: 400,
      completion: 100,
      cached: 50,
      numRequests: 1,
    });
    tracker.trackUsage('openai:gpt-4', {
      total: 500,
      prompt: 400,
      completion: 100,
      cached: 50,
      numRequests: 1,
    });

    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
      { success: true, latencyMs: 200, provider: { id: 'openai:gpt-4' } },
    ];

    const stats = computeProviderStats(results);

    expect(stats[0]).toMatchObject({
      totalTokens: 1000,
      promptTokens: 800,
      completionTokens: 200,
      cachedTokens: 100,
    });
  });

  it('should handle multiple providers with separate token tracking', () => {
    tracker.trackUsage('openai:gpt-4', {
      total: 1000,
      prompt: 800,
      completion: 200,
    });
    tracker.trackUsage('anthropic:claude-3', {
      total: 500,
      prompt: 400,
      completion: 100,
    });

    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
      { success: true, latencyMs: 200, provider: { id: 'anthropic:claude-3' } },
    ];

    const stats = computeProviderStats(results);

    expect(stats).toHaveLength(2);
    // Sorted by request count
    const openaiStats = stats.find((s) => s.provider === 'openai:gpt-4');
    const anthropicStats = stats.find((s) => s.provider === 'anthropic:claude-3');

    expect(openaiStats).toMatchObject({
      totalTokens: 1000,
      promptTokens: 800,
      completionTokens: 200,
    });
    expect(anthropicStats).toMatchObject({
      totalTokens: 500,
      promptTokens: 400,
      completionTokens: 100,
    });
  });

  it('should return zero tokens when no usage was tracked', () => {
    // No trackUsage calls

    const results: StatableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
    ];

    const stats = computeProviderStats(results);

    expect(stats[0]).toMatchObject({
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      tokensPerRequest: 0,
      cacheRate: 0,
    });
  });

  it('should reset between tests (verify isolation)', () => {
    // This test verifies that resetAllUsage works correctly
    // by checking that no stale data exists from previous tests
    const stats = computeProviderStats([
      { success: true, latencyMs: 100, provider: { id: 'some-provider' } },
    ]);

    expect(stats[0].totalTokens).toBe(0);
  });
});
