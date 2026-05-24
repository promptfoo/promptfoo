import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { spansTable, tracesTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import { TraceStore } from '../../src/tracing/store';
import EvalFactory from '../factories/evalFactory';

const DAY_MS = 24 * 60 * 60 * 1000;

function sqliteTimestampFromMs(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 19).replace('T', ' ');
}

describe('TraceStore retention cleanup', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM spans');
    await db.run('DELETE FROM traces');
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
  });

  async function insertTrace(evalId: string, traceId: string, createdAt: number | string) {
    const db = getDb();
    db.insert(tracesTable)
      .values({
        id: `${traceId}-id`,
        traceId,
        evaluationId: evalId,
        testCaseId: `${traceId}-test`,
        createdAt: createdAt as number,
      })
      .run();
    db.insert(spansTable)
      .values({
        id: `${traceId}-span-id`,
        traceId,
        spanId: `${traceId}-span`,
        name: `${traceId}-operation`,
        startTime: 1,
      })
      .run();
  }

  it('prunes both numeric and legacy SQLite timestamp traces', async () => {
    const eval_ = await EvalFactory.create({ numResults: 0 });
    const now = Date.now();

    await insertTrace(eval_.id, 'numeric-old', now - 60 * DAY_MS);
    await insertTrace(eval_.id, 'numeric-new', now - DAY_MS);
    await insertTrace(eval_.id, 'legacy-old', sqliteTimestampFromMs(now - 60 * DAY_MS));
    await insertTrace(eval_.id, 'legacy-new', sqliteTimestampFromMs(now - DAY_MS));

    await new TraceStore().deleteOldTraces(30);

    const traces = getDb()
      .select({ traceId: tracesTable.traceId })
      .from(tracesTable)
      .all()
      .map(({ traceId }) => traceId)
      .sort();
    const spans = getDb()
      .select({ traceId: spansTable.traceId })
      .from(spansTable)
      .all()
      .map(({ traceId }) => traceId)
      .sort();

    expect(traces).toEqual(['legacy-new', 'numeric-new']);
    expect(spans).toEqual(['legacy-new', 'numeric-new']);
  });
});
