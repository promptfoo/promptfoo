import { sql } from 'drizzle-orm';
import { HUMAN_ASSERTION_TYPE } from '../constants';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import logger from '../logger';

import type { EvalResultsFilterMode } from '../types/index';

/** Result from COUNT queries using db.all() - count is always a number in result array */
interface CountResult {
  count: number;
}

/** Result from queries selecting test_idx column */
interface TestIndexRow {
  test_idx: number;
}

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

  const db = getDb();
  const start = Date.now();

  // Count distinct test indices (unique test cases) - this is what the UI shows as "results"
  const result = db
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

  const db = getDb();
  const start = Date.now();

  // Count all result rows - use this when iterating over all results
  const result = db
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

// Optimized query for test indices without heavy JSON search
export async function queryTestIndicesOptimized(
  evalId: string,
  opts: {
    offset?: number;
    limit?: number;
    filterMode?: EvalResultsFilterMode;
    searchQuery?: string;
    filters?: string[];
  },
): Promise<{ testIndices: number[]; filteredCount: number }> {
  const db = getDb();
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 50;
  const mode: EvalResultsFilterMode = opts.filterMode ?? 'all';

  // Build base query with efficient filtering
  let baseQuery = sql`eval_id = ${evalId}`;

  // Add mode filter (these can use indexes)
  if (mode === 'errors') {
    baseQuery = sql`${baseQuery} AND failure_reason = ${2}`; // ResultFailureReason.ERROR
  } else if (mode === 'failures') {
    baseQuery = sql`${baseQuery} AND success = 0 AND failure_reason != ${2}`;
  } else if (mode === 'passes') {
    baseQuery = sql`${baseQuery} AND success = 1`;
  } else if (mode === 'highlights') {
    baseQuery = sql`${baseQuery} AND json_extract(grading_result, '$.comment') LIKE '!highlight%'`;
  } else if (mode === 'user-rated') {
    // Check if componentResults array contains an entry with assertion.type = 'human'
    baseQuery = sql`${baseQuery} AND EXISTS (
      SELECT 1
      FROM json_each(grading_result, '$.componentResults')
      WHERE json_extract(value, '$.assertion.type') = ${HUMAN_ASSERTION_TYPE}
    )`;
  }

  // For search queries, only search in response field if no filters
  // This is a compromise - we search less fields but query is faster
  let searchCondition = sql`1=1`;
  if (opts.searchQuery && opts.searchQuery.trim() !== '' && !opts.filters?.length) {
    const sanitizedSearch = opts.searchQuery.replace(/'/g, "''");
    // Only search in response field for better performance
    searchCondition = sql`response LIKE ${'%' + sanitizedSearch + '%'}`;
  }

  const whereClause = sql`${baseQuery} AND ${searchCondition}`;

  // Get filtered count using the composite index
  const countStart = Date.now();
  const countQuery = sql`
    SELECT COUNT(DISTINCT test_idx) as count 
    FROM ${evalResultsTable} 
    WHERE ${whereClause}
  `;

  const countResult = db.all<CountResult>(countQuery);
  const filteredCount = Number(countResult[0]?.count ?? 0);
  logger.debug(`Optimized count query took ${Date.now() - countStart}ms`);

  // Get test indices
  const idxStart = Date.now();
  const idxQuery = sql`
    SELECT DISTINCT test_idx 
    FROM ${evalResultsTable} 
    WHERE ${whereClause}
    ORDER BY test_idx 
    LIMIT ${limit} 
    OFFSET ${offset}
  `;

  const rows = db.all<TestIndexRow>(idxQuery);
  const testIndices = rows.map((row) => row.test_idx);
  logger.debug(`Optimized index query took ${Date.now() - idxStart}ms`);

  return { testIndices, filteredCount };
}
