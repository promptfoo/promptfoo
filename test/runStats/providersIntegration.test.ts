import { describe, expect, it } from 'vitest';
import { computeProviderStats } from '../../src/runStats/providers';

import type { StatableResult } from '../../src/runStats/types';

describe('computeProviderStats token usage isolation', () => {
  it('aggregates token usage from result responses for each provider', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: { tokenUsage: { total: 400, prompt: 300, completion: 100, cached: 40 } },
      },
      {
        success: true,
        latencyMs: 200,
        provider: { id: 'openai:gpt-4' },
        response: { tokenUsage: { total: 600, prompt: 500, completion: 100, cached: 60 } },
      },
      {
        success: true,
        latencyMs: 200,
        provider: { id: 'anthropic:claude-3' },
        response: { tokenUsage: { total: 500, prompt: 400, completion: 100, cached: 0 } },
      },
    ];

    const stats = computeProviderStats(results);
    const openaiStats = stats.find((stat) => stat.provider === 'openai:gpt-4');
    const anthropicStats = stats.find((stat) => stat.provider === 'anthropic:claude-3');

    expect(openaiStats).toMatchObject({
      requests: 2,
      totalTokens: 1000,
      promptTokens: 800,
      completionTokens: 200,
      cachedTokens: 100,
      tokensPerRequest: 500,
      cacheRate: 0.1,
    });
    expect(anthropicStats).toMatchObject({
      requests: 1,
      totalTokens: 500,
      promptTokens: 400,
      completionTokens: 100,
      cachedTokens: 0,
    });
  });

  it('does not leak token totals between evaluation result sets', () => {
    const firstRun = computeProviderStats([
      {
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: { tokenUsage: { total: 1000, prompt: 800, completion: 200, cached: 100 } },
      },
    ]);
    const secondRun = computeProviderStats([
      {
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: { tokenUsage: { total: 7, prompt: 4, completion: 3, cached: 0 } },
      },
    ]);

    expect(firstRun[0].totalTokens).toBe(1000);
    expect(secondRun[0].totalTokens).toBe(7);
  });

  it('returns zero token totals when responses have no usage', () => {
    const stats = computeProviderStats([
      { success: true, latencyMs: 100, provider: { id: 'some-provider' } },
    ]);

    expect(stats[0]).toMatchObject({
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      tokensPerRequest: 0,
      cacheRate: 0,
    });
  });
});
