import { randomUUID } from 'node:crypto';
import { connect, createServer } from 'node:net';

import { eq, sql } from 'drizzle-orm';
import { getDb } from './index';
import { evalsTable } from './tables';

export class EvalResultDeletionConflict extends Error {}

export const RESULT_WRITER = '__promptfooResultWriter';
export const resultDeletionRevision = sql<number>`coalesce(json_extract(${evalsTable.results}, '$.__promptfooResultDeletionRevision'), 0)`;
const writerPath = '$.' + RESULT_WRITER;

function endpoint(id: string): string {
  if (process.platform === 'win32') {
    return String.raw`\\.\pipe\promptfoo-eval-${id}`;
  }
  return process.platform === 'linux' ? `\0promptfoo-eval-${id}` : `/tmp/promptfoo-eval-${id}.sock`;
}

function writerExists(id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const socket = connect(endpoint(id));
    const finish = (active: boolean) => {
      socket.destroy();
      resolve(active);
    };
    socket.setTimeout(250, () => finish(true));
    socket.once('connect', () => finish(true));
    socket.once('error', (error: NodeJS.ErrnoException) =>
      finish(error.code !== 'ECONNREFUSED' && error.code !== 'ENOENT'),
    );
  });
}

/** Fence destructive edits while the node evaluator is producing and saving result rows. */
export async function withEvalResultWriter<T>(
  evaluation: {
    id: string;
    resultDeletionRevision?: number;
    prompts: NonNullable<(typeof evalsTable.$inferSelect)['prompts']>;
  },
  run: () => Promise<T>,
): Promise<T> {
  const db = await getDb();
  const predicate = eq(evalsTable.id, evaluation.id);
  const id = randomUUID();
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint(id), resolve);
  });
  server.unref();
  try {
    // Probe outside a transaction. A conditional update proves the observed writer did not change.
    const previous = await db
      .select({
        writer: sql<unknown>`json_extract(${evalsTable.results}, ${writerPath})`,
      })
      .from(evalsTable)
      .where(predicate)
      .get();
    if (!previous) {
      return await run();
    }
    if (previous.writer !== null && (await writerExists(previous.writer))) {
      throw new EvalResultDeletionConflict('An evaluation is already writing these results.');
    }

    const [updated] = await db
      .update(evalsTable)
      .set({ results: sql`json_set(${evalsTable.results}, ${writerPath}, ${id})` })
      .where(
        sql`${predicate} AND json_extract(${evalsTable.results}, ${writerPath}) IS ${previous.writer}`,
      )
      .returning({ prompts: evalsTable.prompts, revision: resultDeletionRevision });
    if (!updated) {
      throw new EvalResultDeletionConflict('Another process has started writing these results.');
    }
    // A deletion may have committed since the caller loaded this evaluation for resume.
    if ((evaluation.resultDeletionRevision ?? 0) !== updated.revision) {
      evaluation.prompts = updated.prompts ?? [];
      evaluation.resultDeletionRevision = updated.revision;
    }
    try {
      return await run();
    } finally {
      await db
        .update(evalsTable)
        .set({ results: sql`json_remove(${evalsTable.results}, ${writerPath})` })
        .where(sql`${predicate} AND json_extract(${evalsTable.results}, ${writerPath}) = ${id}`)
        .run();
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
