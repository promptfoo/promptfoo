import type { Buffer } from 'node:buffer';

import type { BlobRef } from '../contracts/blobs';

export type { BlobRef } from '../contracts/blobs';

export interface BlobMetadata {
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  provider: string;
  key: string;
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
