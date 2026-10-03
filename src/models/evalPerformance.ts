import { sql } from 'drizzle-orm';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import logger from '../logger';

interface CountCacheEntry {
  count: number;
  timestamp: number;
}

// Simple in-memory cache for counts with 5-minute TTL
const distinctCountCache = new Map<string, CountCacheEntry>();
const totalRowCountCache = new Map<string, CountCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the count of distinct test indices for an eval.
 * This represents the number of unique test cases (rows in the UI table).
 *
 * Use getTotalResultRowCount() if you need the total number of result rows
 * (which may be higher when there are multiple prompts/providers per test case).
 */
export async function getCachedResultsCount(evalId: string): Promise<number> {
  const cacheKey = `distinct:${evalId}`;
  const cached = distinctCountCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug(`Using cached distinct count for eval ${evalId}: ${cached.count}`);
    return cached.count;
  }

  const db = await getDb();
  const start = Date.now();

  // Count distinct test indices (unique test cases) - this is what the UI shows as "results"
  const result = await db
    .select({ count: sql<number>`COUNT(DISTINCT test_idx)` })
    .from(evalResultsTable)
    .where(sql`eval_id = ${evalId}`)
    .all();

  const count = Number(result[0]?.count ?? 0);
  const duration = Date.now() - start;

  logger.debug(`Distinct count query for eval ${evalId}: ${count} in ${duration}ms`);

  // Cache the result
  distinctCountCache.set(cacheKey, { count, timestamp: Date.now() });

  return count;
}

/**
 * Get the total count of all result rows for an eval.
 * This counts every result row in the database, including multiple results
 * per test case (e.g., when using multiple prompts or providers).
 *
 * Use this for progress tracking when iterating over all results (e.g., sharing).
 */
export async function getTotalResultRowCount(evalId: string): Promise<number> {
  const cacheKey = `total:${evalId}`;
  const cached = totalRowCountCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug(`Using cached total row count for eval ${evalId}: ${cached.count}`);
    return cached.count;
  }

  const db = await getDb();
  const start = Date.now();

  // Count all result rows - use this when iterating over all results
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(evalResultsTable)
    .where(sql`eval_id = ${evalId}`)
    .all();

  const count = Number(result[0]?.count ?? 0);
  const duration = Date.now() - start;

  logger.debug(`Total row count query for eval ${evalId}: ${count} in ${duration}ms`);

  // Cache the result
  totalRowCountCache.set(cacheKey, { count, timestamp: Date.now() });

  return count;
}

export function clearCountCache(evalId?: string) {
  if (evalId) {
    distinctCountCache.delete(`distinct:${evalId}`);
    totalRowCountCache.delete(`total:${evalId}`);
  } else {
    distinctCountCache.clear();
    totalRowCountCache.clear();
  }
}
