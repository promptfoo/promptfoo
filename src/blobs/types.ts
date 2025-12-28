import type { Buffer } from 'node:buffer';

export interface BlobMetadata {
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  provider: string;
  key: string;
}

/**
 * Blob reference format used across API/UI.
 * Example URI: promptfoo://blob/<hash>
 */
export interface BlobRef {
  uri: string;
  hash: string;
  mimeType: string;
  sizeBytes: number;
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
