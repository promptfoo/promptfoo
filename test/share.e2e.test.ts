import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Server } from 'node:http';

import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getBlobByHash } from '../src/blobs';
import { getDb } from '../src/database';
import { blobAssetsTable, blobReferencesTable } from '../src/database/tables';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';
import { createApp } from '../src/server/server';

const execFileAsync = promisify(execFile);

describe('self-hosted sharing end to end', () => {
  let server: Server;
  let baseUrl: string;
  const evalIds = new Set<string>();
  const blobHashes = new Set<string>();

  beforeAll(async () => {
    await runDbMigrations();
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected an ephemeral TCP address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    for (const evalId of evalIds) {
      const eval_ = await Eval.findById(evalId);
      if (eval_) {
        await eval_.delete({ notify: false });
      }
    }
    evalIds.clear();

    if (blobHashes.size > 0) {
      const db = await getDb();
      await db.delete(blobAssetsTable).where(inArray(blobAssetsTable.hash, [...blobHashes]));
      blobHashes.clear();
    }
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it.each([false, true])(
    'shares results, traces, media, and provenance through the real server (inline=%s)',
    async (inlineBlobs) => {
      const senderDir = await mkdtemp(path.join(tmpdir(), 'promptfoo-share-sender-'));
      try {
        const outputFile = path.join(senderDir, 'result.json');
        await execFileAsync(
          process.execPath,
          [
            '--import',
            'tsx',
            path.join(__dirname, 'fixtures/share/sender.ts'),
            baseUrl,
            outputFile,
          ],
          {
            cwd: path.resolve(__dirname, '..'),
            env: {
              ...process.env,
              IS_TESTING: 'true',
              PROMPTFOO_CONFIG_DIR: senderDir,
              PROMPTFOO_SHARE_INLINE_BLOBS: String(inlineBlobs),
              PROMPTFOO_DISABLE_TELEMETRY: '1',
              PROMPTFOO_DISABLE_UPDATE: '1',
            },
            timeout: 20_000,
          },
        );
        const { shareUrl, sourceId, traceId, media, data } = JSON.parse(
          await readFile(outputFile, 'utf8'),
        );
        const mediaBytes = Buffer.from(data, 'base64');
        blobHashes.add(media.hash);
        expect(shareUrl).not.toBeNull();
        const remoteEvalId = new URL(shareUrl as string).pathname.split('/').filter(Boolean).at(-1);
        expect(remoteEvalId).toBeTruthy();
        evalIds.add(remoteEvalId as string);
        expect(remoteEvalId).not.toBe(sourceId);
        expect(await Eval.findById(sourceId)).toBeUndefined();

        const remoteEval = await Eval.findById(remoteEvalId as string);
        expect(remoteEval).not.toBeNull();
        const [remoteResult] = await remoteEval!.getResults();
        const output = remoteResult.response?.output as string;
        if (inlineBlobs) {
          expect(output).toContain(`data:image/png;base64,${mediaBytes.toString('base64')}`);
        } else {
          expect(output).toContain(media.uri);
        }

        const [remoteTrace] = await remoteEval!.getTraces();
        expect(remoteTrace).toMatchObject({
          evaluationId: remoteEvalId,
          testCaseId: 'share-test-case',
          metadata: {
            evaluationId: remoteEvalId,
            media: media.uri,
            promptIdx: 0,
            testIdx: 0,
          },
        });
        expect(remoteTrace.traceId).not.toBe(traceId);
        expect(remoteTrace.spans[0].attributes).toMatchObject({
          'evaluation.id': remoteEvalId,
          'promptfoo.eval.id': remoteEvalId,
          'promptfoo.trace_id': remoteTrace.traceId,
        });

        const db = await getDb();
        const remoteRefs = await db
          .select()
          .from(blobReferencesTable)
          .where(eq(blobReferencesTable.evalId, remoteEvalId as string));
        expect(remoteRefs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              blobHash: media.hash,
              promptIdx: 0,
              testIdx: 0,
            }),
          ]),
        );
        await expect(getBlobByHash(media.hash)).resolves.toMatchObject({
          data: mediaBytes,
          metadata: { mimeType: 'image/png' },
        });
      } finally {
        await rm(senderDir, { recursive: true, force: true });
      }
    },
  );
});
