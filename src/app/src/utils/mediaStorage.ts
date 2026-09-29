/**
 * Utilities for resolving media storage references in the UI.
 *
 * Storage refs use format: "storageRef:audio/xxx.mp3" or "storageRef:image/xxx.png"
 *
 * For storage refs, we return a direct URL to the media API.
 * For base64 data, we return a data URL.
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
 * Parse a storage reference to get the key
 */
export function parseStorageRef(ref: string): string | null {
  if (!isStorageRef(ref)) {
    return null;
  }
  return ref.slice(STORAGE_REF_PREFIX.length);
}

export function parseBlobRef(ref: string): string | null {
  if (!isBlobRef(ref)) {
    return null;
  }
  return ref.slice(BLOB_REF_PREFIX.length);
}

/**
 * Get direct URL for a storage ref (for use in <audio>, <video>, <img> src)
 *
 * This returns a URL that the browser can fetch directly,
 * allowing native streaming, seeking, and caching.
 */
export function getMediaUrl(storageRef: string): string | null {
  const key = parseStorageRef(storageRef);
  if (!key) {
    return null;
  }
  return `${getApiBaseUrl()}/media/${key}`;
}

export function getBlobUrl(blobRef: string): string | null {
  const hash = parseBlobRef(blobRef);
  if (!hash) {
    return null;
  }
  return `${getApiBaseUrl()}/blobs/${hash}`;
}

/**
 * Resolve a media value to a URL for use in <audio>, <video>, <img> src.
 *
 * - For storage refs: returns direct API URL (e.g., "/api/media/audio/xxx.mp3")
 * - For base64 data: returns data URL (e.g., "data:audio/mp3;base64,...")
 * - For existing data URLs: returns as-is
 *
 * @param value - Either a storageRef:key, base64 data, or data URL
 * @param mimeType - MIME type for base64 data URLs (e.g., 'audio/mp3')
 * @returns URL for use in media elements
 */
export function resolveMediaUrl(value: string | undefined, mimeType: string): string | null {
  if (!value) {
    return null;
  }

  if (isBlobRef(value)) {
    return getBlobUrl(value);
  }

  // Storage ref → direct API URL
  if (isStorageRef(value)) {
    return getMediaUrl(value);
  }

  // Already a data URL
  if (value.startsWith('data:')) {
    return value;
  }

  // Already a URL (http/https)
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  // Base64 data → data URL
  return `data:${mimeType};base64,${value}`;
}

/**
 * Resolve audio data to a playable URL (sync version)
 */
export function resolveAudioUrlSync(
  data: string | undefined,
  format: string = 'mp3',
): string | null {
  return resolveMediaUrl(data, `audio/${format}`);
}

/**
 * Resolve image data to a displayable URL (sync version)
 */
export function resolveImageUrlSync(
  data: string | undefined,
  format: string = 'png',
): string | null {
  return resolveMediaUrl(data, `image/${format}`);
}

/**
 * Resolve video data to a playable URL (sync version)
 */
export function resolveVideoUrlSync(
  data: string | undefined,
  format: string = 'mp4',
): string | null {
  return resolveMediaUrl(data, `video/${format}`);
}

// ============================================================================
// Async versions (for backward compatibility)
// These just wrap the sync versions in a Promise
// ============================================================================

/**
 * Resolve a storage reference to a URL (async for backward compatibility)
 * @deprecated Use resolveMediaUrl (sync) instead
 */
export async function resolveMediaValue(
  value: string | undefined,
  mimeType: string,
): Promise<string | null> {
  return resolveMediaUrl(value, mimeType);
}

/**
 * Resolve audio data to a playable URL (async for backward compatibility)
 * @deprecated Use resolveAudioUrlSync instead
 */
export async function resolveAudioUrl(
  data: string | undefined,
  format: string = 'mp3',
): Promise<string | null> {
  return resolveAudioUrlSync(data, format);
}

/**
 * Resolve image data to a displayable URL (async for backward compatibility)
 * @deprecated Use resolveImageUrlSync instead
 */
export async function resolveImageUrl(
  data: string | undefined,
  format: string = 'png',
): Promise<string | null> {
  return resolveImageUrlSync(data, format);
}
