import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { spansTable, tracesTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import { getTraceSpans, TraceStore } from '../../src/tracing/store';
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
    const db = await getDb();
    await db.delete(spansTable).run();
    await db.delete(tracesTable).run();
  });

  async function insertTrace(evalId: string, traceId: string, createdAt: number | string) {
    const db = await getDb();

    await db
      .insert(tracesTable)
      .values({
        id: `${traceId}-id`,
        traceId,
        evaluationId: evalId,
        testCaseId: `${traceId}-test`,
        createdAt: createdAt as number,
      })
      .run();

    await db
      .insert(spansTable)
      .values({
        id: `${traceId}-span-id`,
        traceId,
        spanId: `${traceId}-span`,
        name: `${traceId}-operation`,
        startTime: 1,
      })
      .run();
  }

  it('prunes spans and traces for both numeric and SQLite timestamp rows', async () => {
    const eval_ = await EvalFactory.create({ numResults: 0 });
    const now = Date.now();

    await insertTrace(eval_.id, 'numeric-old', now - 60 * DAY_MS);
    await insertTrace(eval_.id, 'numeric-new', now - DAY_MS);
    await insertTrace(eval_.id, 'legacy-old', sqliteTimestampFromMs(now - 60 * DAY_MS));
    await insertTrace(eval_.id, 'legacy-new', sqliteTimestampFromMs(now - DAY_MS));

    await new TraceStore().deleteOldTraces(30);

    const db = await getDb();
    const traces = (await db.select({ traceId: tracesTable.traceId }).from(tracesTable).all())
      .map(({ traceId }) => traceId)
      .sort();
    const spans = (await db.select({ traceId: spansTable.traceId }).from(spansTable).all())
      .map(({ traceId }) => traceId)
      .sort();

    expect(traces).toEqual(['legacy-new', 'numeric-new']);
    expect(spans).toEqual(['legacy-new', 'numeric-new']);
  });
});

describe('getTraceSpans', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(spansTable).run();
    await db.delete(tracesTable).run();
  });

  it('returns spans for a stored trace', async () => {
    const eval_ = await EvalFactory.create({ numResults: 0 });
    const db = await getDb();

    await db
      .insert(tracesTable)
      .values({
        id: 'trace-fetch-id',
        traceId: 'trace-fetch',
        evaluationId: eval_.id,
        testCaseId: 'trace-fetch-test',
        createdAt: Date.now(),
      })
      .run();
    await db
      .insert(spansTable)
      .values({
        id: 'trace-fetch-span-id',
        traceId: 'trace-fetch',
        spanId: 'trace-fetch-span',
        name: 'fetch-operation',
        startTime: 100,
      })
      .run();

    const spans = await getTraceSpans('trace-fetch');

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ spanId: 'trace-fetch-span', name: 'fetch-operation' });
  });
});
