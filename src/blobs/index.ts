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

// MIME types retained by portable imports and allowed for inline blob responses.
const SAFE_INLINE_BLOB_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/ogg',
  'video/webm',
]);
const SAFE_INLINE_AUDIO_MIME_TYPE_REGEX = /^audio\/[a-z0-9_+-]+$/i;

export function isSafeInlineBlobMimeType(mimeType: string): boolean {
  return (
    SAFE_INLINE_BLOB_MIME_TYPES.has(mimeType.toLowerCase()) ||
    SAFE_INLINE_AUDIO_MIME_TYPE_REGEX.test(mimeType)
  );
}

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
  const db = await getDb();
  // Keep stored bytes if persistence fails: another eval may already reference them,
  // including bytes adopted after this store began. Unreferenced bytes are safer than data loss.
  const registeredMimeType = await db.transaction(async (tx) => {
    await tx
      .insert(blobAssetsTable)
      .values({
        hash: result.ref.hash,
        sizeBytes: result.ref.sizeBytes,
        // A deduplicated file may be an orphan from a failed transaction.
        // Adopt it with the current caller's MIME type, which imports sanitize.
        mimeType: result.deduplicated ? mimeType : result.ref.mimeType,
        provider: result.ref.provider,
      })
      .onConflictDoNothing()
      .run();

    if (refContext?.evalId) {
      await tx
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
    }

    const asset = await tx
      .select({ mimeType: blobAssetsTable.mimeType })
      .from(blobAssetsTable)
      .where(eq(blobAssetsTable.hash, result.ref.hash))
      .get();
    return asset!.mimeType;
  });

  return { ...result, ref: { ...result.ref, mimeType: registeredMimeType } };
}

export async function getBlobByHash(hash: string): Promise<StoredBlob> {
  const provider = getBlobStorageProvider();
  const blob = await provider.getByHash(hash);
  const db = await getDb();
  const asset = await db
    .select({ mimeType: blobAssetsTable.mimeType })
    .from(blobAssetsTable)
    .where(eq(blobAssetsTable.hash, hash))
    .get();
  // Registered metadata takes precedence over sidecars retained from failed stores.
  return asset ? { ...blob, metadata: { ...blob.metadata, mimeType: asset.mimeType } } : blob;
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
  // A failed store can retain bytes without committing their asset registration.
  // Referencing those bytes must not adopt them or create an invalid foreign key.
  const asset = await db
    .select({ hash: blobAssetsTable.hash })
    .from(blobAssetsTable)
    .where(eq(blobAssetsTable.hash, hash))
    .get();
  if (!asset) {
    return;
  }

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
