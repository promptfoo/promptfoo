// Blob bytes can arrive from untrusted sources (portable eval exports during `import`, and
// share uploads over the network via POST /api/blobs). Such blobs must never be storable as
// active same-origin content (e.g. text/html, image/svg+xml), because the blob is later served
// back from the server's own origin. We persist only a media allowlist and downgrade everything
// else to application/octet-stream so it can never be reflected as an executable Content-Type.

export const BLOB_MIME_TYPE_FALLBACK = 'application/octet-stream';

export const SAFE_BLOB_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/ogg',
  'video/webm',
]);

// Audio subtypes vary widely (mpeg, wav, ogg, webm, x-*); allow any well-formed audio/* subtype.
export const SAFE_AUDIO_MIME_TYPE_REGEX = /^audio\/[a-z0-9_+-]+$/i;

/**
 * Normalize a caller-supplied MIME type to a safe, storable value. Returns the lowercased MIME
 * when it is on the media allowlist, otherwise the inert application/octet-stream fallback.
 */
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
