import useApiConfig from '@app/stores/apiConfig';
import { FileIcon, ImageIcon, Music, Video } from 'lucide-react';

// ============================================================================
// Constants
// ============================================================================

const BLOB_URI_PREFIX = 'promptfoo://blob/';
const STORAGE_REF_PREFIX = 'storageRef:';
const BLOB_URI_REGEX = /promptfoo:\/\/blob\/([a-f0-9]{32,64})/gi;
const STORAGE_REF_REGEX = /storageRef:\/?([^\s)'"`]+)/gi;

/** Number of items to fetch per page in the media library */
export const MEDIA_PAGE_SIZE = 30;

/** Maximum number of evals to show in the filter dropdown */
export const MEDIA_EVAL_DROPDOWN_LIMIT = 100;

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

function normalizePath(path: string): string {
  return path.replace(/^\//, '');
}

function getApiBaseUrl(): string {
  const { apiBaseUrl } = useApiConfig.getState();
  const base = apiBaseUrl || import.meta.env.VITE_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL || '';
  return base.replace(/\/+$/, '');
}

function withApiBase(apiPath: string): string {
  const base = getApiBaseUrl();
  return base ? `${base}${apiPath}` : apiPath;
}

export function resolveBlobUri(uri?: string | null): string | undefined {
  if (!uri) {
    return undefined;
  }

  if (uri.startsWith(BLOB_URI_PREFIX)) {
    return withApiBase(`/api/blobs/${uri.slice(BLOB_URI_PREFIX.length)}`);
  }

  if (uri.startsWith(STORAGE_REF_PREFIX)) {
    const path = normalizePath(uri.slice(STORAGE_REF_PREFIX.length));
    return withApiBase(`/api/media/${path}`);
  }

  if (/^(https?:)?\/\//.test(uri) || uri.startsWith('/') || uri.startsWith('data:')) {
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
  if (!data) {
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
 * Resolves video source from a video object with optional blob reference.
 * Returns a source URL and MIME type suitable for HTML video elements.
 */
export function resolveVideoSource(
  video?: { format?: string; blobRef?: BlobLike; url?: string } | null,
): { src: string; type?: string } | null {
  if (!video) {
    return null;
  }

  // Try blob reference first
  const blobUrl = resolveBlobRef(video.blobRef);
  if (blobUrl) {
    return {
      src: blobUrl,
      type: `video/${video.format || 'mp4'}`,
    };
  }

  // Fall back to direct URL (legacy format)
  if (video.url) {
    const resolvedUrl = resolveBlobUri(video.url);
    if (resolvedUrl) {
      return {
        src: resolvedUrl,
        type: `video/${video.format || 'mp4'}`,
      };
    }
  }

  return null;
}

export function normalizeMediaText(text: string): string {
  return text
    .replace(BLOB_URI_REGEX, (_match, hash) => withApiBase(`/api/blobs/${hash}`))
    .replace(STORAGE_REF_REGEX, (_match, path) => withApiBase(`/api/media/${normalizePath(path)}`));
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
