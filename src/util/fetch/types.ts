/**
 * Extended RequestInit options with additional features
 */
export interface FetchOptions extends RequestInit {
  /**
   * Whether to compress the request body using gzip
   */
  compress?: boolean;
}
