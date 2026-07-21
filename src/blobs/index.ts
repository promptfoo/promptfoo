import { randomUUID } from 'node:crypto';

import { and, eq, isNotNull, or } from 'drizzle-orm';
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
    abortSignal?: AbortSignal;
    evalId?: string;
    testIdx?: number;
    promptIdx?: number;
    location?: string;
    kind?: string;
  },
): Promise<BlobStoreResult> {
  const provider = getBlobStorageProvider();
  refContext?.abortSignal?.throwIfAborted();
  const result = await provider.store(data, mimeType);
  const referenceId = refContext?.evalId ? randomUUID() : undefined;
  let transactionCommitted = false;

  // Track asset and reference in DB for dedup/auth/cascade
  const db = await getDb();
  try {
    refContext?.abortSignal?.throwIfAborted();
    await db.transaction(async (tx) => {
      refContext?.abortSignal?.throwIfAborted();
      await tx
        .insert(blobAssetsTable)
        .values({
          hash: result.ref.hash,
          sizeBytes: result.ref.sizeBytes,
          mimeType: result.ref.mimeType,
          provider: result.ref.provider,
        })
        .onConflictDoNothing()
        .run();

      refContext?.abortSignal?.throwIfAborted();
      if (refContext?.evalId && referenceId) {
        await tx
          .insert(blobReferencesTable)
          .values({
            id: referenceId,
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
      refContext?.abortSignal?.throwIfAborted();
    });
    transactionCommitted = true;
    refContext?.abortSignal?.throwIfAborted();
  } catch (error) {
    let shouldDeleteBlob = !result.deduplicated || !refContext?.abortSignal?.aborted;
    try {
      if (transactionCommitted && refContext?.abortSignal?.aborted) {
        await db.transaction(async (tx) => {
          if (referenceId) {
            await tx
              .delete(blobReferencesTable)
              .where(eq(blobReferencesTable.id, referenceId))
              .run();
          }
          if (!result.deduplicated) {
            const remainingReference = await tx
              .select({ id: blobReferencesTable.id })
              .from(blobReferencesTable)
              .where(eq(blobReferencesTable.blobHash, result.ref.hash))
              .get();
            if (remainingReference) {
              shouldDeleteBlob = false;
            } else {
              await tx
                .delete(blobAssetsTable)
                .where(eq(blobAssetsTable.hash, result.ref.hash))
                .run();
            }
          }
        });
      }
      if (shouldDeleteBlob) {
        await provider.deleteByHash(result.ref.hash);
      }
    } catch (cleanupError) {
      logger.warn('[BlobStorage] Failed to rollback blob after storage error or cancellation', {
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

export async function isBlobAllowedForShare(hash: string, evalId: string): Promise<boolean> {
  const db = await getDb();
  // Result text may contain copied blob URIs, so only independently classified or imported refs
  // authorize reading local bytes during a share.
  const reference = await db
    .select({ id: blobReferencesTable.id })
    .from(blobReferencesTable)
    .where(
      and(
        eq(blobReferencesTable.blobHash, hash),
        eq(blobReferencesTable.evalId, evalId),
        or(isNotNull(blobReferencesTable.kind), eq(blobReferencesTable.location, 'import')),
      ),
    )
    .get();

  return Boolean(reference);
}

/**
 * Read local blob bytes for sharing, but only when the eval has trusted provenance for
 * the hash. Single chokepoint for every share path (remote upload and inline).
 */
export async function getShareAuthorizedBlob(
  hash: string,
  localEvalId: string,
): Promise<StoredBlob | null> {
  if (!(await isBlobAllowedForShare(hash, localEvalId))) {
    logger.warn('[Share] Skipping blob reference that is not authorized for this eval', {
      evalId: localEvalId,
      hash,
    });
    return null;
  }
  return getBlobByHash(hash);
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

  const db = await getDb();
  const existing = await db
    .select({
      id: blobReferencesTable.id,
      kind: blobReferencesTable.kind,
      location: blobReferencesTable.location,
    })
    .from(blobReferencesTable)
    .where(
      and(
        eq(blobReferencesTable.blobHash, hash),
        eq(blobReferencesTable.evalId, refContext.evalId),
      ),
    )
    .get();

  if (existing) {
    const strongerReference: { kind?: string; location?: string } = {
      ...(refContext.kind && !existing.kind && { kind: refContext.kind }),
      ...(refContext.location === 'import' &&
        existing.location !== 'import' && { location: 'import' }),
    };
    if (Object.keys(strongerReference).length > 0) {
      await db
        .update(blobReferencesTable)
        .set(strongerReference)
        .where(eq(blobReferencesTable.id, existing.id))
        .run();
    }
    return;
  }

  await db
    .insert(blobReferencesTable)
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
