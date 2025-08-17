import { sql } from 'drizzle-orm';
import { getDb } from '../database';
import { evalResultsTable } from '../database/tables';
import logger from '../logger';

interface CountCacheEntry {
  count: number;
  timestamp: number;
}

// Simple in-memory cache for counts with 5-minute TTL
const countCache = new Map<string, CountCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedResultsCount(evalId: string): Promise<number> {
  const cacheKey = `count:${evalId}`;
  const cached = countCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug(`Using cached count for eval ${evalId}: ${cached.count}`);
    return cached.count;
  }

  const db = getDb();
  const start = Date.now();

  // Use COUNT(*) with the composite index on (eval_id, test_idx)
  const result = await db
    .select({ count: sql<number>`COUNT(DISTINCT test_idx)` })
    .from(evalResultsTable)
    .where(sql`eval_id = ${evalId}`)
    .all();

  const count = Number(result[0]?.count ?? 0);
  const duration = Date.now() - start;

  logger.debug(`Count query for eval ${evalId} took ${duration}ms`);

  // Cache the result
  countCache.set(cacheKey, { count, timestamp: Date.now() });

  return count;
}

export function clearCountCache(evalId?: string) {
  if (evalId) {
    countCache.delete(`count:${evalId}`);
  } else {
    countCache.clear();
  }
}

// Optimized query for test indices without heavy JSON search
export async function queryTestIndicesOptimized(
  evalId: string,
  opts: {
    offset?: number;
    limit?: number;
    filterMode?: string;
    searchQuery?: string;
    filters?: string[];
  },
): Promise<{ testIndices: number[]; filteredCount: number }> {
  const db = getDb();
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 50;
  const mode = opts.filterMode ?? 'all';

  // Build base query with efficient filtering
  let baseQuery = sql`eval_id = ${evalId}`;

  // Add mode filter (these can use indexes)
  if (mode === 'errors') {
    baseQuery = sql`${baseQuery} AND failure_reason = ${2}`; // ResultFailureReason.ERROR
  } else if (mode === 'failures') {
    baseQuery = sql`${baseQuery} AND success = 0 AND failure_reason != ${2}`;
  } else if (mode === 'passes') {
    baseQuery = sql`${baseQuery} AND success = 1`;
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

  const countResult = await db.all<{ count: number }>(countQuery);
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

  const rows = await db.all<{ test_idx: number }>(idxQuery);
  const testIndices = rows.map((row) => row.test_idx);
  logger.debug(`Optimized index query took ${Date.now() - idxStart}ms`);

  return { testIndices, filteredCount };
}
