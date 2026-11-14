import {
  isHttpRateLimitError,
  isTransientConnectionError,
  type SystemError,
} from '../util/fetch/errors';

const TRANSIENT_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

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
  // mac, EPROTO, ECONNRESET, socket hang up). The inline patterns below
  // cover higher-level transient failures (DNS, HTTP status codes, timeouts)
  // across the error and nested cause.
  if (error) {
    const cause = (error as SystemError).cause as SystemError | undefined;
    const message = (error.message ?? '').toLowerCase();
    const causeMessage = typeof cause?.message === 'string' ? cause.message.toLowerCase() : '';

    return (
      isTransientConnectionError(error) ||
      TRANSIENT_NETWORK_CODES.has((error as SystemError).code ?? '') ||
      TRANSIENT_NETWORK_CODES.has(cause?.code ?? '') ||
      causeMessage.includes('econnrefused') ||
      message.includes('timeout') ||
      message.startsWith('websocket request timed out after ') ||
      message.includes('econnrefused') ||
      message.includes('network') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('504')
    );
  }

  return false;
}
