/**
 * Media storage module for promptfoo.
 *
 * Provides abstraction for storing binary media (audio, images, video)
 * separately from the main database.
 *
 * @example
 * ```typescript
 * import { getMediaStorage, storeMedia, retrieveMedia } from './storage';
 *
 * // Store audio data
 * const { ref } = await storeMedia(audioBuffer, {
 *   contentType: 'audio/wav',
 *   mediaType: 'audio',
 *   evalId: 'eval-123',
 * });
 *
 * // Later, retrieve it
 * const buffer = await retrieveMedia(ref.key);
 * ```
 */

import { getEnvString } from '../envars';
import logger from '../logger';
import { LocalFileSystemProvider } from './localFileSystemProvider';

import type { LocalStorageConfig, MediaMetadata, MediaStorageProvider, StoreResult } from './types';

export { LocalFileSystemProvider } from './localFileSystemProvider';
export * from './types';

// Singleton instance
let defaultProvider: MediaStorageProvider | null = null;

/**
 * Get the default media storage provider.
 *
 * For OSS, this returns a LocalFileSystemProvider.
 * For cloud deployments, this can be overridden.
 */
export function getMediaStorage(config?: LocalStorageConfig): MediaStorageProvider {
  if (!defaultProvider) {
    const basePath = config?.basePath || getEnvString('PROMPTFOO_MEDIA_PATH');
    defaultProvider = new LocalFileSystemProvider({ basePath });
    logger.debug(`[MediaStorage] Initialized local storage provider`);
  }
  return defaultProvider;
}

/**
 * Store media data and return a reference
 */
export async function storeMedia(data: Buffer, metadata: MediaMetadata): Promise<StoreResult> {
  const storage = getMediaStorage();
  return storage.store(data, metadata);
}

/**
 * Retrieve media data by key
 */
export async function retrieveMedia(key: string): Promise<Buffer> {
  const storage = getMediaStorage();
  return storage.retrieve(key);
}

/**
 * Check if media exists
 */
export async function mediaExists(key: string): Promise<boolean> {
  const storage = getMediaStorage();
  return storage.exists(key);
}

/**
 * Check if media storage should be used based on config/env
 *
 * Returns true if media storage is enabled (default for new installs).
 * Set PROMPTFOO_INLINE_MEDIA=true to disable and use legacy inline base64.
 */
export function isMediaStorageEnabled(): boolean {
  const inline = getEnvString('PROMPTFOO_INLINE_MEDIA');
  return inline !== 'true' && inline !== '1';
}
