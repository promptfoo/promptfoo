import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getShareAuthorizedBlob,
  resetBlobStorageProvider,
  setBlobStorageProvider,
  storeBlob,
} from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import * as cache from '../../src/cache';
import { getDb } from '../../src/database';
import { blobReferencesTable } from '../../src/database/tables';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { GoogleInteractionsProvider } from '../../src/providers/google/interactions';
import { sha256 } from '../../src/util/createHash';
import { deleteEvalResult } from '../../src/util/database';
import { createDeferred, createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';

describe('timed-out media persistence', () => {
  let directory: string;
  let storage: FilesystemBlobStorageProvider;
  let restoreEnv: () => void;
  const evaluations: Eval[] = [];

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    directory = createTempDir('promptfoo-timeout-media-');
    storage = new FilesystemBlobStorageProvider({ basePath: directory });
    setBlobStorageProvider(storage);
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

  async function references(evalId: string) {
    return (await getDb())
      .select()
      .from(blobReferencesTable)
      .where(eq(blobReferencesTable.evalId, evalId));
  }

  function builtinVideo(data: Buffer, beforeResponse: () => Promise<void>) {
    vi.spyOn(cache, 'fetchWithCache').mockImplementation(async () => {
      await beforeResponse();
      return {
        data: {
          id: 'local-interaction',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'video', mime_type: 'video/mp4', data: data.toString('base64') }],
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
    });
    return new GoogleInteractionsProvider('gemini-omni-1.1-flash', {
      config: { apiKey: 'local-test-key' },
    });
  }

  it.each([
    'late-provider',
    'inflight-store',
    'cached-existing-uri',
    'builtin-late-provider',
    'builtin-inflight-store',
  ] as const)('does not recreate deleted references after %s completes', async (mode) => {
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const graded = createDeferred<void>();
    const prompts = [{ raw: 'media', label: mode }];
    const evaluation = await Eval.create({}, prompts, { id: randomUUID() });
    evaluations.push(evaluation);
    const data = Buffer.from(`audio ${mode}`.repeat(150));
    const hash = sha256(data);
    const store = storage.store.bind(storage);
    const exists = storage.exists.bind(storage);
    if (mode.endsWith('inflight-store')) {
      vi.spyOn(storage, 'store').mockImplementation(async (...args) => {
        entered.resolve();
        await release.promise;
        return store(...args);
      });
    } else if (mode === 'cached-existing-uri') {
      await storeBlob(data, 'audio/wav', {
        evalId: evaluation.id,
        testIdx: 0,
        promptIdx: 0,
        kind: 'audio',
        location: 'response.audio.data',
      });
      vi.spyOn(storage, 'exists').mockImplementation(async (hash) => {
        entered.resolve();
        await release.promise;
        return exists(hash);
      });
    }
    const running = evaluate(
      {
        prompts,
        providers: [
          mode.startsWith('builtin-')
            ? builtinVideo(data, async () => {
                if (mode === 'builtin-late-provider') {
                  entered.resolve();
                  await release.promise;
                }
              })
            : {
                id: () => mode,
                callApi: async () => {
                  if (mode === 'late-provider') {
                    entered.resolve();
                    await release.promise;
                  }
                  return mode === 'cached-existing-uri'
                    ? { output: `promptfoo://blob/${hash}`, cached: true }
                    : { output: 'media', audio: { data: data.toString('base64'), format: 'wav' } };
                },
              },
        ],
        tests: [
          {
            assert: [
              {
                type: 'javascript',
                value: () => {
                  graded.resolve();
                  return true;
                },
              },
            ],
          },
        ],
      },
      evaluation,
      { timeoutMs: 100, maxConcurrency: 1 },
    );
    try {
      await entered.promise;
      await vi.advanceTimersByTimeAsync(100);
      await running;
      const [row] = await EvalResult.findManyByEvalId(evaluation.id);
      expect(row.error).toContain('timed out');
      await deleteEvalResult(evaluation.id, row.id);
      expect(await references(evaluation.id)).toEqual([]);
      release.resolve();
      // The real grader runs after extraction and reference registration have settled.
      await graded.promise;
      expect(await references(evaluation.id)).toEqual([]);
      expect(await EvalResult.findManyByEvalId(evaluation.id)).toEqual([]);
      expect(await getShareAuthorizedBlob(hash, evaluation.id)).toBeNull();
    } finally {
      release.resolve();
      await running;
    }
  });

  it.each([false, true])(
    'retains completed media after ordinary user cancellation (builtin: %s)',
    async (builtin) => {
      const entered = createDeferred<void>();
      const release = createDeferred<void>();
      const controller = new AbortController();
      const prompts = [{ raw: 'media', label: 'User cancellation' }];
      const evaluation = await Eval.create({}, prompts, { id: randomUUID() });
      evaluations.push(evaluation);
      const data = Buffer.alloc(2048, 1);
      const running = evaluate(
        {
          prompts,
          providers: [
            builtin
              ? builtinVideo(data, async () => {
                  entered.resolve();
                  await release.promise;
                })
              : {
                  id: () => 'cancelled-provider',
                  callApi: async () => {
                    entered.resolve();
                    await release.promise;
                    return {
                      output: 'completed',
                      audio: { data: data.toString('base64'), format: 'wav' },
                    };
                  },
                },
          ],
          tests: [{}],
        },
        evaluation,
        { timeoutMs: 100, abortSignal: controller.signal, maxConcurrency: 1 },
      );
      await entered.promise;
      controller.abort();
      release.resolve();
      await running;
      const [row] = await EvalResult.findManyByEvalId(evaluation.id);
      expect(row.response?.[builtin ? 'video' : 'audio']?.blobRef?.hash).toBe(sha256(data));
      expect((await getShareAuthorizedBlob(sha256(data), evaluation.id))?.data).toEqual(data);
      await deleteEvalResult(evaluation.id, row.id);
      expect(await getShareAuthorizedBlob(sha256(data), evaluation.id)).toBeNull();
    },
  );
});
