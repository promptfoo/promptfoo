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

import type {
  LocalStorageConfig,
  MediaData,
  MediaMetadata,
  MediaStorageProvider,
  MediaStorageRef,
  StoreResult,
} from './types';

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
 * Set a custom media storage provider (for cloud deployments)
 */
export function setMediaStorage(provider: MediaStorageProvider): void {
  defaultProvider = provider;
  logger.debug(`[MediaStorage] Set custom provider: ${provider.providerId}`);
}

/**
 * Reset the storage provider (mainly for testing)
 */
export function resetMediaStorage(): void {
  defaultProvider = null;
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
 * Retrieve media data from a storage ref
 */
export async function retrieveMediaFromRef(ref: MediaStorageRef): Promise<Buffer> {
  const storage = getMediaStorage();
  return storage.retrieve(ref.key);
}

/**
 * Check if media exists
 */
export async function mediaExists(key: string): Promise<boolean> {
  const storage = getMediaStorage();
  return storage.exists(key);
}

/**
 * Delete media
 */
export async function deleteMedia(key: string): Promise<void> {
  const storage = getMediaStorage();
  return storage.delete(key);
}

/**
 * Get URL for media (for serving to frontend)
 */
export async function getMediaUrl(key: string, expiresIn?: number): Promise<string | null> {
  const storage = getMediaStorage();
  return storage.getUrl(key, expiresIn);
}

/**
 * Convert base64 data to a storage ref (for migration/ingestion)
 */
export async function base64ToStorageRef(
  base64Data: string,
  metadata: MediaMetadata,
): Promise<MediaStorageRef> {
  const buffer = Buffer.from(base64Data, 'base64');
  const { ref } = await storeMedia(buffer, metadata);
  return ref;
}

/**
 * Convert storage ref back to base64 (for backward compatibility)
 */
export async function storageRefToBase64(ref: MediaStorageRef): Promise<string> {
  const buffer = await retrieveMediaFromRef(ref);
  return buffer.toString('base64');
}

/**
 * Create MediaData with storage ref instead of inline data
 *
 * @example
 * ```typescript
 * // Instead of:
 * const mediaData = { data: base64Audio, format: 'wav' };
 *
 * // Use:
 * const mediaData = await createMediaData(audioBuffer, {
 *   contentType: 'audio/wav',
 *   mediaType: 'audio',
 * });
 * ```
 */
export async function createMediaData(data: Buffer, metadata: MediaMetadata): Promise<MediaData> {
  const { ref } = await storeMedia(data, metadata);
  const format = ref.key.split('.').pop() || metadata.contentType.split('/')[1] || 'bin';
  return {
    format,
    storageRef: ref,
  };
}

/**
 * Resolve MediaData to base64 string (handles both inline and ref modes)
 */
export async function resolveMediaData(mediaData: MediaData): Promise<string> {
  if (mediaData.data) {
    // Already has inline data
    return mediaData.data;
  }
  if (mediaData.storageRef) {
    // Fetch from storage
    return storageRefToBase64(mediaData.storageRef);
  }
  throw new Error('[MediaStorage] MediaData has neither data nor storageRef');
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
