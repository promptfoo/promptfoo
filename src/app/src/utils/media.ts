import { getApiBaseUrl } from '@app/utils/api';
import { FileIcon, ImageIcon, Music, Video } from 'lucide-react';

// ============================================================================
// Constants
// ============================================================================

const BLOB_URI_PREFIX = 'promptfoo://blob/';
const STORAGE_REF_PREFIX = 'storageRef:';
const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;
const MEDIA_REF_REGEX = /(?:promptfoo:\/\/blob\/|storageRef:)[^\s)'"`<>]+/gi;

/** Number of items to fetch per page in the media library */
export const MEDIA_PAGE_SIZE = 30;

/** Maximum zoom level for image viewing */
export const MEDIA_MAX_ZOOM = 5;

/** Minimum zoom level for image viewing */
export const MEDIA_MIN_ZOOM = 1;

/** Zoom multiplier for button clicks */
export const MEDIA_ZOOM_STEP = 1.5;

/** Zoom multiplier for mouse wheel */
export const MEDIA_ZOOM_WHEEL_STEP = 1.2;

/** Pixels before bottom of page to trigger infinite scroll load */
export const MEDIA_INFINITE_SCROLL_MARGIN = 100;

// ============================================================================
// Types
// ============================================================================

export type MediaKind = 'image' | 'video' | 'audio' | 'other';

export type BlobLike =
  | string
  | {
      uri?: string;
      hash?: string;
    };

function encodeStoragePath(path: string): string | undefined {
  const normalized = path.replace(/^\/+/, '');
  if (!normalized) {
    return undefined;
  }

  const segments: string[] = [];
  for (const segment of normalized.split('/')) {
    try {
      const decoded = decodeURIComponent(segment);
      let candidate = decoded;
      // Check nested URL encodings, with a fixed bound for adversarially deep inputs.
      for (let decodePass = 0; ; decodePass++) {
        if (candidate === '.' || candidate === '..' || /[\\/\u0000-\u001f\u007f]/.test(candidate)) {
          return undefined;
        }
        if (!/%[a-f0-9]{2}/i.test(candidate)) {
          break;
        }
        if (decodePass === 5) {
          return undefined;
        }
        candidate = decodeURIComponent(candidate);
      }
      segments.push(encodeURIComponent(decoded));
    } catch {
      return undefined;
    }
  }
  return segments.join('/');
}

function resolveStoragePath(path: string): string | undefined {
  const encoded = encodeStoragePath(path);
  return encoded === undefined ? undefined : withApiBase(`/api/media/${encoded}`);
}

export function isLegacyMediaPath(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  // Library endpoints are ordinary API links, not blob byte references.
  if (/^\/api\/blobs\/library(?:\/evals)?\/?(?:[?#]|$)/i.test(value)) {
    return false;
  }
  let path = value;
  for (let decodePass = 0; decodePass <= 5; decodePass++) {
    path = path.replace(/[\u0000-\u0020\u007f]/g, '').replace(/\\/g, '/');
    const segments = path.split(/[?#]/, 1)[0].split('/');
    if (
      path.startsWith('/') &&
      segments[1] &&
      !segments[1].includes('%') &&
      segments[1].toLowerCase() !== 'api'
    ) {
      return false;
    }
    const prefix = `${segments.slice(0, 3).join('/')}${segments.length > 3 ? '/' : ''}`;
    if (/^\/api\/(?:media|blobs)\//i.test(prefix)) {
      return true;
    }
    // Decode only the namespace for classification; malformed key escapes must
    // not hide it. The resolver still requires an unambiguous original prefix.
    const decoded = prefix.replace(/%([a-f0-9]{2})/gi, (_match, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    if (decoded === prefix) {
      return false;
    }
    if (decodePass === 5) {
      return prefix.startsWith('/') || prefix.startsWith('%');
    }
    path = decoded;
  }
  return false;
}

function resolveLegacyMediaPath(uri: string): string | undefined {
  // Inspect the original path before URL parsing can remove traversal segments.
  // Query strings and fragments are URL syntax here, unlike opaque storage keys.
  const path = uri.split(/[?#]/, 1)[0];
  const match = /^\/api\/(media|blobs)\/([\s\S]*)$/i.exec(path);
  if (!match) {
    return undefined;
  }
  const [, kind, key] = match;
  if (kind.toLowerCase() === 'media') {
    return encodeStoragePath(key) === undefined ? undefined : uri;
  }
  try {
    const hash = decodeURIComponent(key.replace(/\/$/, ''));
    if (!BLOB_HASH_REGEX.test(hash)) {
      return undefined;
    }
    const prefix = path.slice(0, path.length - key.length);
    const trailingSlash = key.endsWith('/') ? '/' : '';
    return `${prefix}${hash.toLowerCase()}${trailingSlash}${uri.slice(path.length)}`;
  } catch {
    return undefined;
  }
}

function withApiBase(apiPath: string): string {
  const base = getApiBaseUrl();
  return base ? `${base}${apiPath}` : apiPath;
}

/**
 * Resolves a URL that could be a storage ref, blob URI, legacy API path, or external URL.
 * Returns the resolved URL or undefined if unrecognized.
 */
function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) {
    return undefined;
  }

  if (isLegacyMediaPath(url)) {
    const resolved = resolveLegacyMediaPath(url);
    return resolved === undefined ? undefined : withApiBase(resolved);
  }

  // Legacy API path - prepend base URL (check before resolveBlobUri since
  // that function returns paths starting with '/' directly without apiBaseUrl)
  if (url.startsWith('/api/')) {
    return withApiBase(url);
  }

  // Try resolving as blob/storage ref
  const blobUrl = resolveBlobUri(url);
  if (blobUrl) {
    return blobUrl;
  }

  // External URLs and data URIs pass through
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }

  return undefined;
}

export function isMediaRef(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (value.toLowerCase().startsWith(BLOB_URI_PREFIX) ||
      value.toLowerCase().startsWith(STORAGE_REF_PREFIX.toLowerCase()))
  );
}

export function resolveBlobUri(uri?: string | null): string | undefined {
  if (!uri) {
    return undefined;
  }

  if (uri.toLowerCase().startsWith(BLOB_URI_PREFIX)) {
    const hash = uri.slice(BLOB_URI_PREFIX.length);
    return BLOB_HASH_REGEX.test(hash) ? withApiBase(`/api/blobs/${hash.toLowerCase()}`) : undefined;
  }

  if (uri.toLowerCase().startsWith(STORAGE_REF_PREFIX.toLowerCase())) {
    return resolveStoragePath(uri.slice(STORAGE_REF_PREFIX.length));
  }

  if (isLegacyMediaPath(uri)) {
    return resolveLegacyMediaPath(uri);
  }

  // Only allow safe internal paths and data URIs
  // External URLs (http://, https://, //) are NOT allowed to prevent SSRF
  // See SECURITY.md - test data and model outputs are untrusted inputs
  if (uri.startsWith('/api/') || uri.startsWith('data:')) {
    return uri;
  }

  return undefined;
}

export function resolveBlobRef(blobRef?: BlobLike | null): string | undefined {
  if (!blobRef) {
    return undefined;
  }

  if (typeof blobRef === 'string') {
    return resolveBlobUri(blobRef);
  }

  const uri = blobRef.uri || (blobRef.hash ? `${BLOB_URI_PREFIX}${blobRef.hash}` : undefined);
  return resolveBlobUri(uri);
}

export function resolveAudioSource(
  audio?: { data?: string; format?: string; blobRef?: BlobLike } | null,
  fallbackContent?: string,
): { src: string; type?: string } | null {
  const blobUrl = resolveBlobRef(audio?.blobRef) || resolveBlobUri(fallbackContent);
  if (blobUrl) {
    return {
      src: blobUrl,
      type: `audio/${audio?.format || 'mpeg'}`,
    };
  }

  const data = audio?.data || fallbackContent;
  if (!data || data.startsWith('file://')) {
    return null;
  }

  const format = audio?.format || 'mp3';
  const src = data.startsWith('data:audio') ? data : `data:audio/${format};base64,${data}`;

  return {
    src,
    type: `audio/${format}`,
  };
}

export function resolveImageSource(
  image?: { data?: string; format?: string; blobRef?: BlobLike } | string | null,
): string | undefined {
  if (typeof image === 'string') {
    const blobUrl = resolveBlobUri(image);
    if (blobUrl) {
      return blobUrl;
    }
    if (image.startsWith('data:')) {
      return image;
    }
    // Allow base64-ish payloads that are purely non-whitespace and use common base64/url-safe chars
    // Require a minimum length to avoid misclassifying short strings (e.g., session IDs) as images.
    if (image.length >= 60 && /^[A-Za-z0-9+/=_-]+$/.test(image)) {
      return `data:image/png;base64,${image}`;
    }
    return undefined;
  }

  const blobUrl = resolveBlobRef(image?.blobRef);
  if (blobUrl) {
    return blobUrl;
  }

  if (image?.data) {
    const format = image.format || 'png';
    return image.data.startsWith('data:')
      ? image.data
      : `data:image/${format};base64,${image.data}`;
  }

  return undefined;
}

/**
 * Resolve video source from a video object with url, blobRef, or storageRef.
 * Handles both legacy API paths and new blob/storage patterns.
 * Supports both Google Veo (blobRef) and OpenAI Sora (storageRef, thumbnail) patterns.
 */
export function resolveVideoSource(
  video?: {
    url?: string;
    blobRef?: BlobLike;
    storageRef?: { key?: string };
    format?: string;
    thumbnail?: string;
  } | null,
): { src: string; type?: string; poster?: string } | null {
  if (!video) {
    return null;
  }

  // Try blob reference first, then storage reference, then URL
  const src =
    resolveBlobRef(video.blobRef) ||
    (video.storageRef?.key ? resolveStoragePath(video.storageRef.key) : undefined) ||
    resolveMediaUrl(video.url);

  if (!src) {
    return null;
  }

  const format = video.format || 'mp4';
  return {
    src,
    type: `video/${format}`,
    poster: resolveMediaUrl(video.thumbnail),
  };
}

// For text display and comparison only. Resolve complete URL destinations with
// resolveBlobUri after Markdown parsing before using them in href/src attributes.
export function normalizeMediaText(text: string): string {
  return text.replace(MEDIA_REF_REGEX, (match) => {
    const prefix = match.toLowerCase().startsWith(BLOB_URI_PREFIX)
      ? BLOB_URI_PREFIX
      : STORAGE_REF_PREFIX;
    const value = match.slice(prefix.length);
    const prose =
      prefix === BLOB_URI_PREFIX ? /^([a-f0-9]{64})((?:(?![/\\%])\p{P})+)$/iu.exec(value) : null;
    const resolved = resolveBlobUri(`${prefix}${prose?.[1] ?? value}`);
    return resolved === undefined ? match : `${resolved}${prose?.[2] ?? ''}`;
  });
}

/**
 * Format bytes to human-readable string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format a date string to localized display format
 */
export function formatMediaDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format latency in milliseconds to human-readable string
 */
export function formatLatency(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format cost to dollar string with appropriate precision
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Generate a deterministic hash number from a string
 * Used for creating consistent visuals from content hashes
 */
export function hashToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// Media Kind Utilities
// ============================================================================

/**
 * Get the appropriate Lucide icon component for a media kind
 */
export function getKindIcon(kind: MediaKind): typeof ImageIcon {
  switch (kind) {
    case 'image':
      return ImageIcon;
    case 'video':
      return Video;
    case 'audio':
      return Music;
    default:
      return FileIcon;
  }
}

/**
 * Get human-readable label for a media kind
 */
export function getKindLabel(kind: MediaKind): string {
  switch (kind) {
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    default:
      return 'File';
  }
}

// ============================================================================
// Download Utilities
// ============================================================================

/**
 * Extract file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split('/')[1];
  if (!subtype) {
    return 'bin';
  }
  // Handle common cases where MIME subtype differs from extension
  const mimeToExt: Record<string, string> = {
    jpeg: 'jpg',
    'svg+xml': 'svg',
    'x-wav': 'wav',
    mpeg: 'mp3',
    quicktime: 'mov',
    'x-matroska': 'mkv',
  };
  return mimeToExt[subtype] || subtype.split('+')[0];
}

/**
 * Generate a filename for a media item
 */
export function generateMediaFilename(hash: string, mimeType: string): string {
  const ext = getExtensionFromMimeType(mimeType);
  return `${hash.slice(0, 12)}.${ext}`;
}

/**
 * Download a file from a URL.
 * Creates a temporary anchor element to trigger the download.
 */
export function downloadFile(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Clean up immediately - the download has already been triggered
  document.body.removeChild(a);
}

/**
 * Download a media item by its URL and metadata.
 * Convenience wrapper around downloadFile.
 */
export function downloadMediaItem(url: string, hash: string, mimeType: string): void {
  const filename = generateMediaFilename(hash, mimeType);
  downloadFile(url, filename);
}
