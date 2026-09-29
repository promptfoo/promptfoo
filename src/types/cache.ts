/**
 * Options for cache behavior in fetchWithCache.
 * Supports per-repeat caching when evaluations use repeat > 1.
 */
export type CacheOptions = {
  /** Whether to bypass cache usage for this fetch */
  bust?: boolean;
  /** Repeat index for per-repeat caching. Repeats > 0 get unique cache keys. */
  repeatIndex?: number;
  /** Precomputed, credential-free cache identity for callers with tenant-scoped keys. */
  cacheKey?: string;
};
