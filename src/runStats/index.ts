/**
 * Run statistics module for evaluation performance analysis.
 *
 * This module provides functions to compute detailed statistics from evaluation results.
 * These stats provide visibility into evaluation performance - latency distribution,
 * cache effectiveness, error breakdowns, and per-provider performance.
 */

import { computeAssertionStats } from './assertions';
import { computeCacheStats } from './cache';
import { computeErrorStats } from './errors';
import { computeLatencyStats } from './latency';
import { computeModelInfo, computeProviderStats } from './providers';

import type { ApiProvider, EvaluateStats } from '../types/index';
import type { EvalRunStats, StatableResult } from './types';

export { computeAssertionBreakdown, computeAssertionStats } from './assertions';
export { computeCacheStats } from './cache';
export { categorizeError, computeErrorStats } from './errors';
// Re-export individual functions for granular use
export { computeLatencyStats, getPercentile } from './latency';
export { computeModelInfo, computeProviderStats } from './providers';
// Re-export types for consumers
export * from './types';

/**
 * Input parameters for computing run statistics.
 */
export interface ComputeRunStatsInput {
  /** Array of evaluation results (accepts both EvalResult[] and EvaluateResult[]) */
  results: StatableResult[];
  /** Evaluation statistics (contains token usage) */
  stats: EvaluateStats;
  /** Array of providers used in the evaluation */
  providers: ApiProvider[];
}

/**
 * Computes comprehensive run statistics from evaluation results.
 *
 * This is the main entry point for the runStats module. It aggregates all
 * individual stat computations into a single EvalRunStats object.
 *
 * @param input - The evaluation data to compute stats from
 * @returns Complete evaluation run statistics
 *
 * @example
 * ```typescript
 * import { computeRunStats } from './runStats';
 *
 * const runStats = computeRunStats({
 *   results: evalRecord.results,
 *   stats: evaluator.stats,
 *   providers: testSuite.providers,
 * });
 *
 * // Expose to users via the Eval model
 * evalRecord.runStats = runStats;
 *
 * console.log(runStats.latency.p95Ms); // 95th percentile latency
 * console.log(runStats.cache.hitRate); // Cache hit rate
 * ```
 */
export function computeRunStats(input: ComputeRunStatsInput): EvalRunStats {
  const { results, stats, providers } = input;

  return {
    latency: computeLatencyStats(results),
    cache: computeCacheStats(results),
    errors: computeErrorStats(results),
    providers: computeProviderStats(results),
    assertions: computeAssertionStats(results, stats),
    models: computeModelInfo(providers),
  };
}
