/**
 * Extended RequestInit options with additional features
 */
export interface FetchOptions extends RequestInit {
  /**
   * Whether to compress the request body using gzip
   */
  compress?: boolean;

  /**
   * Whether to disable automatic retries on transient errors (502, 503, 504, 524).
   * Used by fetchWithRetries to prevent double-retrying.
   */
  disableTransientRetries?: boolean;

  /**
   * Additional HTTP status codes to retry through fetchWithRetries.
   * Callers should use this only for endpoint-specific transient contracts.
   * Explicit codes are eligible for retries even when the request method is non-idempotent.
   */
  retryOnStatusCodes?: readonly number[];
}
