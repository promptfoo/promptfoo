import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isBlobAllowedForShare } from '../../src/blobs';
import { getDb } from '../../src/database';
import { blobAssetsTable, blobReferencesTable, evalsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';

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
});
