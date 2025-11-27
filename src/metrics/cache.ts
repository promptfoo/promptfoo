import type { CacheMetrics, MetricableResult } from './types';

/**
 * Computes cache effectiveness metrics from evaluation results.
 *
 * Only counts results that have responses (excludes errors).
 *
 * @param results - Array of evaluation results
 * @returns Cache metrics including hits, misses, and hit rate
 */
export function computeCacheMetrics(results: MetricableResult[]): CacheMetrics {
  const hits = results.filter((r) => r.response?.cached).length;
  const misses = results.filter((r) => r.response && !r.response.cached).length;
  const total = hits + misses;

  return {
    hits,
    misses,
    hitRate: total > 0 ? hits / total : null,
  };
}
