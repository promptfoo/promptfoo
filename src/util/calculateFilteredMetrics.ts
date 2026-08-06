/**
 * Calculate metrics for filtered evaluation results.
 *
 * Basic numeric fields stay on a grouped SQL query. Row-level JSON fields are
 * processed in bounded pages so named metrics use the same accumulator as live
 * evaluation without loading the full filtered dataset into memory.
 *
 * SECURITY: whereSql is a Drizzle SQL fragment, not a raw string. Persisted
 * metric templates are handled by accumulateNamedMetric's data-only renderer.
 */

import { type SQL, sql } from 'drizzle-orm';
import { getDb } from '../database/index';
import logger from '../logger';
import { ResultFailureReason } from '../types/index';
import { accumulateNamedMetric } from './namedMetrics';

import type { PromptMetrics, Vars } from '../types/index';

export interface FilteredMetricsOptions {
  evalId: string;
  numPrompts: number;
  /** SQL fragment for WHERE clause (not a raw string - prevents SQL injection) */
  whereSql: SQL<unknown>;
}

/** Protects the synchronous table request from unbounded result sets. */
const MAX_RESULTS_FOR_METRICS = 50000;
const RESULT_DETAILS_BATCH_SIZE = 5000;
const MAX_RESULT_DETAILS_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_RESULT_DETAILS_TOTAL_BYTES = 64 * 1024 * 1024;

type Database = Awaited<ReturnType<typeof getDb>>;
type QueryDatabase = Pick<Database, 'all'>;

class FilteredMetricsLimitError extends Error {}

async function withReadSnapshot<T>(callback: (db: QueryDatabase) => Promise<T>): Promise<T> {
  const db = await getDb();
  const readTransaction = await db.$client.transaction('read');
  const { drizzle } = await import('drizzle-orm/libsql/node');
  const readDb = drizzle(readTransaction as unknown as Database['$client']);

  try {
    const result = await callback(readDb);
    await readTransaction.commit();
    return result;
  } catch (error) {
    if (!readTransaction.closed) {
      await readTransaction.rollback();
    }
    throw error;
  } finally {
    readTransaction.close();
  }
}

export async function calculateFilteredMetrics(
  opts: FilteredMetricsOptions,
): Promise<PromptMetrics[]> {
  try {
    return await withReadSnapshot((db) => calculateWithOptimizedQuery(opts, db));
  } catch (error) {
    if (error instanceof FilteredMetricsLimitError) {
      throw error;
    }
    logger.error('Failed to calculate filtered metrics with optimized query', { error });
    return createEmptyMetricsArray(opts.numPrompts);
  }
}

async function calculateWithOptimizedQuery(
  opts: FilteredMetricsOptions,
  db: QueryDatabase,
): Promise<PromptMetrics[]> {
  const { numPrompts, whereSql } = opts;
  const metrics = createEmptyMetricsArray(numPrompts);
  const resultCount = await getBoundedResultCount(db, whereSql);
  if (resultCount > MAX_RESULTS_FOR_METRICS) {
    logger.warn(`Filtered result count exceeds limit ${MAX_RESULTS_FOR_METRICS}`, {
      evalId: opts.evalId,
    });
    throw new FilteredMetricsLimitError(`Result count exceeds maximum ${MAX_RESULTS_FOR_METRICS}`);
  }

  const basicMetricsQuery = sql`
    SELECT
      prompt_idx,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as pass_count,
      SUM(CASE WHEN success = 0 AND failure_reason != ${ResultFailureReason.ERROR} THEN 1 ELSE 0 END) as fail_count,
      SUM(CASE WHEN failure_reason = ${ResultFailureReason.ERROR} THEN 1 ELSE 0 END) as error_count,
      SUM(score) as total_score,
      SUM(latency_ms) as total_latency,
      SUM(cost) as total_cost,
      SUM(CAST(json_extract(response, '$.tokenUsage.total') AS INTEGER)) as total_tokens,
      SUM(CAST(json_extract(response, '$.tokenUsage.prompt') AS INTEGER)) as prompt_tokens,
      SUM(CAST(json_extract(response, '$.tokenUsage.completion') AS INTEGER)) as completion_tokens,
      SUM(CAST(json_extract(response, '$.tokenUsage.cached') AS INTEGER)) as cached_tokens,
      COUNT(CASE WHEN json_extract(response, '$.tokenUsage') IS NOT NULL THEN 1 END) as num_requests_with_tokens
    FROM eval_results
    WHERE ${whereSql}
    GROUP BY prompt_idx
    ORDER BY prompt_idx
  `;

  const basicResults = (await db.all(basicMetricsQuery)) as BasicMetricsRow[];

  for (const row of basicResults) {
    const idx = row.prompt_idx;
    if (idx < 0 || idx >= numPrompts) {
      logger.warn(`Invalid prompt_idx ${idx}, expected 0-${numPrompts - 1}`);
      continue;
    }

    metrics[idx] = {
      score: finiteOrZero(row.total_score),
      testPassCount: finiteOrZero(row.pass_count),
      testFailCount: finiteOrZero(row.fail_count),
      testErrorCount: finiteOrZero(row.error_count),
      totalLatencyMs: finiteOrZero(row.total_latency),
      cost: finiteOrZero(row.total_cost),
      tokenUsage: {
        total: finiteOrZero(row.total_tokens),
        prompt: finiteOrZero(row.prompt_tokens),
        completion: finiteOrZero(row.completion_tokens),
        cached: finiteOrZero(row.cached_tokens),
        numRequests: finiteOrZero(row.num_requests_with_tokens),
      },
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
      assertPassCount: 0,
      assertFailCount: 0,
    };
  }

  await aggregateResultDetails(metrics, whereSql, db);

  logger.debug('Filtered metrics calculated', {
    numPrompts,
    metricsCount: basicResults.length,
    resultCount,
  });
  return metrics;
}

async function getBoundedResultCount(db: QueryDatabase, whereSql: SQL<unknown>): Promise<number> {
  const rows = (await db.all(sql`
    SELECT COUNT(*) AS count
    FROM (
      SELECT 1
      FROM eval_results
      WHERE ${whereSql}
      LIMIT ${MAX_RESULTS_FOR_METRICS + 1}
    )
  `)) as Array<{ count: number }>;
  return finiteOrZero(rows[0]?.count);
}

interface BasicMetricsRow {
  prompt_idx: number;
  pass_count: number;
  fail_count: number;
  error_count: number;
  total_score: number | null;
  total_latency: number | null;
  total_cost: number | null;
  total_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_tokens: number | null;
  num_requests_with_tokens: number;
}

interface ResultDetailsRow {
  prompt_idx: number;
  named_scores: unknown;
  grading_result: unknown;
  test_case: unknown;
}

interface ResultDetailsPageRow {
  row_cursor: number;
  detail_bytes: number;
}

function finiteOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getTestVars(testCase: Record<string, unknown> | undefined): Vars {
  return isRecord(testCase?.vars) ? (testCase.vars as Vars) : {};
}

function accumulateAssertionCounts(
  metrics: PromptMetrics,
  gradingResult: Record<string, unknown> | undefined,
): void {
  const componentResults = Array.isArray(gradingResult?.componentResults)
    ? gradingResult.componentResults
    : [];

  for (const componentResult of componentResults) {
    if (!isRecord(componentResult)) {
      continue;
    }
    if (componentResult.pass === true) {
      metrics.assertPassCount++;
    } else if (componentResult.pass === false) {
      metrics.assertFailCount++;
    }
  }
}

function accumulateResultDetails(metrics: PromptMetrics[], row: ResultDetailsRow): void {
  const idx = row.prompt_idx;
  if (idx < 0 || idx >= metrics.length || !metrics[idx]) {
    return;
  }

  const gradingResult = parseJsonObject(row.grading_result);
  const namedScores = parseJsonObject(row.named_scores);
  const testVars = getTestVars(parseJsonObject(row.test_case));

  if (namedScores) {
    for (const [metricName, metricValue] of Object.entries(namedScores)) {
      if (typeof metricValue !== 'number' || !Number.isFinite(metricValue)) {
        continue;
      }
      accumulateNamedMetric(metrics[idx], {
        metricName,
        metricValue,
        gradingResult,
        testVars,
      });
    }
  }

  accumulateAssertionCounts(metrics[idx], gradingResult);
}

/**
 * Process row-level JSON in bounded pages. JSON.parse intentionally supplies
 * JavaScript's canonical last-key-wins behavior for imported duplicate keys.
 */
async function aggregateResultDetails(
  metrics: PromptMetrics[],
  whereSql: SQL<unknown>,
  db: QueryDatabase,
): Promise<void> {
  const hasNamedScoreEntriesSql = sql`
    eval_results.named_scores IS NOT NULL
    AND eval_results.named_scores <> ${'{}'}
  `;
  let lastRowCursor: number | undefined;
  let processedRows = 0;
  let totalDetailBytes = 0;

  while (true) {
    const cursorSql =
      lastRowCursor === undefined ? sql`` : sql`AND eval_results.rowid > ${lastRowCursor}`;
    const pageRows = (await db.all(sql`
      SELECT
        eval_results.rowid AS row_cursor,
        COALESCE(LENGTH(CAST(named_scores AS BLOB)), 0) +
          COALESCE(LENGTH(CAST(grading_result AS BLOB)), 0) +
          CASE
            WHEN ${hasNamedScoreEntriesSql} THEN LENGTH(CAST(test_case AS BLOB))
            ELSE 0
          END AS detail_bytes
      FROM eval_results
      WHERE ${whereSql}
        ${cursorSql}
        AND (${hasNamedScoreEntriesSql} OR grading_result IS NOT NULL)
      ORDER BY eval_results.rowid
      LIMIT ${RESULT_DETAILS_BATCH_SIZE}
    `)) as ResultDetailsPageRow[];
    if (pageRows.length === 0) {
      break;
    }

    const pageBytes = pageRows.reduce((total, row) => {
      if (!Number.isFinite(row.row_cursor) || !Number.isFinite(row.detail_bytes)) {
        throw new Error('Invalid result detail page metadata');
      }
      return total + row.detail_bytes;
    }, 0);
    totalDetailBytes += pageBytes;
    if (
      pageBytes > MAX_RESULT_DETAILS_PAGE_BYTES ||
      totalDetailBytes > MAX_RESULT_DETAILS_TOTAL_BYTES
    ) {
      throw new FilteredMetricsLimitError(
        'Filtered result details exceed the safe processing limit',
      );
    }

    const pageLastRowCursor = pageRows[pageRows.length - 1]?.row_cursor;
    if (pageLastRowCursor === undefined) {
      break;
    }
    const rows = (await db.all(sql`
      SELECT
        prompt_idx,
        named_scores,
        grading_result,
        CASE WHEN ${hasNamedScoreEntriesSql} THEN test_case ELSE NULL END AS test_case
      FROM eval_results
      WHERE ${whereSql}
        ${cursorSql}
        AND eval_results.rowid <= ${pageLastRowCursor}
        AND (${hasNamedScoreEntriesSql} OR grading_result IS NOT NULL)
      ORDER BY eval_results.rowid
    `)) as ResultDetailsRow[];
    if (rows.length !== pageRows.length) {
      throw new Error('Filtered result detail page changed during aggregation');
    }

    for (const row of rows) {
      accumulateResultDetails(metrics, row);
    }

    processedRows += rows.length;
    if (processedRows > MAX_RESULTS_FOR_METRICS) {
      throw new FilteredMetricsLimitError(
        `Result count exceeds maximum ${MAX_RESULTS_FOR_METRICS}`,
      );
    }
    lastRowCursor = pageLastRowCursor;
    if (pageRows.length < RESULT_DETAILS_BATCH_SIZE) {
      break;
    }
  }
}

function createEmptyMetricsArray(numPrompts: number): PromptMetrics[] {
  return Array.from({ length: numPrompts }, () => ({
    score: 0,
    testPassCount: 0,
    testFailCount: 0,
    testErrorCount: 0,
    assertPassCount: 0,
    assertFailCount: 0,
    totalLatencyMs: 0,
    tokenUsage: {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
    },
    namedScores: {},
    namedScoresCount: {},
    namedScoreWeights: {},
    cost: 0,
  }));
}
