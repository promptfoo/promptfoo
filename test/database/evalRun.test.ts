import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assertEvalNotRunning,
  beginEvalRun,
  EVAL_ACTIVE_RUNS_KEY,
  EvalResultDeletionError,
  EvalRunningError,
} from '../../src/database/evalRun';
import { getDb } from '../../src/database/index';
import { evalsTable } from '../../src/database/tables';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { nodeEvaluatorRuntime } from '../../src/node/evaluatorRuntime';
import { recalculatePromptMetrics } from '../../src/node/recalculatePromptMetrics';
import { deleteEvalResult } from '../../src/util/database';
import EvalFactory from '../factories/evalFactory';
import { createDeferred } from '../util/utils';

describe('evaluation run ownership', () => {
  const releases: Array<() => Promise<void>> = [];
  const servers: Server[] = [];
  const sockets = new Set<Socket>();
  let fixtureDir: string;
  let comparisonProvider: string;

  beforeAll(async () => {
    await runDbMigrations();
    fixtureDir = await mkdtemp(path.join(tmpdir(), 'promptfoo-run-owner-'));
    const providerPath = path.join(fixtureDir, 'comparison.cjs');
    await writeFile(
      providerPath,
      `module.exports = class {
        id() { return 'run-owner-judge'; }
        async callApi() {
          return { output: '0', cached: true, tokenUsage: { total: 0, cached: 10, numRequests: 0 } };
        }
      };`,
    );
    comparisonProvider = `file://${providerPath}`;
  });

  afterAll(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const release of releases.splice(0)) {
      await release();
    }
    for (const socket of sockets) {
      socket.destroy();
    }
    sockets.clear();
    await Promise.all(
      servers
        .splice(0)
        .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  async function begin(evaluation: Eval) {
    const release = await beginEvalRun(evaluation);
    releases.push(release);
    return release;
  }

  async function results(id: string) {
    const db = await getDb();
    const row = await db
      .select({ results: evalsTable.results })
      .from(evalsTable)
      .where(eq(evalsTable.id, id))
      .get();
    return row!.results as Record<string, unknown>;
  }

  async function listen(handler: (socket: Socket) => void, nonce = randomUUID()) {
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      handler(socket);
    });
    servers.push(server);
    const endpoint =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\promptfoo-eval-${nonce}`
        : process.platform === 'linux'
          ? `\0promptfoo-eval-${nonce}`
          : `/tmp/promptfoo-eval-${nonce}.sock`;
    await new Promise<void>((resolve) => server.listen(endpoint, resolve));
    return { server, nonce };
  }

  async function marker(id: string, nonce: string, value: unknown = 'ipc') {
    const db = await getDb();
    await db
      .update(evalsTable)
      .set({ results: { [EVAL_ACTIVE_RUNS_KEY]: { [nonce]: value } } })
      .where(eq(evalsTable.id, id))
      .run();
  }

  it('refreshes resumed prompts and preserves duration fields through registration and release', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const currentPrompts = structuredClone(evaluation.prompts);
    evaluation.prompts = [];
    const db = await getDb();
    await db
      .update(evalsTable)
      .set({ results: { durationMs: 12 } })
      .where(eq(evalsTable.id, evaluation.id))
      .run();

    const release = await begin(evaluation);
    expect(evaluation.prompts).toEqual(currentPrompts);
    await expect(db.transaction((tx) => assertEvalNotRunning(tx, evaluation.id))).rejects.toThrow(
      EvalRunningError,
    );
    evaluation.setDurationMs(18);
    await evaluation.save();
    await expect(assertEvalNotRunning(db, evaluation.id)).rejects.toThrow(EvalRunningError);

    await release();
    await release();
    await expect(assertEvalNotRunning(db, evaluation.id)).resolves.toBeUndefined();
    expect(await results(evaluation.id)).toMatchObject({
      durationMs: 18,
      [EVAL_ACTIVE_RUNS_KEY]: {},
    });
  });

  it('retains each concurrent owner until that owner releases', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const [first, second] = await Promise.all([begin(evaluation), begin(evaluation)]);
    expect(
      Object.keys((await results(evaluation.id))[EVAL_ACTIVE_RUNS_KEY] as object),
    ).toHaveLength(2);
    await first();
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow(
      EvalRunningError,
    );
    await second();
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).resolves.toBeUndefined();
  });

  it('drains interrupted concurrent writers before releasing ownership', async () => {
    const controller = new AbortController();
    const slowStarted = createDeferred<void>();
    const releaseSlow = createDeferred<void>();
    const evaluation = await Eval.create({}, [{ raw: '{{row}}', label: 'Interrupted' }]);
    const releasedWithRows: number[] = [];
    let releaseTimer: NodeJS.Timeout | undefined;
    const running = evaluate(
      {
        prompts: [{ raw: '{{row}}', label: 'Interrupted' }],
        providers: [
          {
            id: () => 'interrupted-writer',
            callApi: async (prompt) => {
              if (prompt !== 'slow') {
                await slowStarted.promise;
              }
              return { output: prompt, cost: 3, tokenUsage: { total: 2, numRequests: 1 } };
            },
          },
        ],
        tests: ['fast', 'slow', 'queued'].map((row) => ({ vars: { row } })),
      },
      evaluation,
      {
        maxConcurrency: 2,
        abortSignal: controller.signal,
        progressCallback: (_completed, _total, index) => {
          if (index === 0) {
            controller.abort();
            releaseTimer = setTimeout(() => releaseSlow.resolve(), 100);
          }
        },
      },
      {
        ...nodeEvaluatorRuntime,
        createEvaluationStore: (record) => {
          const store = nodeEvaluatorRuntime.createEvaluationStore(record);
          const append = store.appendResult.bind(store);
          store.appendResult = async (row) => {
            if (row.testIdx === 1) {
              slowStarted.resolve();
              await releaseSlow.promise;
            }
            await append(row);
          };
          return store;
        },
        acquireEvaluationRun: async (record) => {
          const release = await nodeEvaluatorRuntime.acquireEvaluationRun!(record);
          return async (completed) => {
            releasedWithRows.push((await EvalResult.findManyByEvalId(record.id)).length);
            await release?.(completed);
          };
        },
      },
    );
    try {
      await slowStarted.promise;
      await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow(
        EvalRunningError,
      );
      await running;
      expect(releasedWithRows).toEqual([2]);
      const rows = await EvalResult.findManyByEvalId(evaluation.id);
      expect(rows.map((row) => row.testIdx).sort()).toEqual([0, 1]);
      await deleteEvalResult(evaluation.id, rows[0].id);
      expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
        testPassCount: 1,
        score: 1,
        cost: 3,
        tokenUsage: { total: 2, numRequests: 1 },
      });
    } finally {
      if (releaseTimer) {
        clearTimeout(releaseTimer);
      }
      releaseSlow.resolve();
      await running;
    }
  });

  it('requires repair after a comparison throws with equal saved row and header counts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const prompts = [{ raw: '{{row}}', label: 'Comparison failure' }];
    const evaluation = await Eval.create({}, prompts);
    const provider = (id: string) => ({
      id: () => id,
      callApi: async (prompt: string) => {
        // Every ordinary row reaches the periodic prompt flush before comparisons start.
        vi.setSystemTime(Date.now() + 1100);
        return id === 'error-target' && prompt === 'error'
          ? { error: 'target error' }
          : { output: 'ok' };
      },
    });
    await expect(
      evaluate(
        {
          prompts,
          providers: [provider('error-target'), provider('other-target')],
          tests: [
            {
              vars: { row: 'error' },
              assert: [
                { type: 'select-best', value: 'first', provider: comparisonProvider },
                { type: 'max-score' },
              ],
            },
            {
              vars: { row: 'survivor' },
              assert: [
                {
                  type: 'javascript',
                  value:
                    '({pass:true,score:1,reason:"survivor",tokensUsed:{total:3,numRequests:1}})',
                },
              ],
            },
          ],
        },
        evaluation,
        { maxConcurrency: 1 },
      ),
    ).rejects.toThrow('max-score requires at least one other assertion');
    const rows = await EvalResult.findManyByEvalId(evaluation.id);
    const target = rows.find((row) => row.testIdx === 0 && row.promptIdx === 0)!;
    expect(rows).toHaveLength(4);
    expect(target.gradingResult!.componentResults![0].pass).toBe(true);
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
      testPassCount: 1,
      testErrorCount: 1,
      assertPassCount: 1,
      tokenUsage: { assertions: { cached: 0 } },
    });
    await expect(deleteEvalResult(evaluation.id, target.id)).rejects.toThrow('--resume');
    expect(await EvalResult.findById(target.id)).toBeDefined();

    const release = await beginEvalRun(evaluation, () => recalculatePromptMetrics(evaluation));
    releases.push(release);
    await release();
    await deleteEvalResult(evaluation.id, target.id);
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
      testPassCount: 1,
      testErrorCount: 0,
      assertPassCount: 1,
      tokenUsage: { assertions: { total: 3, cached: 0, numRequests: 1 } },
    });
  });

  it('keeps live markers through legacy saves and does not resurrect a released snapshot', async () => {
    const row = await EvalFactory.createOldResult();
    const evaluation = (await Eval.findById(row.id))!;
    const release = await begin(evaluation);
    const snapshot = (await Eval.findById(row.id))!;
    await evaluation.save();
    await expect(assertEvalNotRunning(await getDb(), row.id)).rejects.toThrow(EvalRunningError);
    await release();
    await snapshot.save();
    expect(Object.keys((await results(row.id))[EVAL_ACTIVE_RUNS_KEY] as object)).toHaveLength(0);
    await expect(assertEvalNotRunning(await getDb(), row.id)).resolves.toBeUndefined();
  });

  it('requires interrupted progress repair for a crashed owner with a closed socket', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const { server, nonce } = await listen(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await marker(evaluation.id, nonce);
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow('--resume');
    await expect(beginEvalRun(evaluation)).rejects.toThrow('--resume');
  });

  it('holds its own live marker through repair and clears captured stale markers after saving', async () => {
    const evaluation = await EvalFactory.create();
    const stale = randomUUID();
    await marker(evaluation.id, stale);
    const release = await beginEvalRun(evaluation, async () => {
      expect(
        Object.keys((await results(evaluation.id))[EVAL_ACTIVE_RUNS_KEY] as object),
      ).toHaveLength(2);
      await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow(
        EvalRunningError,
      );
      await recalculatePromptMetrics(evaluation);
    });
    releases.push(release);
    const runs = (await results(evaluation.id))[EVAL_ACTIVE_RUNS_KEY] as Record<string, unknown>;
    expect(runs[stale]).toBeUndefined();
    expect(Object.keys(runs)).toHaveLength(1);
    expect(evaluation.prompts[0].metrics).toMatchObject({ testPassCount: 1, testFailCount: 1 });
    await release();
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).resolves.toBeUndefined();
  });

  it('repairs an observable header deficit even without a stale marker', async () => {
    const evaluation = await EvalFactory.create();
    evaluation.prompts[0].metrics!.testPassCount = 0;
    evaluation.prompts[0].metrics!.testFailCount = 0;
    await evaluation.addPrompts(evaluation.prompts);
    await expect(beginEvalRun(evaluation)).rejects.toThrow('--resume');
    const repair = vi.fn(() => recalculatePromptMetrics(evaluation));
    const release = await beginEvalRun(evaluation, repair);
    releases.push(release);
    expect(repair).toHaveBeenCalledOnce();
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
      testPassCount: 1,
      testFailCount: 1,
    });
    await release();
  });

  it('does not recalculate valid header-only contributions without interrupted evidence', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const repair = vi.fn();
    const release = await beginEvalRun(evaluation, repair);
    releases.push(release);
    expect(repair).not.toHaveBeenCalled();
  });

  it('preserves interrupted markers and closes its own owner if recovery fails', async () => {
    const evaluation = await EvalFactory.create();
    const stale = randomUUID();
    await marker(evaluation.id, stale);
    await expect(
      beginEvalRun(evaluation, async () => {
        throw new Error('Repair failed');
      }),
    ).rejects.toThrow('Repair failed');
    const runs = (await results(evaluation.id))[EVAL_ACTIVE_RUNS_KEY] as Record<string, unknown>;
    expect(runs[stale]).toBe('ipc');
    expect(Object.keys(runs)).toHaveLength(2);
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow('--resume');
  });

  it('refuses recovery alongside another live owner', async () => {
    const evaluation = await EvalFactory.create();
    await begin(evaluation);
    const current = await results(evaluation.id);
    const db = await getDb();
    await db
      .update(evalsTable)
      .set({
        results: {
          ...current,
          [EVAL_ACTIVE_RUNS_KEY]: {
            ...(current[EVAL_ACTIVE_RUNS_KEY] as object),
            [randomUUID()]: 'ipc',
          },
        },
      })
      .where(eq(evalsTable.id, evaluation.id))
      .run();
    const repair = vi.fn();
    await expect(beginEvalRun(evaluation, repair)).rejects.toThrow(EvalRunningError);
    expect(repair).not.toHaveBeenCalled();
    expect(
      Object.keys((await results(evaluation.id))[EVAL_ACTIVE_RUNS_KEY] as object),
    ).toHaveLength(2);
  });

  it('does not mistake an unrelated silent TCP listener for an IPC owner', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const unrelated = createServer((socket) => sockets.add(socket));
    servers.push(unrelated);
    await new Promise<void>((resolve) => unrelated.listen(0, '127.0.0.1', resolve));
    await marker(evaluation.id, randomUUID());
    const check = assertEvalNotRunning(await getDb(), evaluation.id);
    await expect(check).rejects.toBeInstanceOf(EvalResultDeletionError);
    await expect(check).rejects.not.toBeInstanceOf(EvalRunningError);
    expect(unrelated.listening).toBe(true);
  });

  it.each(['unrelated service', 'x'.repeat(1000)])(
    'ignores a socket returning a different identity: %s',
    async (response) => {
      const evaluation = await EvalFactory.create({ numResults: 0 });
      const { nonce } = await listen((socket) => socket.end(response));
      await marker(evaluation.id, nonce);
      await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow('--resume');
    },
  );

  it('accepts a nonce delivered in chunks', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const nonce = randomUUID();
    await listen((socket) => {
      socket.write(nonce.slice(0, 12), () => socket.end(nonce.slice(12)));
    }, nonce);
    await marker(evaluation.id, nonce);
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow(
      EvalRunningError,
    );
  });

  it('uses one deadline even when a listener keeps sending a matching prefix', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const connected = createDeferred<Socket>();
    const { nonce } = await listen((socket) => connected.resolve(socket));
    await marker(evaluation.id, nonce);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const check = expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow(
      EvalRunningError,
    );
    const socket = await connected.promise;
    await vi.advanceTimersByTimeAsync(200);
    await new Promise<void>((resolve) => socket.write(nonce[0], () => resolve()));
    await vi.advanceTimersByTimeAsync(50);
    await check;
  });

  it.each([null, {}, 'unknown', { port: 1234 }])(
    'rejects an unknown marker (%s) conservatively',
    async (value) => {
      const evaluation = await EvalFactory.create({ numResults: 0 });
      await marker(evaluation.id, randomUUID(), value);
      await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow(
        EvalRunningError,
      );
    },
  );

  it('closes the listener if registration fails', async () => {
    const close = vi.spyOn(Server.prototype, 'close');
    await expect(beginEvalRun({ id: randomUUID(), prompts: [] })).rejects.toThrow('not found');
    expect(close).toHaveBeenCalledOnce();
    expect((close.mock.contexts[0] as Server).listening).toBe(false);
  });

  it('closes ownership but retains interruption evidence when evaluator construction fails', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    await expect(
      evaluate(
        { providers: [], prompts: [] },
        evaluation,
        {},
        {
          ...nodeEvaluatorRuntime,
          createEvaluationStore() {
            throw new Error('construction failed');
          },
        },
      ),
    ).rejects.toThrow('construction failed');
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow('--resume');
  });

  it('does not acquire a database marker for in-memory evaluations', async () => {
    await expect(nodeEvaluatorRuntime.acquireEvaluationRun!(new Eval({}))).resolves.toBeUndefined();
  });
});
