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

export function resolveBlobUri(uri?: string | null): string | undefined {
  if (!uri) {
    return undefined;
  }

  if (uri.startsWith(BLOB_URI_PREFIX)) {
    return `/api/blobs/${uri.slice(BLOB_URI_PREFIX.length)}`;
  }

  if (uri.startsWith(STORAGE_REF_PREFIX)) {
    const path = normalizePath(uri.slice(STORAGE_REF_PREFIX.length));
    return `/api/media/${path}`;
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
    if (/^[A-Za-z0-9+/=_-]+$/.test(image)) {
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

export function normalizeMediaText(text: string): string {
  return text
    .replace(BLOB_URI_REGEX, (_match, hash) => `/api/blobs/${hash}`)
    .replace(STORAGE_REF_REGEX, (_match, path) => `/api/media/${normalizePath(path)}`);
}
