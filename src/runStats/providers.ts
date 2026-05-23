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
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

/**
 * Computes per-provider performance statistics from evaluation results.
 *
 * Includes request counts, success rates, latency, and result-scoped token usage.
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
  const accumulators = new Map<string, ProviderAccumulator>();

  for (const result of results) {
    const providerId = result.provider?.id || 'unknown';

    if (!accumulators.has(providerId)) {
      accumulators.set(providerId, {
        requests: 0,
        successes: 0,
        failures: 0,
        totalLatencyMs: 0,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
      });
    }

    const acc = accumulators.get(providerId)!;
    acc.requests++;

    if (result.success) {
      acc.successes++;
    } else {
      acc.failures++;
    }

    acc.totalLatencyMs += result.latencyMs || 0;
    acc.totalTokens += result.response?.tokenUsage?.total || 0;
    acc.promptTokens += result.response?.tokenUsage?.prompt || 0;
    acc.completionTokens += result.response?.tokenUsage?.completion || 0;
    acc.cachedTokens += result.response?.tokenUsage?.cached || 0;
  }

  return Array.from(accumulators.entries())
    .map(([provider, acc]): ProviderStats => {
      return {
        provider,
        requests: acc.requests,
        successes: acc.successes,
        failures: acc.failures,
        successRate: acc.requests > 0 ? acc.successes / acc.requests : 0,
        avgLatencyMs: acc.requests > 0 ? Math.round(acc.totalLatencyMs / acc.requests) : 0,
        totalTokens: acc.totalTokens,
        promptTokens: acc.promptTokens,
        completionTokens: acc.completionTokens,
        cachedTokens: acc.cachedTokens,
        tokensPerRequest: acc.requests > 0 ? Math.round(acc.totalTokens / acc.requests) : 0,
        cacheRate: acc.totalTokens > 0 ? acc.cachedTokens / acc.totalTokens : 0,
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
