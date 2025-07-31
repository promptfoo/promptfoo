import { getDb } from '../database';
import { evalsTable } from '../database/tables';
import { eq, sql } from 'drizzle-orm';
import logger from '../logger';

/**
 * Update denormalized statistics for an eval
 * This should be called after eval results are inserted or updated
 */
export async function updateEvalStats(evalId: string): Promise<void> {
  const db = getDb();
  
  try {
    // Calculate stats in a single query
    const stats = await db.get(sql`
      SELECT 
        COUNT(DISTINCT test_idx) as test_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as pass_count,
        SUM(CASE WHEN success = 0 AND failure_reason != 1 THEN 1 ELSE 0 END) as fail_count,
        SUM(CASE WHEN failure_reason = 1 THEN 1 ELSE 0 END) as error_count,
        CAST(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS FLOAT) / 
          NULLIF(COUNT(*), 0) * 100 as pass_rate
      FROM eval_results
      WHERE eval_id = ${evalId}
    `);

    if (stats) {
      // Update the eval with the calculated stats
      await db
        .update(evalsTable)
        .set({
          testCount: Number(stats.test_count || 0),
          passCount: Number(stats.pass_count || 0),
          failCount: Number(stats.fail_count || 0),
          errorCount: Number(stats.error_count || 0),
          passRate: Number(stats.pass_rate || 0),
        })
        .where(eq(evalsTable.id, evalId));
      
      logger.debug(`Updated stats for eval ${evalId}`);
    }
  } catch (error) {
    logger.error(`Failed to update stats for eval ${evalId}:`, error);
  }
}

/**
 * Batch update stats for multiple evals
 * Useful for migrations or bulk operations
 */
export async function batchUpdateEvalStats(evalIds: string[]): Promise<void> {
  for (const evalId of evalIds) {
    await updateEvalStats(evalId);
  }
}