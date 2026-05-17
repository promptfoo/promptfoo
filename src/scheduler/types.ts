/**
 * Shared types for the scheduler module.
 */

import { isHttpRateLimitError } from '../util/fetch/errors';

import type { ProviderResponse } from '../types/providers';

/**
 * Options for rate-limited execution.
 * Used by RateLimitRegistry.execute() and provider wrappers.
 */
export interface RateLimitExecuteOptions<T> {
  /** Extract rate limit headers from the result */
  getHeaders?: (result: T) => Record<string, string> | undefined;
  /** Detect if the result indicates a rate limit */
  isRateLimited?: (result: T | undefined, error?: Error) => boolean;
  /** Extract retry-after delay from result or error */
  getRetryAfter?: (result: T | undefined, error?: Error) => number | undefined;
}

/**
 * Default rate limit detection for ProviderResponse.
 *
 * Returns true when a result/error indicates a *retryable* rate limit. Hard
 * quota failures (billing exhaustion, daily limits) match the same `429` /
 * `too many requests` substrings but must NOT be classified as retryable —
 * doing so amplifies load against an exhausted account, which is the exact
 * regression PR 8896 closes at the transport layer. The result-path check
 * here mirrors that fail-fast contract for providers that fold the
 * structured error into `ProviderResponse.error`.
 */
export function isProviderResponseRateLimited(
  result: ProviderResponse | undefined,
  error: Error | undefined,
): boolean {
  // Structured signal — never retry a hard quota.
  if (result?.metadata?.rateLimitKind === 'quota') {
    return false;
  }
  if (isHttpRateLimitError(error) && error.kind === 'quota') {
    return false;
  }
  // String fallback for providers that fold the structured error into
  // `error: formatRateLimitErrorMessage(...)`. The "Quota exceeded:"
  // substring is part of that formatter's contract; some providers also
  // wrap it in a prefix (e.g. `"API call error: HttpRateLimitError: Quota
  // exceeded: ..."`), so this is a substring match rather than a
  // startsWith. The substring is specific enough that false positives are
  // implausible in normal API error envelopes.
  if (result?.error?.includes('Quota exceeded:')) {
    return false;
  }
  if (error?.message?.includes('Quota exceeded:')) {
    return false;
  }

  return Boolean(
    // Check HTTP status code (most reliable)
    result?.metadata?.http?.status === 429 ||
      // Check error field in response
      result?.error?.includes?.('429') ||
      result?.error?.toLowerCase?.().includes?.('rate limit') ||
      // Check thrown error message
      error?.message?.includes('429') ||
      error?.message?.toLowerCase().includes('rate limit') ||
      error?.message?.toLowerCase().includes('too many requests'),
  );
}

export { isTransientConnectionError } from '../util/fetch/errors';

/**
 * Extract rate limit headers from ProviderResponse.
 * Headers can be at metadata.http.headers or metadata.headers.
 */
export function getProviderResponseHeaders(
  result: ProviderResponse | undefined,
): Record<string, string> | undefined {
  return (result?.metadata?.http?.headers || result?.metadata?.headers) as
    | Record<string, string>
    | undefined;
}
