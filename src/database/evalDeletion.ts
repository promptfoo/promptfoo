import { inArray, sql } from 'drizzle-orm';
import { spansTable, tracesTable } from './tables';

import type { getDb } from './index';

// SQLite limits a single statement to 999 bound parameters by default.
const SQLITE_MAX_BOUND_PARAMETERS = 999;

/**
 * Removes spans and traces tied to the given eval ids.
 *
 * `traces.evaluation_id -> evals.id` and `spans.trace_id -> traces.trace_id` are
 * FK-enforced (see `pragma foreign_keys = ON`) without `ON DELETE CASCADE`, so any
 * eval-deletion path must clear spans before traces before the eval row itself.
 *
 * Spans are removed via a correlated subquery so the query stays within SQLite's
 * bound-parameter limit even when an eval has many traces.
 */
export function deleteTraceRecordsForEvals(db: ReturnType<typeof getDb>, evalIds: string[]): void {
  for (let i = 0; i < evalIds.length; i += SQLITE_MAX_BOUND_PARAMETERS) {
    const evalIdBatch = evalIds.slice(i, i + SQLITE_MAX_BOUND_PARAMETERS);

    db.delete(spansTable)
      .where(
        sql`${spansTable.traceId} in (
          select ${tracesTable.traceId}
          from ${tracesTable}
          where ${inArray(tracesTable.evaluationId, evalIdBatch)}
        )`,
      )
      .run();

    db.delete(tracesTable).where(inArray(tracesTable.evaluationId, evalIdBatch)).run();
  }
}
