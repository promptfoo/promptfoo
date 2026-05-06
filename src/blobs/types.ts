import type { Buffer } from 'node:buffer';

export interface BlobMetadata {
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  provider: string;
  key: string;
}

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

export interface StoredBlob {
  data: Buffer;
  metadata: BlobMetadata;
}

export interface BlobStoreResult {
  ref: BlobRef;
  deduplicated: boolean;
}

export interface BlobStorageProvider {
  readonly providerId: string;
  store(data: Buffer, mimeType: string): Promise<BlobStoreResult>;
  getByHash(hash: string): Promise<StoredBlob>;
  exists(hash: string): Promise<boolean>;
  deleteByHash(hash: string): Promise<void>;
  getUrl(hash: string, expiresInSeconds?: number): Promise<string | null>;
}
