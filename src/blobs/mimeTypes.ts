// Serve imported and shared blobs as passive media or opaque downloads.
// Restrict MIME types because these bytes are served from the viewer's origin.

export const BLOB_MIME_TYPE_FALLBACK = 'application/octet-stream';

export const SAFE_BLOB_MIME_TYPES = new Set([
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/vnd.microsoft.icon',
  'image/webp',
  'image/x-icon',
  'video/3gpp',
  'video/avi',
  'video/mp4',
  'video/mpeg',
  'video/mpg',
  'video/quicktime',
  'video/wmv',
  'video/x-flv',
  'video/x-matroska',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/ogg',
  'video/webm',
]);

// Audio subtypes vary widely (mpeg, wav, ogg, webm, x-*); allow any well-formed audio/* subtype.
export const SAFE_AUDIO_MIME_TYPE_REGEX = /^audio\/[a-z0-9_+-]+$/i;

/** Normalize allowed media types; use an opaque download for other formats. */
export function sanitizeBlobMimeType(mimeType: string): string {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (
    SAFE_BLOB_MIME_TYPES.has(normalizedMimeType) ||
    SAFE_AUDIO_MIME_TYPE_REGEX.test(normalizedMimeType)
  ) {
    return normalizedMimeType;
  }
  return BLOB_MIME_TYPE_FALLBACK;
}
