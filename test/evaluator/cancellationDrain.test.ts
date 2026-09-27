import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getShareAuthorizedBlob,
  resetBlobStorageProvider,
  setBlobStorageProvider,
} from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import { getDb } from '../../src/database';
import { assertEvalNotRunning, EvalRunningError } from '../../src/database/evalRun';
import { blobReferencesTable } from '../../src/database/tables';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { nodeEvaluatorRuntime } from '../../src/node/evaluatorRuntime';
import { sha256 } from '../../src/util/createHash';
import { deleteEvalResult } from '../../src/util/database';
import { createDeferred, createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';

describe('concurrent cancellation phases', () => {
  let directory: string;
  let restoreEnv: () => void;
  const evaluations: Eval[] = [];
  beforeAll(async () => {
    await runDbMigrations();
  });
  beforeEach(() => {
    directory = createTempDir('promptfoo-cancel-drain-');
    setBlobStorageProvider(new FilesystemBlobStorageProvider({ basePath: directory }));
    restoreEnv = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'false' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const evaluation of evaluations.splice(0)) {
      await evaluation.delete({ notify: false });
    }
    resetBlobStorageProvider();
    restoreEnv();
    removeTempDir(directory);
  });

  it.each(['abort', 'abort-timed', 'max-duration', 'no-queue'] as const)(
    'preserves the scheduling boundary for %s',
    async (mode) => {
      const entered = createDeferred<void>();
      const releaseSlow = createDeferred<void>();
      const releaseFast = createDeferred<void>();
      const graded = createDeferred<void>();
      const controller = new AbortController();
      const prompts = [{ raw: '{{ row }}', label: mode }];
      const evaluation = await Eval.create({}, prompts, { id: randomUUID() });
      evaluations.push(evaluation);
      const data = Buffer.alloc(2048, 4);
      const hash = sha256(data);
      let settled = false;
      const running = evaluate(
        {
          prompts,
          providers: [
            {
              id: () => mode,
              callApi: async (prompt) => {
                if (prompt === 'slow') {
                  entered.resolve();
                  await releaseSlow.promise;
                  return {
                    output: 'late media',
                    audio: { data: data.toString('base64'), format: 'wav' },
                    cost: 3,
                  };
                }
                await releaseFast.promise;
                return { output: 'fast', cost: 2 };
              },
            },
          ],
          tests: (mode === 'no-queue' ? ['slow', 'fast'] : ['slow', 'fast', 'queued']).map(
            (row) => ({
              vars: { row },
              assert: [
                {
                  type: 'javascript',
                  value: (output: string) => {
                    if (output === 'late media') {
                      graded.resolve();
                    }
                    return true;
                  },
                },
              ],
            }),
          ),
        },
        evaluation,
        {
          maxConcurrency: 2,
          timeoutMs: mode === 'abort-timed' ? 10_000 : 0,
          maxEvalTimeMs: mode === 'max-duration' ? 200 : 0,
          abortSignal: controller.signal,
        },
      ).then(() => {
        settled = true;
      });
      try {
        await entered.promise;
        if (mode === 'max-duration') {
          await vi.advanceTimersByTimeAsync(200);
        } else {
          controller.abort();
        }
        releaseFast.resolve();
        if (mode === 'no-queue') {
          await vi.waitFor(async () =>
            expect(await EvalResult.findManyByEvalId(evaluation.id)).toHaveLength(1),
          );
          expect(settled).toBe(false);
          await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow(
            EvalRunningError,
          );
          releaseSlow.resolve();
          await running;
          expect(await EvalResult.findManyByEvalId(evaluation.id)).toHaveLength(2);
          expect((await getShareAuthorizedBlob(hash, evaluation.id))?.data).toEqual(data);
          return;
        }
        await vi.waitFor(() => expect(settled).toBe(true));
        await running;
        const rows = await EvalResult.findManyByEvalId(evaluation.id);
        expect(rows).toHaveLength(mode === 'max-duration' ? 3 : 1);
        const fast = rows.find((row) => row.testIdx === 1)!;
        expect(fast.success).toBe(true);
        await deleteEvalResult(evaluation.id, fast.id);
        const beforeLate = (await Eval.findById(evaluation.id))!.prompts;
        const rowIds = (await EvalResult.findManyByEvalId(evaluation.id))
          .map((row) => row.id)
          .sort();
        // An abandoned per-step timer must neither keep the run alive nor insert a later error row.
        await vi.advanceTimersByTimeAsync(20_000);
        releaseSlow.resolve();
        await graded.promise;
        expect(
          (await EvalResult.findManyByEvalId(evaluation.id)).map((row) => row.id).sort(),
        ).toEqual(rowIds);
        expect((await Eval.findById(evaluation.id))!.prompts).toEqual(beforeLate);
        expect(
          await (await getDb())
            .select()
            .from(blobReferencesTable)
            .where(eq(blobReferencesTable.evalId, evaluation.id)),
        ).toEqual([]);
        expect(await getShareAuthorizedBlob(hash, evaluation.id)).toBeNull();
      } finally {
        releaseFast.resolve();
        releaseSlow.resolve();
        await running;
        await graded.promise;
      }
    },
  );

  it('drains a timeout row whose persistence has already started', async () => {
    const timeoutAppend = createDeferred<void>();
    const releaseAppend = createDeferred<void>();
    const releaseProvider = createDeferred<void>();
    const fastFinished = createDeferred<void>();
    const controller = new AbortController();
    const prompts = [{ raw: '{{ row }}', label: 'timeout append' }];
    const evaluation = await Eval.create({}, prompts, { id: randomUUID() });
    evaluations.push(evaluation);
    let settled = false;
    const running = evaluate(
      {
        prompts,
        providers: [
          {
            id: () => 'timeout-append',
            callApi: async (prompt) => {
              if (prompt === 'slow') {
                await releaseProvider.promise;
              } else {
                await timeoutAppend.promise;
              }
              return { output: prompt };
            },
          },
        ],
        tests: ['slow', 'fast', 'queued'].map((row) => ({ vars: { row } })),
      },
      evaluation,
      {
        maxConcurrency: 2,
        timeoutMs: 100,
        abortSignal: controller.signal,
        progressCallback: (_completed, _total, index) => {
          if (index === 1) {
            fastFinished.resolve();
          }
        },
      },
      {
        ...nodeEvaluatorRuntime,
        createEvaluationStore: (record) => {
          const store = nodeEvaluatorRuntime.createEvaluationStore(record);
          const append = store.appendResult.bind(store);
          store.appendResult = async (row) => {
            if (row.testIdx === 0 && row.error?.includes('timed out')) {
              controller.abort();
              timeoutAppend.resolve();
              await releaseAppend.promise;
            }
            await append(row);
          };
          return store;
        },
      },
    ).then(() => {
      settled = true;
    });
    try {
      await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2));
      await vi.advanceTimersByTimeAsync(100);
      await timeoutAppend.promise;
      await fastFinished.promise;
      expect(settled).toBe(false);
      await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow(
        EvalRunningError,
      );
      releaseAppend.resolve();
      await running;
      const rows = await EvalResult.findManyByEvalId(evaluation.id);
      expect(rows.map((row) => row.testIdx).sort()).toEqual([0, 1]);
      expect(rows.find((row) => row.testIdx === 0)?.error).toContain('timed out');
      await deleteEvalResult(evaluation.id, rows[0].id);
    } finally {
      releaseAppend.resolve();
      releaseProvider.resolve();
      await running;
    }
  });
});
