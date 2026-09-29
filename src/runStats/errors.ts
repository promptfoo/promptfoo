import { ResultFailureReason } from '../types/index';

import type { StatableResult } from './types';

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
 * Require HTTP/status context instead of matching arbitrary numbers.
 */
const HTTP_STATUS_PATTERNS = {
  timeout: /\b(?:http(?: error| status)?|api error|status(?: code)?)\s*[:=]?\s*(?:408|504)\b/i,
  rate_limit: /\b(?:http(?: error| status)?|api error|status(?: code)?)\s*[:=]?\s*429\b/i,
  auth: /\b(?:http(?: error| status)?|api error|status(?: code)?)\s*[:=]?\s*40[13]\b/i, // 401 or 403
  server_error: /\b(?:http(?: error| status)?|api error|status(?: code)?)\s*[:=]?\s*50[0-3]\b/i, // 500, 501, 502, 503
};

/**
 * Keyword patterns for error categorization.
 */
const ERROR_KEYWORDS = {
  timeout: ['timeout', 'timed out', 'etimedout', 'request timeout', 'exceeded max duration'],
  rate_limit: ['rate limit', 'rate_limit', 'ratelimit', 'too many requests', 'throttl'],
  auth: ['unauthorized', 'forbidden', 'authentication', 'invalid api key', 'invalid_api_key'],
  server_error: ['internal server error', 'bad gateway', 'service unavailable', 'server error'],
  network: ['network', 'econnrefused', 'enotfound', 'econnreset', 'socket hang up', 'dns'],
};

/** Classify provider/grader messages without interpreting stack frames as HTTP statuses. */
export function categorizeError(errorMessage: string): ErrorCategory {
  const message = errorMessage
    .split('\n')
    .filter((line) => !/^\s*at\s/.test(line))
    .join('\n');
  const errorLower = message.toLowerCase();

  // Check timeout first (highest priority for user-facing issues)
  if (ERROR_KEYWORDS.timeout.some((kw) => errorLower.includes(kw))) {
    return 'timeout';
  }

  if (HTTP_STATUS_PATTERNS.timeout.test(message)) {
    return 'timeout';
  }

  // Check rate limiting
  if (
    HTTP_STATUS_PATTERNS.rate_limit.test(message) ||
    ERROR_KEYWORDS.rate_limit.some((kw) => errorLower.includes(kw))
  ) {
    return 'rate_limit';
  }

  // Check auth errors
  if (
    HTTP_STATUS_PATTERNS.auth.test(message) ||
    ERROR_KEYWORDS.auth.some((kw) => errorLower.includes(kw))
  ) {
    return 'auth';
  }

  // Check server errors
  if (
    HTTP_STATUS_PATTERNS.server_error.test(message) ||
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

export function isOperationalError(
  result: Pick<StatableResult, 'error' | 'failureReason'>,
): boolean {
  if (!result.error) {
    return false;
  }
  if (result.failureReason === undefined) {
    return true;
  }
  return result.failureReason === ResultFailureReason.ERROR;
}
