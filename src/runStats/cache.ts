import type { CacheStats, StatableResult } from './types';

/**
 * Computes cache effectiveness statistics from evaluation results.
 *
 * Only counts results that have responses (excludes errors).
 *
 * @param results - Array of evaluation results
 * @returns Cache stats including hits, misses, and hit rate
 */
export function computeCacheStats(results: StatableResult[]): CacheStats {
  const hits = results.filter((r) => r.response?.cached).length;
  const misses = results.filter((r) => r.response && !r.response.cached).length;
  const total = hits + misses;

  return {
    hits,
    misses,
    hitRate: total > 0 ? hits / total : null,
  };
}
