/**
 * Shared video generation provider utilities.
 */
export {
  buildStorageRefUrl,
  checkVideoCache,
  // Validation utilities
  createValidator,
  DEFAULT_MAX_POLL_TIME_MS,
  // Constants
  DEFAULT_POLL_INTERVAL_MS,
  formatVideoOutput,
  generateVideoCacheKey,
  // Cache utilities
  getCacheMappingPath,
  isVideoCacheReferenceUrlSafe,
  readCacheMapping,
  // Output formatting
  sanitizePromptForOutput,
  sanitizeVideoCacheReferenceUrl,
  storeCacheMapping,
  // Storage utilities
  storeVideoContent,
} from './utils';

export type { ValidationResult, VideoCacheMapping } from './utils';
