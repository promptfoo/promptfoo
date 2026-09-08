import { isHttpRateLimitError, isTransientConnectionError } from '../util/fetch/errors';

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number; // 0-1, adds randomness to prevent thundering herd
  retryAllServerErrors?: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  jitterFactor: 0.2,
};

/**
 * Calculate delay for retry attempt.
 * Prefers server-specified Retry-After when available.
 */
export function getRetryDelay(
  attempt: number,
  policy: RetryPolicy,
  serverRetryAfterMs?: number,
): number {
  // If server specified retry-after, use it (with jitter)
  // Note: serverRetryAfterMs = 0 means "retry immediately"
  if (serverRetryAfterMs !== undefined && serverRetryAfterMs >= 0) {
    if (serverRetryAfterMs === 0) {
      return 0; // Immediate retry
    }
    const jitter = serverRetryAfterMs * policy.jitterFactor * Math.random();
    return Math.min(serverRetryAfterMs + jitter, policy.maxDelayMs);
  }

  // Exponential backoff with jitter
  const exponentialDelay = policy.baseDelayMs * Math.pow(2, attempt);
  const jitter = exponentialDelay * policy.jitterFactor * Math.random();
  return Math.min(exponentialDelay + jitter, policy.maxDelayMs);
}

/**
 * Determine if we should retry a failed request.
 */
export function shouldRetry(
  attempt: number,
  error: Error | undefined,
  isRateLimited: boolean,
  policy: RetryPolicy,
): boolean {
  if (attempt >= policy.maxRetries) {
    return false;
  }

  // Hard quotas (insufficient_quota, billing_hard_limit_reached, …) won't
  // resolve on retry — retrying just amplifies load against an exhausted
  // account. The transport already fails fast, but isRateLimited may
  // still be true via substring match, so check the structured signal
  // before the rate-limit retry path.
  if (isHttpRateLimitError(error) && error.kind === 'quota') {
    return false;
  }

  // Always retry rate limits (up to max)
  if (isRateLimited) {
    return true;
  }

  // Retry transient errors.
  // isTransientConnectionError covers TLS/socket-level failures (bad record
  // mac, EPROTO, ECONNRESET, socket hang up).  The inline patterns below
  // cover higher-level transient failures (DNS, HTTP status codes, timeouts)
  // that are distinct from those low-level connection errors.
  if (error) {
    const message = (error.message ?? '').toLowerCase();
    const httpError = message.match(
      /\b(?:https?|(?:status\s+)?code|status|(?:api(?:\s+call)?|server)\s+error)\s*[:=]?\s*(?:[a-z]+_error\s+)?(\d{3})\b([\s\S]*)/,
    );
    const httpStatus = httpError?.[1];

    if (httpStatus) {
      if (policy.retryAllServerErrors === true && httpStatus.startsWith('5')) {
        return true;
      }

      const expectedStatusText: Record<string, string> = {
        '502': 'bad gateway',
        '503': 'service unavailable',
        '504': 'gateway timeout',
        '524': 'timeout',
      };
      const expectedText = expectedStatusText[httpStatus];
      const statusText = httpError[2].trim();
      return expectedText !== undefined && (!statusText || statusText.includes(expectedText));
    }

    return (
      isTransientConnectionError(error) ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('econnrefused') ||
      message.includes('network') ||
      /\b(?:enotfound|eai_again|epipe)\b/.test(message)
    );
  }

  return false;
}
