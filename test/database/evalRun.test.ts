import { randomUUID } from 'node:crypto';
import { createServer, Server, type Socket } from 'node:net';

import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assertEvalNotRunning,
  beginEvalRun,
  EVAL_ACTIVE_RUNS_KEY,
  EvalRunningError,
} from '../../src/database/evalRun';
import { getDb } from '../../src/database/index';
import { evalsTable } from '../../src/database/tables';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { nodeEvaluatorRuntime } from '../../src/node/evaluatorRuntime';
import EvalFactory from '../factories/evalFactory';
import { createDeferred } from '../util/utils';

describe('evaluation run ownership', () => {
  const releases: Array<() => Promise<void>> = [];
  const servers: Server[] = [];
  const sockets = new Set<Socket>();

  beforeAll(async () => {
    await runDbMigrations();
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

  async function listen(handler: (socket: Socket) => void) {
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      handler(socket);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test listener did not bind');
    }
    return { server, port: address.port };
  }

  async function marker(id: string, nonce: string, port: unknown) {
    const db = await getDb();
    await db
      .update(evalsTable)
      .set({ results: { [EVAL_ACTIVE_RUNS_KEY]: { [nonce]: { port } } } })
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

  it('allows a crashed owner with a closed port', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const { server, port } = await listen(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await marker(evaluation.id, randomUUID(), port);
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).resolves.toBeUndefined();
  });

  it.each(['unrelated service', 'x'.repeat(1000)])(
    'ignores a reused port returning %s',
    async (response) => {
      const evaluation = await EvalFactory.create({ numResults: 0 });
      const { port } = await listen((socket) => socket.end(response));
      await marker(evaluation.id, randomUUID(), port);
      await expect(assertEvalNotRunning(await getDb(), evaluation.id)).resolves.toBeUndefined();
    },
  );

  it('accepts a nonce delivered in chunks', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const nonce = randomUUID();
    const { port } = await listen((socket) => {
      socket.write(nonce.slice(0, 12), () => socket.end(nonce.slice(12)));
    });
    await marker(evaluation.id, nonce, port);
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).rejects.toThrow(
      EvalRunningError,
    );
  });

  it('uses one deadline even when a listener keeps sending a matching prefix', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const connected = createDeferred<Socket>();
    const { port } = await listen((socket) => connected.resolve(socket));
    const nonce = randomUUID();
    await marker(evaluation.id, nonce, port);
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

  it.each([0, 65536, '1234', undefined])(
    'rejects an invalid local port (%s) conservatively',
    async (port) => {
      const evaluation = await EvalFactory.create({ numResults: 0 });
      await marker(evaluation.id, randomUUID(), port);
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

  it('closes the listener even when marker cleanup fails', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const release = await begin(evaluation);
    const db = await getDb();
    vi.spyOn(db, 'update').mockImplementationOnce(() => {
      throw new Error('cleanup failed');
    });
    await expect(release()).rejects.toThrow('cleanup failed');
    await expect(assertEvalNotRunning(db, evaluation.id)).resolves.toBeUndefined();
  });

  it('releases ownership when evaluator construction fails', async () => {
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
    await expect(assertEvalNotRunning(await getDb(), evaluation.id)).resolves.toBeUndefined();
  });

  it('does not acquire a database marker for in-memory evaluations', async () => {
    await expect(nodeEvaluatorRuntime.acquireEvaluationRun!(new Eval({}))).resolves.toBeUndefined();
  });
});
