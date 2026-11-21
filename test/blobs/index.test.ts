import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { eq, inArray, sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getShareAuthorizedBlob,
  isBlobAllowedForShare,
  recordBlobReference,
  resetBlobStorageProvider,
  setBlobStorageProvider,
  storeBlob,
} from '../../src/blobs';
import { BLOB_MIN_SIZE } from '../../src/blobs/constants';
import { extractAndStoreBinaryData } from '../../src/blobs/extractor';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import * as cache from '../../src/cache';
import { getDb } from '../../src/database';
import { blobAssetsTable, blobReferencesTable, evalsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import { ModelsLabImageProvider } from '../../src/providers/modelslab';
import * as fetchUtils from '../../src/util/fetch/index';
import { createDeferred, createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';

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

describe('storeBlob persistence failures with shared files', () => {
  const data = Buffer.from('shared blob rollback fixture');
  const mimeType = 'application/octet-stream';
  const hash = createHash('sha256').update(data).digest('hex');
  const firstEvalId = `eval-${randomUUID()}`;
  const secondEvalId = `eval-${randomUUID()}`;
  const missingEvalId = `missing-${randomUUID()}`;
  const failingEvalId = `eval-${randomUUID()}`;
  let tempDir: string;
  let provider: FilesystemBlobStorageProvider;
  let restoreEnv: () => void;
  let db: Awaited<ReturnType<typeof getDb>>;
  let transactionError: unknown;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    tempDir = createTempDir('promptfoo-blob-rollback-');
    restoreEnv = mockProcessEnv({ PROMPTFOO_CONFIG_DIR: tempDir, PROMPTFOO_INLINE_MEDIA: 'false' });
    provider = new FilesystemBlobStorageProvider({ basePath: path.join(tempDir, 'blobs') });
    setBlobStorageProvider(provider);
    db = await getDb();
    await db.insert(evalsTable).values([
      { id: firstEvalId, config: {}, results: {} },
      { id: secondEvalId, config: {}, results: {} },
      { id: failingEvalId, config: {}, results: {} },
    ]);
    await db.run(sql`CREATE TRIGGER blob_reference_fixture_failure BEFORE INSERT ON blob_references
      WHEN NEW.location = 'fixture-failure'
      BEGIN SELECT RAISE(FAIL, 'fixture reference failure'); END`);
    transactionError = undefined;
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((callback, config) =>
      transaction(callback, config).catch((error: unknown) => {
        transactionError = error;
        throw error;
      }),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetBlobStorageProvider();
    try {
      await db.run(sql`DROP TRIGGER IF EXISTS blob_reference_fixture_failure`);
      await db.delete(blobReferencesTable).where(eq(blobReferencesTable.blobHash, hash));
      await db.delete(blobAssetsTable).where(eq(blobAssetsTable.hash, hash));
      await db
        .delete(evalsTable)
        .where(inArray(evalsTable.id, [firstEvalId, secondEvalId, failingEvalId]));
    } finally {
      restoreEnv();
      removeTempDir(tempDir);
    }
  });

  async function snapshotFiles() {
    const filePath = path.join(tempDir, 'blobs', hash.slice(0, 2), hash.slice(2, 4), hash);
    return {
      bytes: await readFile(filePath),
      metadata: await readFile(`${filePath}.meta.json`, 'utf8'),
    };
  }

  async function snapshotRows() {
    return {
      assets: await db.select().from(blobAssetsTable).where(eq(blobAssetsTable.hash, hash)),
      references: await db
        .select()
        .from(blobReferencesTable)
        .where(eq(blobReferencesTable.blobHash, hash)),
    };
  }

  async function expectOriginalPersistenceError(pending: Promise<unknown>) {
    const error = await pending.then(
      () => {
        throw new Error('Expected the real blob reference transaction to reject');
      },
      (rejection: unknown) => rejection,
    );
    expect(transactionError).toBeDefined();
    expect(error).toBe(transactionError);
  }

  it.each(['store', 'reference'])(
    'does not authorize stored media for non-persisted eval IDs: %s',
    async (operation) => {
      await storeBlob(data, mimeType);
      if (operation === 'store') {
        await expect(
          storeBlob(data, mimeType, { evalId: missingEvalId, kind: 'image' }),
        ).rejects.toThrow();
      } else {
        await expect(
          recordBlobReference(hash, { evalId: missingEvalId, kind: 'image' }),
        ).resolves.toBeUndefined();
      }
      const rows = await snapshotRows();
      expect(rows.assets).toHaveLength(1);
      expect(rows.references).toEqual([]);
      expect((await provider.getByHash(hash)).data).toEqual(data);
      await expect(isBlobAllowedForShare(hash, missingEvalId)).resolves.toBe(false);
    },
  );

  it('preserves the ModelsLab image URL when its eval is not persisted', async () => {
    const imageUrl = 'https://example.com/fixture.png';
    vi.spyOn(cache, 'fetchWithCache').mockResolvedValue({
      data: { status: 'success', output: [imageUrl] },
      cached: false,
      status: 200,
      statusText: 'OK',
      deleteFromCache: vi.fn(),
    });
    vi.spyOn(fetchUtils, 'fetchWithProxy').mockResolvedValue(
      new Response(data, { headers: { 'content-type': 'image/png' } }),
    );
    const imageProvider = new ModelsLabImageProvider('fixture', {
      config: { apiKey: 'fixture-only' },
    });

    const response = await imageProvider.callApi('fixture', {
      evaluationId: missingEvalId,
      prompt: { raw: 'fixture', label: 'fixture' },
      vars: {},
    });

    expect(response.output).toContain(imageUrl);
    expect(response.metadata).toBeUndefined();
    expect(response.error).toBeUndefined();
    expect((await snapshotRows()).references).toEqual([]);
  });

  it.each([false, true])('stores audio only when its eval is persisted: %s', async (persisted) => {
    const audioData = Buffer.alloc(BLOB_MIN_SIZE, 1);
    const audioHash = createHash('sha256').update(audioData).digest('hex');
    const response = {
      output: 'fixture',
      audio: { data: audioData.toString('base64'), format: 'wav' },
    };

    try {
      const evalId = persisted ? firstEvalId : missingEvalId;
      const result = await extractAndStoreBinaryData(response, { evalId });
      if (persisted) {
        expect(result?.audio?.data).toBeUndefined();
        expect(result?.audio?.blobRef?.hash).toBe(audioHash);
      } else {
        expect(result).toBe(response);
      }
      expect(await provider.exists(audioHash)).toBe(persisted);
      expect(await isBlobAllowedForShare(audioHash, evalId)).toBe(persisted);
    } finally {
      await db.delete(blobReferencesTable).where(eq(blobReferencesTable.blobHash, audioHash));
      await db.delete(blobAssetsTable).where(eq(blobAssetsTable.hash, audioHash));
    }
  });

  it('preserves already shared files when a later reference transaction fails', async () => {
    await storeBlob(data, mimeType, { evalId: firstEvalId, location: 'import' });
    const files = await snapshotFiles();
    const rows = await snapshotRows();

    await expectOriginalPersistenceError(
      storeBlob(data, mimeType, { evalId: failingEvalId, location: 'fixture-failure' }),
    );

    expect(await snapshotRows()).toEqual(rows);
    expect(await provider.exists(hash)).toBe(true);
    expect(await snapshotFiles()).toEqual(files);
    expect((await getShareAuthorizedBlob(hash, firstEvalId))?.data).toEqual(data);
    await expect(isBlobAllowedForShare(hash, missingEvalId)).resolves.toBe(false);
  });

  it('preserves newly created files adopted before their first transaction fails', async () => {
    const created = createDeferred<boolean>();
    const release = createDeferred<void>();
    let firstStore = true;
    const gatedProvider: BlobStorageProvider = {
      providerId: provider.providerId,
      store: async (bytes, type) => {
        const pause = firstStore;
        firstStore = false;
        try {
          const result = await provider.store(bytes, type);
          if (pause) {
            created.resolve(result.deduplicated);
            await release.promise;
          }
          return result;
        } catch (error) {
          if (pause) {
            created.reject(error);
          }
          throw error;
        }
      },
      getByHash: (key) => provider.getByHash(key),
      exists: (key) => provider.exists(key),
      deleteByHash: (key) => provider.deleteByHash(key),
      getUrl: (key, expires) => provider.getUrl(key, expires),
    };
    setBlobStorageProvider(gatedProvider);
    // Attach the rejection observer before starting the other store.
    const failingStore = expectOriginalPersistenceError(
      storeBlob(data, mimeType, { evalId: failingEvalId, location: 'fixture-failure' }),
    );
    try {
      expect(await created.promise).toBe(false);
      const adopted = await storeBlob(data, mimeType, {
        evalId: secondEvalId,
        location: 'import',
      });
      expect(adopted.deduplicated).toBe(true);
      const files = await snapshotFiles();
      const rows = await snapshotRows();
      expect(rows.references).toHaveLength(1);
      expect(rows.references[0].evalId).toBe(secondEvalId);

      release.resolve();
      await failingStore;

      expect(await snapshotRows()).toEqual(rows);
      expect(await provider.exists(hash)).toBe(true);
      expect(await snapshotFiles()).toEqual(files);
      expect((await getShareAuthorizedBlob(hash, secondEvalId))?.data).toEqual(data);
    } finally {
      release.resolve();
      await failingStore;
    }
  });

  it('retains unreferenced files after failure and permits a later valid adoption', async () => {
    await expectOriginalPersistenceError(
      storeBlob(data, mimeType, { evalId: failingEvalId, location: 'fixture-failure' }),
    );

    expect(await snapshotRows()).toEqual({ assets: [], references: [] });
    expect(await provider.exists(hash)).toBe(true);
    const files = await snapshotFiles();
    await expect(getShareAuthorizedBlob(hash, firstEvalId)).resolves.toBeNull();

    await expect(
      recordBlobReference(hash, { evalId: firstEvalId, location: 'import' }),
    ).resolves.toBeUndefined();
    expect(await snapshotRows()).toEqual({ assets: [], references: [] });
    expect(await snapshotFiles()).toEqual(files);
    await expect(getShareAuthorizedBlob(hash, firstEvalId)).resolves.toBeNull();

    const adopted = await storeBlob(data, mimeType, { evalId: firstEvalId, location: 'import' });

    expect(adopted.deduplicated).toBe(true);
    expect(await snapshotFiles()).toEqual(files);
    const rows = await snapshotRows();
    expect(rows.assets).toHaveLength(1);
    expect(rows.references).toHaveLength(1);
    expect((await getShareAuthorizedBlob(hash, firstEvalId))?.data).toEqual(data);
  });

  it('keeps the remaining eval authorized when one shared reference cascades away', async () => {
    const first = await storeBlob(data, mimeType, { evalId: firstEvalId, location: 'import' });
    const second = await storeBlob(data, mimeType, { evalId: secondEvalId, location: 'import' });
    const files = await snapshotFiles();
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect((await snapshotRows()).assets).toHaveLength(1);
    expect((await snapshotRows()).references).toHaveLength(2);

    await db.delete(evalsTable).where(eq(evalsTable.id, firstEvalId));

    expect((await snapshotRows()).references).toHaveLength(1);
    await expect(getShareAuthorizedBlob(hash, firstEvalId)).resolves.toBeNull();
    expect((await getShareAuthorizedBlob(hash, secondEvalId))?.data).toEqual(data);
    expect(await snapshotFiles()).toEqual(files);
  });

  it('preserves a registered MIME type when another caller deduplicates the bytes', async () => {
    await storeBlob(data, 'image/png', { evalId: firstEvalId, location: 'import' });
    const files = await snapshotFiles();

    const stored = await storeBlob(data, 'audio/wav', {
      evalId: secondEvalId,
      location: 'import',
      kindFromMimeType: (type) => type.split('/', 1)[0],
    });

    expect(stored.deduplicated).toBe(true);
    expect(stored.ref.mimeType).toBe('image/png');
    expect((await snapshotRows()).assets[0].mimeType).toBe('image/png');
    expect((await snapshotRows()).references[1].kind).toBe('image');
    expect((await getShareAuthorizedBlob(hash, secondEvalId))?.metadata.mimeType).toBe('image/png');
    expect(await snapshotFiles()).toEqual(files);
  });

  it('uses provider metadata when registering newly created bytes', async () => {
    const store = provider.store.bind(provider);
    vi.spyOn(provider, 'store').mockImplementation((bytes) => store(bytes, 'image/png'));

    const stored = await storeBlob(data, 'application/octet-stream', {
      evalId: firstEvalId,
      location: 'import',
    });

    expect(stored.deduplicated).toBe(false);
    expect(stored.ref.mimeType).toBe('image/png');
    expect((await snapshotRows()).assets[0].mimeType).toBe('image/png');
  });

  it('preserves asset-first import storage without granting unclassified access', async () => {
    const stored = await storeBlob(data, mimeType);
    const files = await snapshotFiles();
    expect(stored.ref.hash).toBe(hash);
    expect((await snapshotRows()).assets).toHaveLength(1);
    expect((await snapshotRows()).references).toHaveLength(0);
    await expect(getShareAuthorizedBlob(hash, firstEvalId)).resolves.toBeNull();

    // A non-persisted eval must not acquire a share-authorized reference.
    await expect(
      recordBlobReference(hash, { evalId: missingEvalId, location: 'import' }),
    ).resolves.toBeUndefined();
    expect((await snapshotRows()).references).toHaveLength(0);

    await recordBlobReference(hash, { evalId: firstEvalId, location: 'response.output' });
    await expect(getShareAuthorizedBlob(hash, firstEvalId)).resolves.toBeNull();
    await recordBlobReference(hash, { evalId: firstEvalId, location: 'import' });

    expect((await snapshotRows()).references).toHaveLength(1);
    expect((await getShareAuthorizedBlob(hash, firstEvalId))?.data).toEqual(data);
    await expect(getShareAuthorizedBlob(hash, secondEvalId)).resolves.toBeNull();
    expect(await snapshotFiles()).toEqual(files);
  });
});
