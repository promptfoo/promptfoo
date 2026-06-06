/**
 * External blob reference used by media-capable provider responses.
 *
 * @example
 * ```ts
 * const blob: BlobRef = {
 *   uri: 'promptfoo://blob/abc123',
 *   hash: 'abc123',
 *   mimeType: 'image/png',
 *   sizeBytes: 1024,
 *   provider: 'local',
 * };
 * ```
 *
 * @public
 */
export interface BlobRef {
  /** Canonical URI, for example `promptfoo://blob/<hash>`. */
  uri: string;
  /** Content hash used to deduplicate and retrieve the blob. */
  hash: string;
  /** MIME type of the stored blob. */
  mimeType: string;
  /** Blob size in bytes. */
  sizeBytes: number;
  /** Storage backend that owns the blob. */
  provider: string;
}
