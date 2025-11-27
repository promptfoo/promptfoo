/**
 * Metrics module for evaluation performance analysis.
 *
 * This module provides functions to compute detailed metrics from evaluation results.
 * The computed metrics serve dual purposes:
 *
 * 1. **User-facing**: Exposed via Eval.metrics for visibility into evaluation performance
 * 2. **Telemetry**: Sent to analytics for product improvement
 *
 * By computing metrics once and using them for both purposes, we:
 * - Avoid code duplication
 * - Ensure consistency between user-visible data and telemetry
 * - Keep the core evaluator logic clean
 */

import type { ApiProvider, EvaluateStats } from '../types';
import { computeAssertionMetrics } from './assertions';
import { computeCacheMetrics } from './cache';
import { computeErrorMetrics } from './errors';
import { computeLatencyMetrics } from './latency';
import { computeModelInfo, computeProviderMetrics } from './providers';
import type { EvalMetrics, MetricableResult } from './types';

// Re-export types for consumers
export * from './types';

// Re-export individual functions for granular use
export { computeLatencyMetrics, getPercentile } from './latency';
export { computeCacheMetrics } from './cache';
export { computeErrorMetrics, categorizeError } from './errors';
export { computeProviderMetrics, computeModelInfo } from './providers';
export { computeAssertionMetrics, computeAssertionBreakdown } from './assertions';

/**
 * Input parameters for computing evaluation metrics.
 */
export interface ComputeEvalMetricsInput {
  /** Array of evaluation results (accepts both EvalResult[] and EvaluateResult[]) */
  results: MetricableResult[];
  /** Evaluation statistics (contains token usage) */
  stats: EvaluateStats;
  /** Array of providers used in the evaluation */
  providers: ApiProvider[];
}

/**
 * Computes comprehensive evaluation metrics from results.
 *
 * This is the main entry point for the metrics module. It aggregates all
 * individual metric computations into a single EvalMetrics object.
 *
 * @param input - The evaluation data to compute metrics from
 * @returns Complete evaluation metrics
 *
 * @example
 * ```typescript
 * import { computeEvalMetrics } from './metrics';
 *
 * const metrics = computeEvalMetrics({
 *   results: evalRecord.results,
 *   stats: evaluator.stats,
 *   providers: testSuite.providers,
 * });
 *
 * // Expose to users via the Eval model
 * evalRecord.metrics = metrics;
 *
 * // For telemetry, nested objects must be serialized to JSON strings
 * // since EventProperties only allows primitives and string arrays
 * telemetry.record('eval_ran', {
 *   avgLatencyMs: metrics.latency.avgMs,
 *   cacheHits: metrics.cache.hits,
 *   providerBreakdown: JSON.stringify(metrics.providers),
 *   // ... other fields
 * });
 * ```
 */
export function computeEvalMetrics(input: ComputeEvalMetricsInput): EvalMetrics {
  const { results, stats, providers } = input;

  return {
    latency: computeLatencyMetrics(results),
    cache: computeCacheMetrics(results),
    errors: computeErrorMetrics(results),
    providers: computeProviderMetrics(results),
    assertions: computeAssertionMetrics(results, stats),
    models: computeModelInfo(providers),
  };
}
