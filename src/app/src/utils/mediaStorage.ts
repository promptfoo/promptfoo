/**
 * Utilities for resolving media storage references in the UI.
 *
 * Storage refs use format: "storageRef:audio/xxx.mp3" or "storageRef:image/xxx.png"
 *
 * For storage and blob refs, we return a direct URL to the media API.
 *
 * Using direct URLs (not fetching blobs) allows:
 * - Native browser streaming & seeking for audio/video
 * - Browser caching
 * - Memory efficiency
 */

import useApiConfig from '@app/stores/apiConfig';

/** Prefix for storage references */
const STORAGE_REF_PREFIX = 'storageRef:';
const BLOB_REF_PREFIX = 'promptfoo://blob/';

export type StorageRefString = `${typeof STORAGE_REF_PREFIX}${string}`;
export type BlobRefString = `${typeof BLOB_REF_PREFIX}${string}`;

/**
 * Get the base URL for the API.
 * Uses the same apiBaseUrl as callApi to ensure correct routing
 * in both development (http://localhost:15500) and production.
 */
function getApiBaseUrl(): string {
  const { apiBaseUrl } = useApiConfig.getState();
  return `${apiBaseUrl}/api`;
}

/**
 * Check if a value is a storage reference
 */
export function isStorageRef(value: unknown): value is StorageRefString {
  return typeof value === 'string' && value.startsWith(STORAGE_REF_PREFIX);
}

export function isBlobRef(value: unknown): value is BlobRefString {
  return typeof value === 'string' && value.startsWith(BLOB_REF_PREFIX);
}

/**
 * Resolve an audio reference asynchronously for ResultsTable consumers.
 */
export async function resolveAudioUrl(
  data: StorageRefString | BlobRefString,
): Promise<string | null> {
  const blob = isBlobRef(data);
  const key = data.slice(blob ? BLOB_REF_PREFIX.length : STORAGE_REF_PREFIX.length);
  return key ? `${getApiBaseUrl()}/${blob ? 'blobs' : 'media'}/${key}` : null;
}
