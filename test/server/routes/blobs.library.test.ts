import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { recordBlobReference, storeBlob } from '../../../src/blobs';
import { getDb } from '../../../src/database';
import { blobAssetsTable } from '../../../src/database/tables';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import { blobsRouter } from '../../../src/server/routes/blobs';

describe('media library reference selection', () => {
  beforeAll(() => runDbMigrations());

  it.each([{ kind: 'image', location: 'response.output' }, { location: 'import' }])(
    'keeps the classified $location context for an owned image',
    async (context) => {
      const eval_ = await Eval.create({}, [], { id: randomUUID() });
      const image = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1cAAAAASUVORK5CYII=',
        'base64',
      );
      let hash: string | undefined;
      try {
        const media = await storeBlob(image, 'image/png', { evalId: eval_.id, ...context });
        hash = media.ref.hash;
        await recordBlobReference(hash, { evalId: eval_.id, location: 'metadata.image' });
        const app = express();
        app.use('/api/blobs', blobsRouter);

        const response = await request(app).get('/api/blobs/library').query({ hash });

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([
          expect.objectContaining({
            url: `/api/blobs/${hash}?evalId=${encodeURIComponent(eval_.id)}`,
            context: expect.objectContaining({ evalId: eval_.id, location: context.location }),
          }),
        ]);
      } finally {
        await eval_.delete({ notify: false });
        if (hash) {
          const db = await getDb();
          await db.delete(blobAssetsTable).where(eq(blobAssetsTable.hash, hash));
        }
      }
    },
  );
});
