import { randomUUID } from 'node:crypto';

import { getDb } from '../database';
import { blobAssetsTable, blobReferencesTable } from '../database/tables';
import logger from '../logger';
import { FilesystemBlobStorageProvider } from './filesystemProvider';

import type { BlobStorageProvider, BlobStoreResult, StoredBlob } from './types';

export { BLOB_MAX_SIZE, BLOB_MIN_SIZE, BLOB_SCHEME } from './constants';
export {
  type BlobRef,
  type BlobStorageProvider,
  type BlobStoreResult,
  type StoredBlob,
} from './types';

let defaultProvider: BlobStorageProvider | null = null;

function createDefaultProvider(): BlobStorageProvider {
  // OSS: filesystem-only media storage. Cloud/on-prem can override by calling setBlobStorageProvider().
  return new FilesystemBlobStorageProvider();
}

export function getBlobStorageProvider(): BlobStorageProvider {
  if (!defaultProvider) {
    defaultProvider = createDefaultProvider();
    logger.debug('[BlobStorage] Initialized provider', { provider: defaultProvider.providerId });
  }
  return defaultProvider;
}

export function setBlobStorageProvider(provider: BlobStorageProvider): void {
  defaultProvider = provider;
  logger.debug('[BlobStorage] Provider set', { provider: provider.providerId });
}

export function resetBlobStorageProvider(): void {
  defaultProvider = null;
}

export async function storeBlob(
  data: Buffer,
  mimeType: string,
  refContext?: {
    evalId?: string;
    testIdx?: number;
    promptIdx?: number;
    location?: string;
    kind?: string;
  },
): Promise<BlobStoreResult> {
  const provider = getBlobStorageProvider();
  const result = await provider.store(data, mimeType);

  // Track asset and reference in DB for dedup/auth/cascade
  const db = getDb();
  db.transaction(() => {
    db.insert(blobAssetsTable)
      .values({
        hash: result.ref.hash,
        sizeBytes: result.ref.sizeBytes,
        mimeType: result.ref.mimeType,
        provider: result.ref.provider,
      })
      .onConflictDoNothing()
      .run();

    if (refContext?.evalId) {
      db.insert(blobReferencesTable)
        .values({
          id: randomUUID(),
          blobHash: result.ref.hash,
          evalId: refContext.evalId,
          testIdx: refContext.testIdx,
          promptIdx: refContext.promptIdx,
          location: refContext.location,
          kind: refContext.kind,
        })
        .onConflictDoNothing()
        .run();
    }
  });

  return result;
}

export async function getBlobByHash(hash: string): Promise<StoredBlob> {
  const provider = getBlobStorageProvider();
  return provider.getByHash(hash);
}

export async function getBlobUrl(hash: string, expiresInSeconds?: number): Promise<string | null> {
  const provider = getBlobStorageProvider();
  return provider.getUrl(hash, expiresInSeconds);
}
