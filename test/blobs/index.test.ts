import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getShareAuthorizedBlob,
  isBlobAllowedForShare,
  recordBlobReference,
  resetBlobStorageProvider,
  setBlobStorageProvider,
} from '../../src/blobs';
import { getDb } from '../../src/database';
import { blobAssetsTable, blobReferencesTable, evalsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';

import type { BlobStorageProvider } from '../../src/blobs';

describe('blob share authorization', () => {
  const evalId = `eval-${randomUUID()}`;
  const otherEvalId = `eval-${randomUUID()}`;
  const trustedHash = 'a'.repeat(64);
  const unclassifiedHash = 'b'.repeat(64);
  const importedHash = 'c'.repeat(64);
  const otherEvalHash = 'd'.repeat(64);
  const hashes = [trustedHash, unclassifiedHash, importedHash, otherEvalHash];

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.insert(evalsTable).values([
      { id: evalId, config: {}, results: {} },
      { id: otherEvalId, config: {}, results: {} },
    ]);
    await db.insert(blobAssetsTable).values(
      hashes.map((hash) => ({
        hash,
        mimeType: 'image/png',
        provider: 'filesystem',
        sizeBytes: 1,
      })),
    );
    await db.insert(blobReferencesTable).values([
      {
        id: randomUUID(),
        blobHash: trustedHash,
        evalId,
        kind: 'image',
        location: 'response.output',
      },
      {
        id: randomUUID(),
        blobHash: unclassifiedHash,
        evalId,
        location: 'response.output',
      },
      {
        id: randomUUID(),
        blobHash: importedHash,
        evalId,
        location: 'import',
      },
      {
        id: randomUUID(),
        blobHash: otherEvalHash,
        evalId: otherEvalId,
        kind: 'image',
        location: 'response.output',
      },
    ]);
  });

  afterEach(async () => {
    const db = await getDb();
    await db
      .delete(blobReferencesTable)
      .where(inArray(blobReferencesTable.evalId, [evalId, otherEvalId]));
    await db.delete(blobAssetsTable).where(inArray(blobAssetsTable.hash, hashes));
    await db.delete(evalsTable).where(inArray(evalsTable.id, [evalId, otherEvalId]));
  });

  it('allows only trusted references associated with the local eval', async () => {
    await expect(isBlobAllowedForShare(trustedHash, evalId)).resolves.toBe(true);
    await expect(isBlobAllowedForShare(importedHash, evalId)).resolves.toBe(true);
    await expect(isBlobAllowedForShare(unclassifiedHash, evalId)).resolves.toBe(false);
    await expect(isBlobAllowedForShare(otherEvalHash, evalId)).resolves.toBe(false);
  });

  it('does not authorize a trusted hash after its eval association is removed', async () => {
    const db = await getDb();
    await db.delete(blobReferencesTable).where(eq(blobReferencesTable.blobHash, trustedHash));

    await expect(isBlobAllowedForShare(trustedHash, evalId)).resolves.toBe(false);
  });

  it('reads local bytes only for share-authorized references', async () => {
    setBlobStorageProvider({
      providerId: 'test-stub',
      store: async () => {
        throw new Error('not implemented');
      },
      getByHash: async (hash: string) => ({
        data: Buffer.from('trusted-bytes'),
        metadata: {
          createdAt: '2026-06-08T00:00:00.000Z',
          key: hash,
          mimeType: 'image/png',
          provider: 'test-stub',
          sizeBytes: 13,
        },
      }),
      exists: async () => true,
      deleteByHash: async () => {},
      getUrl: async () => null,
    });

    try {
      await expect(getShareAuthorizedBlob(unclassifiedHash, evalId)).resolves.toBeNull();
      await expect(getShareAuthorizedBlob(otherEvalHash, evalId)).resolves.toBeNull();

      const blob = await getShareAuthorizedBlob(trustedHash, evalId);
      expect(blob?.data.toString()).toBe('trusted-bytes');
    } finally {
      resetBlobStorageProvider();
    }
  });
});

describe('recordBlobReference provenance upgrades', () => {
  const evalId = `eval-${randomUUID()}`;
  const hash = 'e'.repeat(64);

  const stubProvider: BlobStorageProvider = {
    providerId: 'test-stub',
    store: async () => {
      throw new Error('not implemented');
    },
    getByHash: async () => {
      throw new Error('not implemented');
    },
    exists: async () => true,
    deleteByHash: async () => {},
    getUrl: async () => null,
  };

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    setBlobStorageProvider(stubProvider);
    const db = await getDb();
    await db.insert(evalsTable).values([{ id: evalId, config: {}, results: {} }]);
    await db
      .insert(blobAssetsTable)
      .values([{ hash, mimeType: 'image/png', provider: 'filesystem', sizeBytes: 1 }]);
  });

  afterEach(async () => {
    resetBlobStorageProvider();
    const db = await getDb();
    await db.delete(blobReferencesTable).where(eq(blobReferencesTable.evalId, evalId));
    await db.delete(blobAssetsTable).where(eq(blobAssetsTable.hash, hash));
    await db.delete(evalsTable).where(eq(evalsTable.id, evalId));
  });

  async function getReferenceRows() {
    const db = await getDb();
    return db.select().from(blobReferencesTable).where(eq(blobReferencesTable.evalId, evalId));
  }

  it('upgrades an unclassified reference once the blob is independently classified', async () => {
    await recordBlobReference(hash, { evalId, location: 'response.output' });
    await expect(isBlobAllowedForShare(hash, evalId)).resolves.toBe(false);

    await recordBlobReference(hash, { evalId, kind: 'image', location: 'response.images[0].data' });

    await expect(isBlobAllowedForShare(hash, evalId)).resolves.toBe(true);
    const rows = await getReferenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('image');
  });

  it('does not authorize re-recorded scan references that carry no kind', async () => {
    await recordBlobReference(hash, { evalId, location: 'response.output' });
    await recordBlobReference(hash, { evalId, location: 'response.metadata' });

    await expect(isBlobAllowedForShare(hash, evalId)).resolves.toBe(false);
    const rows = await getReferenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBeNull();
  });

  it('does not downgrade a classified reference when re-recorded without a kind', async () => {
    await recordBlobReference(hash, { evalId, kind: 'image', location: 'response.output' });
    await recordBlobReference(hash, { evalId, location: 'response.metadata' });

    await expect(isBlobAllowedForShare(hash, evalId)).resolves.toBe(true);
    const rows = await getReferenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('image');
  });

  it('upgrades a scan reference to import provenance', async () => {
    await recordBlobReference(hash, { evalId, location: 'response.output' });
    await expect(isBlobAllowedForShare(hash, evalId)).resolves.toBe(false);

    await recordBlobReference(hash, { evalId, location: 'import' });

    await expect(isBlobAllowedForShare(hash, evalId)).resolves.toBe(true);
    const rows = await getReferenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].location).toBe('import');
  });
});
