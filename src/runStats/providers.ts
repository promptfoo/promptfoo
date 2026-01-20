import { TokenUsageTracker } from '../util/tokenUsage';

import type { ApiProvider } from '../types/index';
import type { ProviderStats, StatableResult } from './types';

/**
 * Internal accumulator for per-provider stats during computation.
 */
interface ProviderAccumulator {
  requests: number;
  successes: number;
  failures: number;
  totalLatencyMs: number;
}

/**
 * Computes per-provider performance statistics from evaluation results.
 *
 * Includes request counts, success rates, latency, and token usage from TokenUsageTracker.
 *
 * @param results - Array of evaluation results
 * @param maxProviders - Maximum number of providers to return (default 10)
 * @returns Array of provider stats sorted by request count
 */
export function computeProviderStats(
  results: StatableResult[],
  maxProviders: number = 10,
): ProviderStats[] {
  // Accumulate stats per provider
  const accumulators: Record<string, ProviderAccumulator> = {};

  for (const result of results) {
    const providerId = result.provider?.id || 'unknown';

    if (!accumulators[providerId]) {
      accumulators[providerId] = {
        requests: 0,
        successes: 0,
        failures: 0,
        totalLatencyMs: 0,
      };
    }

    const acc = accumulators[providerId];
    acc.requests++;

    if (result.success) {
      acc.successes++;
    } else {
      acc.failures++;
    }

    acc.totalLatencyMs += result.latencyMs || 0;
  }

  // Convert to ProviderStats array with token usage
  const tracker = TokenUsageTracker.getInstance();

  return Object.entries(accumulators)
    .map(([provider, acc]): ProviderStats => {
      const usage = tracker.getProviderUsage(provider);
      const totalTokens = usage?.total || 0;
      const promptTokens = usage?.prompt || 0;
      const completionTokens = usage?.completion || 0;
      const cachedTokens = usage?.cached || 0;

      return {
        provider,
        requests: acc.requests,
        successes: acc.successes,
        failures: acc.failures,
        successRate: acc.requests > 0 ? acc.successes / acc.requests : 0,
        avgLatencyMs: acc.requests > 0 ? Math.round(acc.totalLatencyMs / acc.requests) : 0,
        totalTokens,
        promptTokens,
        completionTokens,
        cachedTokens,
        tokensPerRequest: acc.requests > 0 ? Math.round(totalTokens / acc.requests) : 0,
        cacheRate: totalTokens > 0 ? cachedTokens / totalTokens : 0,
      };
    })
    .sort((a, b) => b.requests - a.requests)
    .slice(0, maxProviders);
}

/**
 * Extracts model identification information from providers.
 *
 * @param providers - Array of API providers
 * @returns Model identification object
 */
export function computeModelInfo(providers: ApiProvider[]): {
  ids: string[];
  isComparison: boolean;
  hasCustom: boolean;
} {
  const ids = Array.from(new Set(providers.map((p) => p.id()))).sort();

  // It's a comparison if there are multiple providers with different IDs
  const isComparison = providers.length > 1 && new Set(providers.map((p) => p.id())).size > 1;

  // Check for custom/unknown providers (no colon in ID or 'unknown' prefix)
  const providerPrefixes = providers.map((p) => {
    const idParts = p.id().split(':');
    return idParts.length > 1 ? idParts[0] : 'unknown';
  });
  const hasCustom =
    providerPrefixes.includes('unknown') || providers.some((p) => !p.id().includes(':'));

  return { ids, isComparison, hasCustom };
}
