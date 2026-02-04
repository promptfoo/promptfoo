/**
 * Shared types for the scheduler module.
 */

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
 * Checks HTTP status, error fields, and error messages.
 */
export function isProviderResponseRateLimited(
  result: ProviderResponse | undefined,
  error: Error | undefined,
): boolean {
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

/**
 * Detect transient connection errors distinct from rate limits or permanent
 * certificate/config errors.  Only matches errors that are likely to succeed
 * on retry (stale connections, mid-stream resets).  Permanent failures like
 * "self signed certificate", "unable to verify", "unknown ca", or
 * "wrong version number" (HTTPS→HTTP mismatch) are intentionally excluded.
 */
export function isTransientConnectionError(error: Error | undefined): boolean {
  if (!error) {
    return false;
  }
  const message = (error.message ?? '').toLowerCase();
  // EPROTO can wrap permanent misconfigs like "wrong version number"
  // (HTTPS→HTTP mismatch), so exclude those.
  if (message.includes('eproto') && message.includes('wrong version number')) {
    return false;
  }
  return (
    message.includes('bad record mac') ||
    message.includes('eproto') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  );
}

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
