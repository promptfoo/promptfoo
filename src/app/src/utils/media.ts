import useApiConfig from '@app/stores/apiConfig';

const BLOB_URI_PREFIX = 'promptfoo://blob/';
const STORAGE_REF_PREFIX = 'storageRef:';
const BLOB_URI_REGEX = /promptfoo:\/\/blob\/([a-f0-9]{32,64})/gi;
const STORAGE_REF_REGEX = /storageRef:\/?([^\s)'"`]+)/gi;

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

/**
 * Resolves a URL that could be a storage ref, blob URI, legacy API path, or external URL.
 * Returns the resolved URL or undefined if unrecognized.
 */
function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) {
    return undefined;
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
    (video.storageRef?.key
      ? withApiBase(`/api/media/${normalizePath(video.storageRef.key)}`)
      : undefined) ||
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

export function normalizeMediaText(text: string): string {
  return text
    .replace(BLOB_URI_REGEX, (_match, hash) => withApiBase(`/api/blobs/${hash}`))
    .replace(STORAGE_REF_REGEX, (_match, path) => withApiBase(`/api/media/${normalizePath(path)}`));
}
