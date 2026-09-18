/**
 * Extended RequestInit options with additional features
 */
export interface FetchOptions extends RequestInit {
  /**
   * Resolve default authentication headers immediately before each HTTP attempt, including
   * retries. Explicit request headers take precedence (case-insensitively). The signal includes
   * the request timeout. The callback is never forwarded to fetch or included in cache keys.
   * Callers must bypass caching or supply an explicit, non-secret principal-scoped cache key.
   */
  getAuthHeaders?: (signal?: AbortSignal) => Promise<HeadersInit>;

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

  /**
   * Internal request-scoped marker: preserve custom Cloud auth protection across
   * asynchronous preparation and retries, even if the saved session changes.
   */
  restrictCloudAuthRedirects?: true;
}
