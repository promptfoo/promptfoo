/**
 * Cache UI module exports.
 *
 * Note: CacheApp is intentionally NOT exported here to avoid loading ink
 * at import time. It is dynamically imported inside the runner functions.
 */
export {
  type CacheResult,
  type CacheRunnerOptions,
  runInkCache,
  shouldUseInkCache,
} from './cacheRunner';

// Re-export types only (no runtime loading)
export type { CacheAppProps, CacheStats } from './CacheApp';
