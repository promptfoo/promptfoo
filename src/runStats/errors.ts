import type { ErrorBreakdown, StatableResult } from './types';

/**
 * Error category type.
 * Note: Uses snake_case to maintain compatibility with existing telemetry data.
 */
export type ErrorCategory =
  | 'timeout'
  | 'rate_limit'
  | 'auth'
  | 'server_error'
  | 'network'
  | 'other';

/**
 * Categorizes an error message into a known category.
 *
 * @param errorMessage - The error message to categorize
 * @returns The error category
 */
export function categorizeError(errorMessage: string): ErrorCategory {
  const errorLower = errorMessage.toLowerCase();

  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return 'timeout';
  }
  if (
    errorLower.includes('rate limit') ||
    errorLower.includes('429') ||
    errorLower.includes('too many requests')
  ) {
    return 'rate_limit';
  }
  if (errorLower.includes('401') || errorLower.includes('403')) {
    return 'auth';
  }
  if (errorLower.includes('500') || errorLower.includes('502') || errorLower.includes('503')) {
    return 'server_error';
  }
  if (
    errorLower.includes('network') ||
    errorLower.includes('econnrefused') ||
    errorLower.includes('enotfound')
  ) {
    return 'network';
  }
  return 'other';
}

/**
 * Computes error statistics from evaluation results.
 *
 * @param results - Array of evaluation results
 * @returns Error stats including total count, types, and breakdown
 */
export function computeErrorStats(results: StatableResult[]): {
  total: number;
  types: string[];
  breakdown: ErrorBreakdown;
} {
  const breakdown: ErrorBreakdown = {
    timeout: 0,
    rate_limit: 0,
    auth: 0,
    server_error: 0,
    network: 0,
    other: 0,
  };

  let total = 0;

  for (const result of results) {
    if (result.error) {
      total++;
      const category = categorizeError(result.error);
      breakdown[category]++;
    }
  }

  // Get list of error types that have non-zero counts
  const types = (Object.keys(breakdown) as ErrorCategory[])
    .filter((key) => breakdown[key] > 0)
    .sort();

  return { total, types, breakdown };
}
