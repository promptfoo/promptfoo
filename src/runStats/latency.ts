import type { LatencyStats, StatableResult } from './types';

/**
 * Computes a percentile value using linear interpolation (PERCENTILE.INC method).
 * This gives distinct values for p95/p99 even with small sample sizes.
 *
 * @param sortedArr - Pre-sorted array of numbers (ascending)
 * @param p - Percentile to compute (0-1)
 * @returns The interpolated percentile value
 */
export function getPercentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) {
    return 0;
  }
  if (sortedArr.length === 1) {
    return sortedArr[0];
  }
  const rank = p * (sortedArr.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sortedArr[lower];
  }
  const fraction = rank - lower;
  return sortedArr[lower] + fraction * (sortedArr[upper] - sortedArr[lower]);
}

/**
 * Computes latency distribution statistics from evaluation results.
 *
 * @param results - Array of evaluation results
 * @returns Latency stats including average and percentiles
 */
export function computeLatencyStats(results: StatableResult[]): LatencyStats {
  const latencies = results
    .map((r) => r.latencyMs)
    .filter((l): l is number => l !== undefined && l > 0)
    .sort((a, b) => a - b);

  const totalLatency = latencies.reduce((sum, l) => sum + l, 0);
  const avgMs = latencies.length > 0 ? totalLatency / latencies.length : 0;

  return {
    avgMs: Math.round(avgMs),
    p50Ms: Math.round(getPercentile(latencies, 0.5)),
    p95Ms: Math.round(getPercentile(latencies, 0.95)),
    p99Ms: Math.round(getPercentile(latencies, 0.99)),
  };
}
