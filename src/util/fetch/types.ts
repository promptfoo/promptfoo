/**
 * Extended RequestInit options with additional features
 */
export interface FetchOptions extends RequestInit {
  /**
   * Whether to compress the request body using gzip
   */
  compress?: boolean;

  /**
   * Whether to disable automatic retries on transient errors (502, 503, 504).
   * Used by fetchWithRetries to prevent double-retrying.
   */
  disableTransientRetries?: boolean;
}
