import { and, eq, or, like, sql, desc, asc } from 'drizzle-orm';
import { getDb } from '../database';
import { evalResultsTable } from '../database/tables';
import { ResultFailureReason } from '../types';
import logger from '../logger';

interface QueryTestIndicesOptions {
  offset?: number;
  limit?: number;
  filterMode?: string;
  searchQuery?: string;
  filters?: string[];
}

/**
 * Safe, parameterized version of queryTestIndices that fixes SQL injection vulnerabilities
 * 
 * This replaces the dangerous raw SQL with string concatenation with proper Drizzle ORM queries
 */
export async function queryTestIndicesSafe(
  evalId: string,
  opts: QueryTestIndicesOptions = {}
): Promise<{ testIndices: number[]; filteredCount: number }> {
  const db = getDb();
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 50;
  const mode = opts.filterMode ?? 'all';

  // Build base conditions
  const conditions = [eq(evalResultsTable.evalId, evalId)];

  // Add filter mode conditions
  if (mode === 'errors') {
    conditions.push(eq(evalResultsTable.failureReason, ResultFailureReason.ERROR));
  } else if (mode === 'failures') {
    conditions.push(
      and(
        eq(evalResultsTable.success, false),
        sql`${evalResultsTable.failureReason} != ${ResultFailureReason.ERROR}`
      )!
    );
  } else if (mode === 'passes') {
    conditions.push(eq(evalResultsTable.success, true));
  }

  // Parse and add custom filters
  if (opts.filters && opts.filters.length > 0) {
    const filterConditions = opts.filters.map(filter => {
      const { logicOperator, type, operator, value, field } = JSON.parse(filter);
      
      if (type === 'metric' && operator === 'equals') {
        // Use parameterized JSON extraction
        return sql`json_extract(${evalResultsTable.namedScores}, ${`$.${value}`}) IS NOT NULL`;
      } else if (type === 'metadata' && field) {
        if (operator === 'equals') {
          return sql`json_extract(${evalResultsTable.metadata}, ${`$.${field}`}) = ${value}`;
        } else if (operator === 'contains') {
          return sql`json_extract(${evalResultsTable.metadata}, ${`$.${field}`}) LIKE ${`%${value}%`}`;
        } else if (operator === 'not_contains') {
          return or(
            sql`json_extract(${evalResultsTable.metadata}, ${`$.${field}`}) IS NULL`,
            sql`json_extract(${evalResultsTable.metadata}, ${`$.${field}`}) NOT LIKE ${`%${value}%`}`
          );
        }
      } else if (type === 'plugin' && operator === 'equals') {
        return sql`json_extract(${evalResultsTable.metadata}, '$.pluginId') = ${value}`;
      } else if (type === 'strategy' && operator === 'equals') {
        if (value === 'basic') {
          return or(
            sql`json_extract(${evalResultsTable.metadata}, '$.strategyId') IS NULL`,
            sql`json_extract(${evalResultsTable.metadata}, '$.strategyId') = ''`
          );
        } else {
          return sql`json_extract(${evalResultsTable.metadata}, '$.strategyId') = ${value}`;
        }
      }
      return null;
    }).filter(Boolean);

    if (filterConditions.length > 0) {
      // Apply filters with their logic operators
      // For now, we'll use AND for all filters (can be enhanced to support mixed AND/OR)
      conditions.push(and(...filterConditions)!);
    }
  }

  // Add search conditions
  if (opts.searchQuery && opts.searchQuery.trim() !== '') {
    const search = `%${opts.searchQuery}%`;
    const searchConditions = or(
      like(evalResultsTable.response, search),
      sql`json_extract(${evalResultsTable.gradingResult}, '$.reason') LIKE ${search}`,
      sql`json_extract(${evalResultsTable.gradingResult}, '$.comment') LIKE ${search}`,
      sql`json_extract(${evalResultsTable.namedScores}, '$') LIKE ${search}`,
      sql`json_extract(${evalResultsTable.metadata}, '$') LIKE ${search}`,
      sql`json_extract(${evalResultsTable.testCase}, '$.vars') LIKE ${search}`,
      sql`json_extract(${evalResultsTable.testCase}, '$.metadata') LIKE ${search}`
    );
    conditions.push(searchConditions!);
  }

  // Get filtered count
  const countStart = Date.now();
  const countQuery = db
    .select({ 
      count: sql<number>`COUNT(DISTINCT ${evalResultsTable.testIdx})` 
    })
    .from(evalResultsTable)
    .where(and(...conditions));

  const countResult = await countQuery;
  const filteredCount = Number(countResult[0]?.count || 0);
  const countEnd = Date.now();
  logger.debug(`Count query took ${countEnd - countStart}ms`);

  // Get distinct test indices
  const idxStart = Date.now();
  const indexQuery = db
    .selectDistinct({ testIdx: evalResultsTable.testIdx })
    .from(evalResultsTable)
    .where(and(...conditions))
    .orderBy(asc(evalResultsTable.testIdx))
    .limit(limit)
    .offset(offset);

  const rows = await indexQuery;
  const testIndices = rows.map(row => row.testIdx);
  const idxEnd = Date.now();
  logger.debug(`Index query took ${idxEnd - idxStart}ms`);

  return { testIndices, filteredCount };
}