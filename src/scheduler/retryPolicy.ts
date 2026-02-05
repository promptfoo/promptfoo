export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number; // 0-1, adds randomness to prevent thundering herd
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

  // Always retry rate limits (up to max)
  if (isRateLimited) {
    return true;
  }

  // Retry transient errors
  if (error) {
    const message = (error.message ?? '').toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up') ||
      message.includes('network') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('504')
    );
  }

  return false;
}
