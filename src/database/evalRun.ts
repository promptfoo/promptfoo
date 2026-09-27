import { randomUUID } from 'node:crypto';
import { connect, createServer } from 'node:net';

import { eq, sql } from 'drizzle-orm';
import { getDb } from './index';
import { evalsTable } from './tables';

import type { CompletedPrompt } from '../types/index';

export const EVAL_ACTIVE_RUNS_KEY = '__promptfooActiveRuns';
const runsPath = `$.${EVAL_ACTIVE_RUNS_KEY}`;
const resultsObject = sql`CASE WHEN json_valid(${evalsTable.results}) AND json_type(${evalsTable.results}) = 'object' THEN ${evalsTable.results} ELSE '{}' END`;

export class EvalRunningError extends Error {
  constructor(evalId: string) {
    super(`Evaluation ${evalId} is still running. Wait for it to finish before deleting results.`);
    this.name = 'EvalRunningError';
  }
}

// A nonce distinguishes a live run from an unrelated process that reused its port after a crash.
function isRunActive(nonce: string, marker: unknown): Promise<boolean> {
  const port = (marker as { port?: unknown } | null)?.port;
  if (
    !/^[\da-f-]{36}$/.test(nonce) ||
    !Number.isInteger(port) ||
    Number(port) < 1 ||
    Number(port) > 65535
  ) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port: Number(port) });
    let received = '';
    let settled = false;
    const finish = (active: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(active);
    };
    const timer = setTimeout(() => finish(true), 250);
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      if (received.length + chunk.length > nonce.length || !nonce.startsWith(received + chunk)) {
        finish(false);
      } else {
        received += chunk;
      }
    });
    socket.once('end', () => finish(received === nonce));
    socket.once('error', (error: NodeJS.ErrnoException) => finish(error.code !== 'ECONNREFUSED'));
    socket.once('close', () => finish(true));
  });
}

export async function assertEvalNotRunning(
  db: Pick<Awaited<ReturnType<typeof getDb>>, 'select'>,
  evalId: string,
): Promise<void> {
  const row = await db
    .select({ results: evalsTable.results })
    .from(evalsTable)
    .where(eq(evalsTable.id, evalId))
    .get();
  const runs = (row?.results as Record<string, unknown> | undefined)?.[EVAL_ACTIVE_RUNS_KEY];
  if (runs && typeof runs === 'object') {
    const active = await Promise.all(
      Object.entries(runs).map(([nonce, marker]) => isRunActive(nonce, marker)),
    );
    if (active.some(Boolean)) {
      throw new EvalRunningError(evalId);
    }
  }
}

export async function beginEvalRun(evaluation: {
  id: string;
  prompts: CompletedPrompt[];
}): Promise<() => Promise<void>> {
  const nonce = randomUUID();
  const server = createServer((socket) => {
    socket.on('error', () => {});
    socket.end(nonce, () => socket.destroy());
  });
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    server.unref();
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Evaluation run listener did not bind a local port');
    }
    const db = await getDb();
    const runMap = sql`CASE WHEN json_type(${resultsObject}, ${runsPath}) = 'object' THEN json_extract(${resultsObject}, ${runsPath}) ELSE '{}' END`;
    const row = await db.transaction((tx) =>
      tx
        .update(evalsTable)
        .set({
          results: sql`json_set(${resultsObject}, ${runsPath}, json_set(${runMap}, ${`$."${nonce}"`}, json(${JSON.stringify({ port: address.port })})))`,
        })
        .where(eq(evalsTable.id, evaluation.id))
        .returning({ prompts: evalsTable.prompts })
        .get(),
    );
    if (!row) {
      throw new Error(`Evaluation ${evaluation.id} not found`);
    }
    // A deletion that committed before registration must also be reflected in a resumed run.
    evaluation.prompts = row.prompts ?? [];
    let released = false;
    return async () => {
      if (released) {
        return;
      }
      released = true;
      try {
        await db
          .update(evalsTable)
          .set({
            results: sql`json_remove(${evalsTable.results}, ${`${runsPath}."${nonce}"`})`,
          })
          .where(eq(evalsTable.id, evaluation.id))
          .run();
      } finally {
        await close();
      }
    };
  } catch (error) {
    await close();
    throw error;
  }
}
