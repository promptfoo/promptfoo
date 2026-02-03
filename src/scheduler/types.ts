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
 * Detect transient connection errors (SSL/TLS, resets) distinct from rate limits.
 * Uses specific error patterns to avoid matching permanent certificate errors
 * like "self signed certificate" or "unable to verify the first certificate".
 */
export function isTransientConnectionError(error: Error | undefined): boolean {
  if (!error) {
    return false;
  }
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('bad record mac') ||
    message.includes('ssl routines') ||
    message.includes('ssl alert') ||
    message.includes('tls alert') ||
    message.includes('wrong version number') ||
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
