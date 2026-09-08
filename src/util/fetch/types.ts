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

  /**
   * Skip automatic injection of the saved Cloud auth header (and cloud task
   * team header). Set by callers that explicitly manage their own Cloud auth
   * header, e.g. validating/rotating a credential that is not yet saved.
   */
  skipCloudAuthInjection?: boolean;
}
