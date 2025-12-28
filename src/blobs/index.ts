import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
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
  try {
    db.transaction(() => {
      const assetInsert = db
        .insert(blobAssetsTable)
        .values({
          hash: result.ref.hash,
          sizeBytes: result.ref.sizeBytes,
          mimeType: result.ref.mimeType,
          provider: result.ref.provider,
        })
        .onConflictDoNothing()
        .run();

      const refInsert =
        refContext?.evalId &&
        db
          .insert(blobReferencesTable)
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

      // Return a non-undefined value to satisfy Drizzle's sync transaction semantics
      return refInsert ?? assetInsert;
    });
  } catch (error) {
    // Roll back filesystem write if DB persistence fails
    try {
      await provider.deleteByHash(result.ref.hash);
    } catch (cleanupError) {
      logger.warn('[BlobStorage] Failed to rollback blob after DB error', {
        error: cleanupError,
        hash: result.ref.hash,
      });
    }
    throw error;
  }

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

export async function recordBlobReference(
  hash: string,
  refContext: {
    evalId?: string;
    testIdx?: number;
    promptIdx?: number;
    location?: string;
    kind?: string;
  },
): Promise<void> {
  if (!refContext.evalId) {
    return;
  }

  const provider = getBlobStorageProvider();
  const exists = await provider.exists(hash).catch(() => false);
  if (!exists) {
    logger.debug('[BlobStorage] Attempted to record reference for missing blob', {
      hash,
      evalId: refContext.evalId,
      location: refContext.location,
    });
    return;
  }

  const db = getDb();
  const existing = db
    .select({ id: blobReferencesTable.id })
    .from(blobReferencesTable)
    .where(
      and(
        eq(blobReferencesTable.blobHash, hash),
        eq(blobReferencesTable.evalId, refContext.evalId),
      ),
    )
    .get();

  if (existing) {
    return;
  }

  db.insert(blobReferencesTable)
    .values({
      id: randomUUID(),
      blobHash: hash,
      evalId: refContext.evalId,
      testIdx: refContext.testIdx,
      promptIdx: refContext.promptIdx,
      location: refContext.location,
      kind: refContext.kind,
    })
    .run();
}
