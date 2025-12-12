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
 * HTTP status code patterns for error categorization.
 * Uses word boundaries to avoid false positives (e.g., "401k" shouldn't match auth errors).
 */
const HTTP_STATUS_PATTERNS = {
  rate_limit: /\b429\b/,
  auth: /\b40[13]\b/, // 401 or 403
  server_error: /\b50[0-3]\b/, // 500, 501, 502, 503
};

/**
 * Keyword patterns for error categorization.
 */
const ERROR_KEYWORDS = {
  timeout: ['timeout', 'timed out', 'etimedout', 'request timeout'],
  rate_limit: ['rate limit', 'rate_limit', 'ratelimit', 'too many requests', 'throttl'],
  auth: ['unauthorized', 'forbidden', 'authentication', 'invalid api key', 'invalid_api_key'],
  server_error: ['internal server error', 'bad gateway', 'service unavailable', 'server error'],
  network: ['network', 'econnrefused', 'enotfound', 'econnreset', 'socket hang up', 'dns'],
};

/**
 * Categorizes an error message into a known category.
 *
 * Uses a combination of HTTP status code patterns and keyword matching.
 * Status codes are matched with word boundaries to avoid false positives
 * (e.g., "401k" won't match as an auth error).
 *
 * @param errorMessage - The error message to categorize
 * @returns The error category
 */
export function categorizeError(errorMessage: string): ErrorCategory {
  const errorLower = errorMessage.toLowerCase();

  // Check timeout first (highest priority for user-facing issues)
  if (ERROR_KEYWORDS.timeout.some((kw) => errorLower.includes(kw))) {
    return 'timeout';
  }

  // Check rate limiting
  if (
    HTTP_STATUS_PATTERNS.rate_limit.test(errorMessage) ||
    ERROR_KEYWORDS.rate_limit.some((kw) => errorLower.includes(kw))
  ) {
    return 'rate_limit';
  }

  // Check auth errors
  if (
    HTTP_STATUS_PATTERNS.auth.test(errorMessage) ||
    ERROR_KEYWORDS.auth.some((kw) => errorLower.includes(kw))
  ) {
    return 'auth';
  }

  // Check server errors
  if (
    HTTP_STATUS_PATTERNS.server_error.test(errorMessage) ||
    ERROR_KEYWORDS.server_error.some((kw) => errorLower.includes(kw))
  ) {
    return 'server_error';
  }

  // Check network errors
  if (ERROR_KEYWORDS.network.some((kw) => errorLower.includes(kw))) {
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
