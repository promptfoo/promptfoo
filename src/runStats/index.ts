/**
 * Run statistics module for evaluation performance analysis.
 *
 * This module provides functions to compute detailed statistics from evaluation results.
 * These stats provide visibility into evaluation performance - latency distribution,
 * cache effectiveness, error breakdowns, and per-provider performance.
 */

import { RunStatsAccumulator } from './accumulator';

import type { ApiProvider, EvaluateStats } from '../types/index';
import type { EvalRunStats, ProviderStats, StatableResult } from './types';

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

export interface ComputeRunStatsBatchedInput {
  /** Result batches read from a persisted evaluation. */
  resultBatches: AsyncIterable<StatableResult[]>;
  /** Evaluation statistics (contains token usage). */
  stats: EvaluateStats;
  /** Array of providers used in the evaluation. */
  providers: ApiProvider[];
}

export interface ComputeRunStatsBatchedResult {
  runStats: EvalRunStats;
  allProviderStats: ProviderStats[];
  resultCount: number;
  hasTimedOutResult: boolean;
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
  const accumulator = new RunStatsAccumulator();
  accumulator.addResults(results);

  return accumulator.toRunStats(stats, providers);
}

/**
 * Computes run statistics without materializing persisted result rows in memory.
 *
 * The accumulator retains latency values for exact percentiles while folding
 * cache, error, assertion, and provider metrics into bounded counters.
 */
export async function computeRunStatsBatched(
  input: ComputeRunStatsBatchedInput,
): Promise<ComputeRunStatsBatchedResult> {
  const { resultBatches, stats, providers } = input;
  const accumulator = new RunStatsAccumulator();

  for await (const batch of resultBatches) {
    accumulator.addResults(batch);
  }

  return {
    runStats: accumulator.toRunStats(stats, providers),
    allProviderStats: accumulator.getProviderStats(),
    resultCount: accumulator.resultCount,
    hasTimedOutResult: accumulator.hasTimedOutResult,
  };
}
