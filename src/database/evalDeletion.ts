import { inArray, sql } from 'drizzle-orm';
import { spansTable, tracesTable } from './tables';

import type { getDb } from './index';

const SQLITE_MAX_BOUND_PARAMETERS = 999;

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
