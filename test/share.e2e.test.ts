import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getBlobByHash, storeBlob } from '../src/blobs';
import { getDb } from '../src/database';
import { blobAssetsTable, blobReferencesTable } from '../src/database/tables';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';
import { createApp } from '../src/server/server';
import { createShareableUrl } from '../src/share';
import { ResultFailureReason } from '../src/types';
import EvalFactory from './factories/evalFactory';
import { mockProcessEnv } from './util/utils';

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

  it.each([
    false,
    true,
  ])('shares results, traces, media, and provenance through the real server (inline=%s)', async (inlineBlobs) => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_SHARE_INLINE_BLOBS: String(inlineBlobs),
    });
    try {
      const sourceEval = await EvalFactory.create({ numResults: 0 });
      const otherEval = await EvalFactory.create({ numResults: 0 });
      evalIds.add(sourceEval.id);
      evalIds.add(otherEval.id);
      sourceEval.config.sharing = { apiBaseUrl: baseUrl, appBaseUrl: baseUrl };
      await sourceEval.save();

      const mediaBytes = Buffer.from(`authorized-media-${randomUUID()}`);
      const copiedBytes = Buffer.from(`cross-eval-media-${randomUUID()}`);
      const media = await storeBlob(mediaBytes, 'image/png', {
        evalId: sourceEval.id,
        kind: 'image',
        location: 'response.output',
        promptIdx: 0,
        testIdx: 0,
      });
      const copied = await storeBlob(copiedBytes, 'image/png', {
        evalId: otherEval.id,
        kind: 'image',
        location: 'response.output',
        promptIdx: 0,
        testIdx: 0,
      });
      blobHashes.add(media.ref.hash);
      blobHashes.add(copied.ref.hash);

      const traceId = randomUUID().replaceAll('-', '');
      await sourceEval.addResult({
        description: 'share-e2e',
        promptIdx: 0,
        testIdx: 0,
        testCase: { metadata: { evaluationId: sourceEval.id }, vars: { input: 'hello' } },
        promptId: 'share-prompt',
        provider: { id: 'test-provider', label: 'test-provider' },
        prompt: { raw: 'hello', label: 'hello' },
        vars: { input: 'hello' },
        response: { output: `${media.ref.uri} ${copied.ref.uri}` },
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 1,
        gradingResult: null,
        namedScores: {},
        metadata: { evaluationId: sourceEval.id, traceId },
        evaluationId: sourceEval.id,
        traceId,
      });
      await sourceEval.appendTraces([
        {
          traceId,
          evaluationId: sourceEval.id,
          testCaseId: 'share-test-case',
          metadata: {
            evaluationId: sourceEval.id,
            media: media.ref.uri,
            promptIdx: 0,
            testIdx: 0,
            traceId,
          },
          spans: [
            {
              spanId: 'share-span',
              name: 'provider call',
              startTime: 1,
              attributes: {
                'evaluation.id': sourceEval.id,
                'promptfoo.eval.id': sourceEval.id,
                'promptfoo.trace_id': traceId,
              },
            },
          ],
        },
      ]);

      const shareUrl = await createShareableUrl(sourceEval, { silent: true });
      expect(shareUrl).not.toBeNull();
      const remoteEvalId = new URL(shareUrl as string).pathname.split('/').filter(Boolean).at(-1);
      expect(remoteEvalId).toBeTruthy();
      expect(remoteEvalId).not.toBe(sourceEval.id);
      evalIds.add(remoteEvalId as string);

      const remoteEval = await Eval.findById(remoteEvalId as string);
      expect(remoteEval).not.toBeNull();
      const [remoteResult] = await remoteEval!.getResults();
      const output = remoteResult.response?.output as string;
      if (inlineBlobs) {
        expect(output).toContain(`data:image/png;base64,${mediaBytes.toString('base64')}`);
      } else {
        expect(output).toContain(media.ref.uri);
      }
      // A copied URI has no source-eval authorization and must never transfer its bytes.
      expect(output).toContain(copied.ref.uri);

      const [remoteTrace] = await remoteEval!.getTraces();
      expect(remoteTrace).toMatchObject({
        evaluationId: remoteEvalId,
        testCaseId: 'share-test-case',
        metadata: {
          evaluationId: remoteEvalId,
          media: media.ref.uri,
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
            blobHash: media.ref.hash,
            promptIdx: 0,
            testIdx: 0,
          }),
        ]),
      );
      expect(remoteRefs.some((reference) => reference.blobHash === copied.ref.hash)).toBe(false);
      await expect(getBlobByHash(media.ref.hash)).resolves.toMatchObject({
        data: mediaBytes,
        metadata: { mimeType: 'image/png' },
      });
    } finally {
      restoreEnv();
    }
  });
});
