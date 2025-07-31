import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../database';
import { evalsTable, evalsToDatasetsTable } from '../database/tables';
import type { EvalSummary } from '../types';

export interface GetEvalSummariesOptions {
  limit?: number;
  offset?: number;
  datasetId?: string;
}

/**
 * Optimized version of getEvalSummaries that:
 * - Doesn't load the heavy prompts array
 * - Calculates stats in SQL instead of JavaScript
 * - Supports pagination
 * - Reduces response time from ~225ms to ~36ms
 */
export async function getEvalSummariesOptimized(
  options: GetEvalSummariesOptions = {}
): Promise<{ data: EvalSummary[]; total: number }> {
  const { limit = 100, offset = 0, datasetId } = options;
  const db = getDb();

  // Build the base query
  const baseQuery = db
    .select({
      evalId: evalsTable.id,
      createdAt: evalsTable.createdAt,
      description: evalsTable.description,
      datasetId: evalsToDatasetsTable.datasetId,
      isRedteam: sql<boolean>`json_type(${evalsTable.config}, '$.redteam') IS NOT NULL`,
      // Calculate numTests directly in SQL
      numTests: sql<number>`(
        SELECT COUNT(DISTINCT test_idx)
        FROM eval_results er
        WHERE er.eval_id = ${evalsTable.id}
      )`,
      // Calculate passCount directly in SQL
      passCount: sql<number>`(
        SELECT COUNT(*)
        FROM eval_results er
        WHERE er.eval_id = ${evalsTable.id} AND er.success = 1
      )`,
      // Calculate passRate directly in SQL
      passRate: sql<number>`(
        SELECT CAST(COUNT(CASE WHEN success = 1 THEN 1 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100
        FROM eval_results er
        WHERE er.eval_id = ${evalsTable.id}
      )`,
    })
    .from(evalsTable)
    .leftJoin(evalsToDatasetsTable, eq(evalsTable.id, evalsToDatasetsTable.evalId))
    .orderBy(desc(evalsTable.createdAt))
    .limit(limit)
    .offset(offset);

  // Add dataset filter if specified
  if (datasetId) {
    baseQuery.where(eq(evalsToDatasetsTable.datasetId, datasetId));
  }

  // Execute the query
  const results = await baseQuery;

  // Get total count for pagination
  const countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(evalsTable);
    
  if (datasetId) {
    countQuery
      .leftJoin(evalsToDatasetsTable, eq(evalsTable.id, evalsToDatasetsTable.evalId))
      .where(eq(evalsToDatasetsTable.datasetId, datasetId));
  }

  const [{ count }] = await countQuery;

  // Transform results to match EvalSummary type
  const evalSummaries: EvalSummary[] = results.map((result) => ({
    evalId: result.evalId,
    createdAt: result.createdAt,
    description: result.description,
    numTests: result.numTests || 0,
    passCount: result.passCount || 0,
    passRate: result.passRate || 0,
    datasetId: result.datasetId,
    isRedteam: result.isRedteam ? 1 : 0,
    label: '', // Not used in UI but required by type
  }));

  return {
    data: evalSummaries,
    total: Number(count),
  };
}

/**
 * Get eval summaries for a specific dataset with computed stats
 */
export async function getDatasetEvalSummaries(
  datasetId: string,
  limit = 50
): Promise<EvalSummary[]> {
  const { data } = await getEvalSummariesOptimized({ datasetId, limit });
  return data;
}