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
import { blobReferencesTable } from '../../src/database/tables';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { runRedteamConversation } from '../../src/redteam/providers/iterative';
import { sha256 } from '../../src/util/createHash';
import { deleteEvalResult } from '../../src/util/database';
import { createDeferred, createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';

describe('iterative strategy media after cancellation', () => {
  let directory: string;
  let restoreEnv: () => void;
  const evaluations: Eval[] = [];

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    directory = createTempDir('promptfoo-timeout-strategy-');
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

  it.each(['timeout', 'user-abort'] as const)(
    'handles late target media after %s',
    async (mode) => {
      const entered = createDeferred<void>();
      const release = createDeferred<void>();
      const completed = createDeferred<void>();
      const controller = new AbortController();
      const prompts = [{ raw: '{{ input }}', label: 'iterative media' }];
      const evaluation = await Eval.create({}, prompts, { id: randomUUID() });
      evaluations.push(evaluation);
      const data = Buffer.alloc(2048, 2);
      const hash = sha256(data);
      const running = evaluate(
        {
          prompts,
          providers: [
            {
              id: () => 'local-iterative-strategy',
              callApi: async (_prompt, context, options) => {
                try {
                  return await runRedteamConversation({
                    context,
                    filters: undefined,
                    injectVar: 'input',
                    numIterations: 1,
                    options,
                    prompt: context!.prompt,
                    vars: context!.vars,
                    attackerUsesRemoteProvider: false,
                    excludeTargetOutputFromAgenticAttackGeneration: false,
                    redteamProvider: {
                      id: () => 'local-attacker',
                      callApi: async () => ({
                        output: { improvement: 'Local test', prompt: 'media' },
                      }),
                    },
                    gradingProvider: {
                      id: () => 'local-judge',
                      callApi: async () => ({ output: { currentResponse: { rating: 5 } } }),
                    },
                    targetProvider: {
                      id: () => 'local-media-target',
                      callApi: async () => {
                        entered.resolve();
                        await release.promise;
                        return {
                          output: 'completed',
                          audio: { data: data.toString('base64'), format: 'wav' },
                        };
                      },
                    },
                  });
                } finally {
                  completed.resolve();
                }
              },
            },
          ],
          tests: [{ vars: { input: 'media' } }],
        },
        evaluation,
        { timeoutMs: 100, abortSignal: controller.signal, maxConcurrency: 1 },
      );
      try {
        await entered.promise;
        if (mode === 'timeout') {
          await vi.advanceTimersByTimeAsync(100);
          await running;
          const [row] = await EvalResult.findManyByEvalId(evaluation.id);
          expect(row.error).toContain('timed out');
          await deleteEvalResult(evaluation.id, row.id);
          release.resolve();
          await completed.promise;
          expect(await EvalResult.findManyByEvalId(evaluation.id)).toEqual([]);
        } else {
          controller.abort();
          release.resolve();
          await running;
          expect((await getShareAuthorizedBlob(hash, evaluation.id))?.data).toEqual(data);
          const [row] = await EvalResult.findManyByEvalId(evaluation.id);
          await deleteEvalResult(evaluation.id, row.id);
        }
        expect(
          await (await getDb())
            .select()
            .from(blobReferencesTable)
            .where(eq(blobReferencesTable.evalId, evaluation.id)),
        ).toEqual([]);
        expect(await getShareAuthorizedBlob(hash, evaluation.id)).toBeNull();
      } finally {
        release.resolve();
        await completed.promise;
        await running;
      }
    },
  );
});
