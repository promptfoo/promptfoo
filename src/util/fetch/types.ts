/**
 * Extended RequestInit options with additional features
 */
export interface FetchOptions extends RequestInit {
  /**
   * Whether to compress the request body using gzip
   */
  compress?: boolean;

  /**
   * Whether to disable response-status retries. For fetchWithProxy this disables its built-in
   * 502/503/504/524 policy; for fetchWithRetries this disables retryOnStatusCodes. Network errors
   * and rate-limit responses keep their existing retry behavior.
   */
  disableTransientRetries?: boolean;

  /**
   * HTTP status codes to retry through fetchWithRetries.
   * Callers should use this only for endpoint-specific transient contracts.
   * Explicit codes are eligible even for non-idempotent methods when the body is replayable.
   */
  retryOnStatusCodes?: readonly number[];
}
