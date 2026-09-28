import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getBlobByHash,
  getShareAuthorizedBlob,
  resetBlobStorageProvider,
  setBlobStorageProvider,
  storeBlob,
} from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import {
  assertEvalNotRunning,
  beginEvalRun,
  EVAL_ACTIVE_RUNS_KEY,
} from '../../src/database/evalRun';
import { getDb } from '../../src/database/index';
import { blobAssetsTable, blobReferencesTable, evalsTable } from '../../src/database/tables';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { ResultFailureReason } from '../../src/types/index';
import { sha256 } from '../../src/util/createHash';
import { deleteEvalResult } from '../../src/util/database';
import { createDefaultPromptMetrics } from '../../src/util/promptMetrics';
import EvalFactory from '../factories/evalFactory';
import { createDeferred, createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';

import type { EvaluateResult } from '../../src/types/index';

describe('completed evaluation media cleanup', () => {
  const evaluations: Eval[] = [];
  const releases: Array<(completed?: boolean) => Promise<void>> = [];
  let directory: string;
  let restoreEnv: () => void;
  const data = Buffer.alloc(2048, 7);
  const hash = sha256(data);

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    directory = createTempDir('promptfoo-owner-media-');
    setBlobStorageProvider(new FilesystemBlobStorageProvider({ basePath: directory }));
    restoreEnv = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'false' });
  });

  afterEach(async () => {
    for (const release of releases.splice(0)) {
      await release(false);
    }
    for (const evaluation of evaluations.splice(0)) {
      await evaluation.delete({ notify: false });
    }
    resetBlobStorageProvider();
    restoreEnv();
    removeTempDir(directory);
  });

  async function createEvaluation() {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    evaluation.prompts[0].metrics = createDefaultPromptMetrics();
    await evaluation.addPrompts(evaluation.prompts);
    evaluations.push(evaluation);
    return evaluation;
  }

  async function begin(evaluation: Eval) {
    const release = await beginEvalRun(evaluation);
    releases.push(release);
    return release;
  }

  async function references(evalId: string) {
    return (await getDb())
      .select()
      .from(blobReferencesTable)
      .where(eq(blobReferencesTable.evalId, evalId));
  }

  async function addResult(evaluation: Eval, testIdx: number, withMedia = false) {
    const result: EvaluateResult = {
      testIdx,
      promptIdx: 0,
      prompt: { raw: 'media', label: 'media' },
      promptId: 'media',
      provider: { id: 'media-test' },
      testCase: {},
      vars: {},
      response: {
        output: 'saved result',
        ...(withMedia && { audio: { data: data.toString('base64'), format: 'wav' } }),
      },
      success: true,
      score: 1,
      failureReason: ResultFailureReason.NONE,
      latencyMs: 0,
      cost: 0,
      namedScores: {},
      gradingResult: { pass: true, score: 1, reason: 'No assertions', componentResults: [] },
    };
    await evaluation.addResult(result);
    evaluation.prompts[0].metrics!.testPassCount++;
    await evaluation.addPrompts(evaluation.prompts);
  }

  it('removes media from abandoned grading while preserving stored bytes', async () => {
    const evaluation = await createEvaluation();
    const entered = createDeferred<void>();
    const releaseGrading = createDeferred<void>();
    const graded = createDeferred<void>();
    const releaseFast = createDeferred<void>();
    const controller = new AbortController();
    const running = evaluate(
      {
        prompts: [{ raw: '{{ row }}', label: 'media' }],
        providers: [
          {
            id: () => 'pregrading-media',
            callApi: async (prompt) => {
              if (prompt === 'slow') {
                return { output: 'media', audio: { data: data.toString('base64'), format: 'wav' } };
              }
              await releaseFast.promise;
              return { output: 'fast' };
            },
          },
        ],
        tests: ['slow', 'fast', 'queued'].map((row) => ({
          vars: { row },
          assert: [
            {
              type: 'javascript',
              value: async () => {
                if (row === 'slow') {
                  entered.resolve();
                  await releaseGrading.promise;
                  graded.resolve();
                }
                return true;
              },
            },
          ],
        })),
      },
      evaluation,
      { maxConcurrency: 2, timeoutMs: 0, abortSignal: controller.signal },
    );
    try {
      await entered.promise;
      expect(await references(evaluation.id)).toHaveLength(1);
      controller.abort();
      releaseFast.resolve();
      await running;
      const rows = await EvalResult.findManyByEvalId(evaluation.id);
      expect(rows.map((row) => row.testIdx)).toEqual([1]);
      expect(await references(evaluation.id)).toEqual([]);
      expect(await getShareAuthorizedBlob(hash, evaluation.id)).toBeNull();
      expect((await getBlobByHash(hash)).data).toEqual(data);
      await deleteEvalResult(evaluation.id, rows[0].id);
      releaseGrading.resolve();
      await graded.promise;
      expect(await references(evaluation.id)).toEqual([]);
    } finally {
      releaseGrading.resolve();
      releaseFast.resolve();
      await running;
    }
  });

  it('waits for the last owner and preserves import and evaluation-wide references', async () => {
    const evaluation = await createEvaluation();
    const first = await begin(evaluation);
    const second = await begin(evaluation);
    for (const scope of [{ testIdx: 2, promptIdx: 0 }, { testIdx: 2 }, { promptIdx: 0 }, {}]) {
      await storeBlob(data, 'audio/wav', { evalId: evaluation.id, kind: 'audio', ...scope });
    }
    await storeBlob(data, 'audio/wav', {
      evalId: evaluation.id,
      testIdx: 2,
      promptIdx: 0,
      location: 'import',
    });
    await first();
    expect(await references(evaluation.id)).toHaveLength(5);
    await second();
    const remaining = await references(evaluation.id);
    expect(remaining).toHaveLength(2);
    expect(remaining.some((ref) => ref.location === 'import')).toBe(true);
    expect(remaining.some((ref) => ref.testIdx === null && ref.promptIdx === null)).toBe(true);
    expect((await getBlobByHash(hash)).data).toEqual(data);
  });

  it('preserves old retry rows and each independently stored survivor scope', async () => {
    const evaluation = await createEvaluation();
    await addResult(evaluation, 0, true);
    const release = await begin(evaluation);
    await storeBlob(data, 'audio/wav', {
      evalId: evaluation.id,
      testIdx: 0,
      promptIdx: 0,
      kind: 'audio',
    });
    await storeBlob(data, 'audio/wav', {
      evalId: evaluation.id,
      testIdx: 9,
      promptIdx: 0,
      kind: 'audio',
    });
    await storeBlob(data, 'audio/wav', { evalId: evaluation.id, testIdx: 0, kind: 'audio' });
    await storeBlob(data, 'audio/wav', { evalId: evaluation.id, promptIdx: 0, kind: 'audio' });
    await addResult(evaluation, 1, true);
    await release();
    const remaining = await references(evaluation.id);
    expect(remaining).toHaveLength(5);
    expect(remaining.every((ref) => ref.testIdx !== 9)).toBe(true);
    expect((await getShareAuthorizedBlob(hash, evaluation.id))?.data).toEqual(data);
    expect(
      await (await getDb()).select().from(blobAssetsTable).where(eq(blobAssetsTable.hash, hash)),
    ).toHaveLength(1);
  });

  it('retains media when another owner leaves interruption evidence', async () => {
    const evaluation = await createEvaluation();
    const first = await begin(evaluation);
    const second = await begin(evaluation);
    await storeBlob(data, 'audio/wav', {
      evalId: evaluation.id,
      testIdx: 0,
      promptIdx: 0,
      kind: 'audio',
    });
    await first(false);
    await second();
    expect(await references(evaluation.id)).toHaveLength(1);
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow('--resume');
  });

  it('preserves recoverable media after a failed result INSERT, including a later run', async () => {
    const evaluation = await createEvaluation();
    const db = await getDb();
    await db.run(
      sql`CREATE TRIGGER owner_media_failed_insert BEFORE INSERT ON eval_results BEGIN SELECT RAISE(FAIL, 'failed result insert'); END`,
    );
    try {
      await evaluate(
        {
          prompts: [{ raw: 'media', label: 'media' }],
          providers: [
            {
              id: () => 'failed-media-write',
              callApi: async () => ({
                output: 'media',
                audio: { data: data.toString('base64'), format: 'wav' },
              }),
            },
          ],
          tests: [{}],
        },
        evaluation,
        { maxConcurrency: 1 },
      );
    } finally {
      await db.run(sql`DROP TRIGGER owner_media_failed_insert`);
    }
    expect(evaluation.resultPersistenceFailed).toBe(true);
    expect(await EvalResult.findManyByEvalId(evaluation.id)).toEqual([]);
    expect(evaluation.prompts[0].metrics!.testPassCount).toBe(1);
    const release = await begin((await Eval.findById(evaluation.id))!);
    await release();
    expect(await references(evaluation.id)).toHaveLength(1);
    expect((await getShareAuthorizedBlob(hash, evaluation.id))?.data).toEqual(data);
  });

  it('rolls back ownership release when reference cleanup fails', async () => {
    const evaluation = await createEvaluation();
    const release = await begin(evaluation);
    await storeBlob(data, 'audio/wav', {
      evalId: evaluation.id,
      testIdx: 0,
      promptIdx: 0,
      kind: 'audio',
    });
    const db = await getDb();
    await db.run(
      sql`CREATE TRIGGER owner_media_failed_delete BEFORE DELETE ON blob_references BEGIN SELECT RAISE(FAIL, 'failed reference cleanup'); END`,
    );
    try {
      await expect(release()).rejects.toThrow();
    } finally {
      await db.run(sql`DROP TRIGGER owner_media_failed_delete`);
    }
    expect(await references(evaluation.id)).toHaveLength(1);
    const row = await db
      .select({ results: evalsTable.results })
      .from(evalsTable)
      .where(eq(evalsTable.id, evaluation.id))
      .get();
    expect(
      Object.keys((row!.results as Record<string, object>)[EVAL_ACTIVE_RUNS_KEY]),
    ).toHaveLength(1);
    await expect(assertEvalNotRunning(db, evaluation.id)).rejects.toThrow('--resume');
  });
});
