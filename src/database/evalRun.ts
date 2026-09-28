import { randomUUID } from 'node:crypto';
import { connect, createServer } from 'node:net';

import { eq, sql } from 'drizzle-orm';
import logger from '../logger';
import { getDb } from './index';
import { blobReferencesTable, evalResultsTable, evalsTable } from './tables';

import type { CompletedPrompt } from '../types/index';

export const EVAL_ACTIVE_RUNS_KEY = '__promptfooActiveRuns';
const runsPath = `$.${EVAL_ACTIVE_RUNS_KEY}`;
const resultsObject = sql`CASE WHEN json_valid(${evalsTable.results}) AND json_type(${evalsTable.results}) = 'object' THEN ${evalsTable.results} ELSE '{}' END`;

export class EvalResultDeletionError extends Error {}

export class EvalRunningError extends EvalResultDeletionError {
  constructor(evalId: string) {
    super(`Evaluation ${evalId} is still running. Wait for it to finish before deleting results.`);
    this.name = 'EvalRunningError';
  }
}

function interruptedRunError(evalId: string): EvalResultDeletionError {
  return new EvalResultDeletionError(
    `Evaluation ${evalId} has interrupted progress. Run promptfoo eval --resume ${evalId} to rebuild saved metrics before deleting results.`,
  );
}

function getPromptResultCounts(
  db: Pick<Awaited<ReturnType<typeof getDb>>, 'select'>,
  evalId: string,
) {
  return db
    .select({ promptIdx: evalResultsTable.promptIdx, count: sql<number>`count(*)` })
    .from(evalResultsTable)
    .where(eq(evalResultsTable.evalId, evalId))
    .groupBy(evalResultsTable.promptIdx)
    .all();
}

function runSocketPath(nonce: string): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\promptfoo-eval-${nonce}`;
  }
  // Keep Unix paths short and independent of each process's TMPDIR.
  return process.platform === 'linux'
    ? `\0promptfoo-eval-${nonce}`
    : `/tmp/promptfoo-eval-${nonce}.sock`;
}

// The endpoint belongs to one nonce, so an unrelated service cannot inherit a crashed run's port.
function isRunActive(nonce: string, marker: unknown): Promise<boolean> {
  if (!/^[\da-f-]{36}$/.test(nonce) || marker !== 'ipc') {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const socket = connect({ path: runSocketPath(nonce) });
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
    socket.once('error', (error: NodeJS.ErrnoException) =>
      finish(error.code !== 'ECONNREFUSED' && error.code !== 'ENOENT'),
    );
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
    if (active.length) {
      throw interruptedRunError(evalId);
    }
  }
}

export async function beginEvalRun(
  evaluation: { id: string; prompts: CompletedPrompt[] },
  recoverInterrupted?: () => Promise<void>,
): Promise<(completed?: boolean) => Promise<void>> {
  const nonce = randomUUID();
  const server = createServer((socket) => {
    socket.on('error', () => {});
    socket.end(nonce, () => socket.destroy());
  });
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  let release: ((completed?: boolean) => Promise<void>) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(runSocketPath(nonce), resolve);
    });
    server.unref();
    const db = await getDb();
    const runMap = sql`CASE WHEN json_type(${resultsObject}, ${runsPath}) = 'object' THEN json_extract(${resultsObject}, ${runsPath}) ELSE '{}' END`;
    const { stale, needsRepair } = await db.transaction(async (tx) => {
      const row = await tx
        .select({ results: evalsTable.results, prompts: evalsTable.prompts })
        .from(evalsTable)
        .where(eq(evalsTable.id, evaluation.id))
        .get();
      if (!row) {
        throw new Error(`Evaluation ${evaluation.id} not found`);
      }
      const runs = (row.results as Record<string, unknown> | undefined)?.[EVAL_ACTIVE_RUNS_KEY];
      const states = await Promise.all(
        Object.entries(runs && typeof runs === 'object' ? runs : {}).map(
          async ([nonce, marker]) => ({
            nonce,
            active: await isRunActive(nonce, marker),
          }),
        ),
      );
      const stale = states.filter((state) => !state.active).map((state) => state.nonce);
      const counts = await getPromptResultCounts(tx, evaluation.id);
      const needsRepair =
        stale.length > 0 ||
        counts.some(({ promptIdx, count }) => {
          const metrics = row.prompts?.[promptIdx]?.metrics;
          const accounted = [
            metrics?.testPassCount,
            metrics?.testFailCount,
            metrics?.testErrorCount,
          ].reduce<number>(
            (total, value) =>
              total + (typeof value === 'number' && Number.isFinite(value) ? value : 0),
            0,
          );
          return accounted < count;
        });
      if (needsRepair && states.some((state) => state.active)) {
        throw new EvalRunningError(evaluation.id);
      }
      if (needsRepair && !recoverInterrupted) {
        throw interruptedRunError(evaluation.id);
      }
      await tx
        .update(evalsTable)
        .set({
          results: sql`json_set(${resultsObject}, ${runsPath}, json_set(${runMap}, ${`$."${nonce}"`}, 'ipc'))`,
        })
        .where(eq(evalsTable.id, evaluation.id))
        .run();
      // Include deletions that committed before registration in resumed prompt metrics.
      evaluation.prompts = row.prompts ?? [];
      return { stale, needsRepair };
    });
    let released = false;
    release = async (completed = true) => {
      if (released) {
        return;
      }
      released = true;
      try {
        if (completed) {
          await db.transaction(async (tx) => {
            const row = await tx
              .update(evalsTable)
              .set({
                results: sql`json_remove(${evalsTable.results}, ${`${runsPath}."${nonce}"`})`,
              })
              .where(eq(evalsTable.id, evaluation.id))
              .returning({ results: evalsTable.results, prompts: evalsTable.prompts })
              .get();
            const runs = (row?.results as Record<string, unknown> | undefined)?.[
              EVAL_ACTIVE_RUNS_KEY
            ];
            if (!row?.prompts || Object.keys(runs ?? {}).length > 0) {
              return;
            }
            const counts = new Map(
              (await getPromptResultCounts(tx, evaluation.id)).map(({ promptIdx, count }) => [
                promptIdx,
                count,
              ]),
            );
            // Failed INSERTs retain accounted work and media outside SQL for recovery artifacts.
            if (
              [...counts.keys()].some((idx) => !row.prompts![idx]) ||
              !row.prompts.every(({ metrics }, idx) => {
                const accounted =
                  (metrics?.testPassCount ?? NaN) +
                  (metrics?.testFailCount ?? NaN) +
                  (metrics?.testErrorCount ?? NaN);
                return Number.isFinite(accounted) && accounted === (counts.get(idx) ?? 0);
              })
            ) {
              return;
            }
            // The last owner has drained saved rows and fenced abandoned writers. Remove only
            // runtime scopes without a saved row; imported/eval-wide refs and bytes stay intact.
            // Split scopes to use the eval/test index; grouped counts cover prompt-only refs.
            await tx.run(sql`
              DELETE FROM ${blobReferencesTable}
              WHERE ${blobReferencesTable.evalId} = ${evaluation.id}
                AND (${blobReferencesTable.testIdx} IS NOT NULL OR ${blobReferencesTable.promptIdx} IS NOT NULL)
                AND (${blobReferencesTable.location} IS NULL OR ${blobReferencesTable.location} != 'import')
                AND ((${blobReferencesTable.testIdx} IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM ${evalResultsTable}
                  WHERE ${evalResultsTable.evalId} = ${blobReferencesTable.evalId}
                    AND ${evalResultsTable.testIdx} = ${blobReferencesTable.testIdx}
                    AND (${blobReferencesTable.promptIdx} IS NULL OR ${evalResultsTable.promptIdx} = ${blobReferencesTable.promptIdx})
                )) OR (${blobReferencesTable.testIdx} IS NULL AND ${blobReferencesTable.promptIdx} NOT IN (
                  SELECT value FROM json_each(${JSON.stringify([...counts.keys()])})
                )))
            `);
          });
        }
      } finally {
        await close();
      }
    };
    if (needsRepair) {
      await recoverInterrupted!();
      if (stale.length) {
        await db
          .update(evalsTable)
          .set({
            results: sql`json_remove(${evalsTable.results}, ${sql.join(
              stale.map((key) => sql`${`${runsPath}."${key}"`}`),
              sql`, `,
            )})`,
          })
          .where(eq(evalsTable.id, evaluation.id))
          .run();
      }
    }
    return release;
  } catch (error) {
    try {
      if (release) {
        await release(false);
      } else {
        await close();
      }
    } catch (cleanupError) {
      logger.error('Failed to release evaluation run after recovery error', {
        evalId: evaluation.id,
        error: cleanupError,
      });
    }
    throw error;
  }
}
