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

function jsonUsageNumber(column: SQL, usagePath: string, field: string): SQL {
  return sql`COALESCE(CAST(json_extract(${column}, ${`${usagePath}.${field}`}) AS INTEGER), 0)`;
}

function jsonUsageTotal(column: SQL, usagePath: string, cachedResponsePath?: string): SQL {
  const explicitTotal = sql`CAST(json_extract(${column}, ${`${usagePath}.total`}) AS INTEGER)`;
  const prompt = jsonUsageNumber(column, usagePath, 'prompt');
  const completion = jsonUsageNumber(column, usagePath, 'completion');
  const cached = jsonUsageNumber(column, usagePath, 'cached');
  const requests = sql`CAST(json_extract(${column}, ${`${usagePath}.numRequests`}) AS INTEGER)`;
  const explicitlyCached = cachedResponsePath
    ? sql`COALESCE(json_extract(${column}, ${cachedResponsePath}), 0) = 1`
    : sql`0`;

  return sql`CASE
    WHEN ${explicitlyCached} THEN
      CASE
        WHEN COALESCE(${explicitTotal}, 0) > 0 THEN ${explicitTotal}
        WHEN ${cached} > 0 THEN ${cached}
        ELSE ${prompt} + ${completion}
      END
    WHEN ${explicitTotal} IS NOT NULL THEN ${explicitTotal}
    WHEN ${requests} = 0 AND ${cached} > 0 AND (${prompt} + ${completion}) <= ${cached} THEN 0
    ELSE ${prompt} + ${completion}
  END`;
}

function jsonUsageRequests(column: SQL, usagePath: string, cachedResponsePath?: string): SQL {
  const explicitlyCached = cachedResponsePath
    ? sql`COALESCE(json_extract(${column}, ${cachedResponsePath}), 0) = 1`
    : sql`0`;
  return sql`CASE
    WHEN json_extract(${column}, ${usagePath}) IS NULL THEN 0
    WHEN ${explicitlyCached} THEN
      MAX(COALESCE(CAST(json_extract(${column}, ${`${usagePath}.numRequests`}) AS INTEGER), 1), 1)
    ELSE COALESCE(CAST(json_extract(${column}, ${`${usagePath}.numRequests`}) AS INTEGER), 1)
  END`;
}

function jsonUsageCached(column: SQL, usagePath: string, cachedResponsePath?: string): SQL {
  const cached = jsonUsageNumber(column, usagePath, 'cached');
  if (!cachedResponsePath) {
    return cached;
  }

  const reportedTotal = sql`COALESCE(
    CAST(json_extract(${column}, ${`${usagePath}.total`}) AS INTEGER),
    ${jsonUsageNumber(column, usagePath, 'prompt')} + ${jsonUsageNumber(column, usagePath, 'completion')}
  )`;
  return sql`CASE
    WHEN COALESCE(json_extract(${column}, ${cachedResponsePath}), 0) = 1 THEN
      CASE WHEN ${cached} > 0 THEN ${cached} ELSE ${reportedTotal} END
    ELSE ${cached}
  END`;
}

type TokenUsageField = 'total' | 'prompt' | 'completion' | 'cached' | 'numRequests';

interface FilteredBasicMetricsRow {
  prompt_idx: number;
  pass_count: number;
  fail_count: number;
  error_count: number;
  total_score: number;
  total_latency: number;
  total_cost: number;
  total_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_tokens: number | null;
  num_requests_with_tokens: number;
  attacker_total_tokens: number | null;
  attacker_prompt_tokens: number | null;
  attacker_completion_tokens: number | null;
  attacker_cached_tokens: number | null;
  attacker_num_requests: number | null;
  grading_total_tokens: number | null;
  grading_prompt_tokens: number | null;
  grading_completion_tokens: number | null;
  grading_cached_tokens: number | null;
  grading_num_requests: number | null;
  has_incurred_usage: number;
  incurred_total_tokens: number | null;
  incurred_prompt_tokens: number | null;
  incurred_completion_tokens: number | null;
  incurred_cached_tokens: number | null;
  incurred_num_requests: number | null;
  incurred_attacker_total_tokens: number | null;
  incurred_attacker_prompt_tokens: number | null;
  incurred_attacker_completion_tokens: number | null;
  incurred_attacker_cached_tokens: number | null;
  incurred_attacker_num_requests: number | null;
  incurred_grading_total_tokens: number | null;
  incurred_grading_prompt_tokens: number | null;
  incurred_grading_completion_tokens: number | null;
  incurred_grading_cached_tokens: number | null;
  incurred_grading_num_requests: number | null;
}

function jsonUsageField(
  column: SQL,
  usagePath: string,
  field: TokenUsageField,
  cachedResponsePath?: string,
): SQL {
  switch (field) {
    case 'total':
      return jsonUsageTotal(column, usagePath, cachedResponsePath);
    case 'numRequests':
      return jsonUsageRequests(column, usagePath, cachedResponsePath);
    case 'cached':
      return jsonUsageCached(column, usagePath, cachedResponsePath);
    default:
      return jsonUsageNumber(column, usagePath, field);
  }
}

function jsonIncurredUsageField(
  column: SQL,
  logicalPath: string,
  incurredPath: string,
  field: TokenUsageField,
  options?: { cachedResponsePath?: string; parentIncurredPath?: string },
): SQL {
  const logicalUsage = jsonUsageField(column, logicalPath, field, options?.cachedResponsePath);
  const incurredUsage = jsonUsageField(column, incurredPath, field);
  const parentHasIncurredUsage = options?.parentIncurredPath
    ? sql`json_extract(${column}, ${options.parentIncurredPath}) IS NOT NULL`
    : sql`0`;
  const explicitlyCached = options?.cachedResponsePath
    ? sql`COALESCE(json_extract(${column}, ${options.cachedResponsePath}), 0) = 1`
    : sql`0`;

  return sql`CASE
    WHEN json_extract(${column}, ${incurredPath}) IS NOT NULL THEN ${incurredUsage}
    WHEN ${parentHasIncurredUsage} OR ${explicitlyCached} THEN 0
    ELSE ${logicalUsage}
  END`;
}

function getIncurredTokenUsage(
  row: FilteredBasicMetricsRow,
): NonNullable<PromptMetrics['tokenUsage']['incurredTokenUsage']> {
  return {
    total: row.incurred_total_tokens || 0,
    prompt: row.incurred_prompt_tokens || 0,
    completion: row.incurred_completion_tokens || 0,
    cached: row.incurred_cached_tokens || 0,
    numRequests: row.incurred_num_requests || 0,
    attacker: {
      total: row.incurred_attacker_total_tokens || 0,
      prompt: row.incurred_attacker_prompt_tokens || 0,
      completion: row.incurred_attacker_completion_tokens || 0,
      cached: row.incurred_attacker_cached_tokens || 0,
      numRequests: row.incurred_attacker_num_requests || 0,
    },
    assertions: {
      total: row.incurred_grading_total_tokens || 0,
      prompt: row.incurred_grading_prompt_tokens || 0,
      completion: row.incurred_grading_completion_tokens || 0,
      cached: row.incurred_grading_cached_tokens || 0,
      numRequests: row.incurred_grading_num_requests || 0,
    },
  };
}

function getFilteredTokenUsage(row: FilteredBasicMetricsRow): PromptMetrics['tokenUsage'] {
  return {
    total: row.total_tokens || 0,
    prompt: row.prompt_tokens || 0,
    completion: row.completion_tokens || 0,
    cached: row.cached_tokens || 0,
    numRequests: row.num_requests_with_tokens || 0,
    attacker: {
      total: row.attacker_total_tokens || 0,
      prompt: row.attacker_prompt_tokens || 0,
      completion: row.attacker_completion_tokens || 0,
      cached: row.attacker_cached_tokens || 0,
      numRequests: row.attacker_num_requests || 0,
    },
    assertions: {
      total: row.grading_total_tokens || 0,
      prompt: row.grading_prompt_tokens || 0,
      completion: row.grading_completion_tokens || 0,
      cached: row.grading_cached_tokens || 0,
      numRequests: row.grading_num_requests || 0,
    },
    ...(row.has_incurred_usage > 0 && {
      incurredTokenUsage: getIncurredTokenUsage(row),
    }),
  };
}

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

  const response = sql`response`;
  const gradingResult = sql`grading_result`;
  const targetPath = '$.tokenUsage';
  const incurredTargetPath = '$.tokenUsage.incurredTokenUsage';
  const attackerPath = '$.tokenUsage.attacker';
  const incurredAttackerPath = '$.tokenUsage.incurredTokenUsage.attacker';
  const internalGradingPath = '$.tokenUsage.assertions';
  const incurredInternalGradingPath = '$.tokenUsage.incurredTokenUsage.assertions';
  const gradingPath = '$.tokensUsed';
  const incurredGradingPath = '$.tokensUsed.incurredTokenUsage';
  const gradingCachePath = '$.metadata.cachedResponse';
  const responseCachePath = '$.cached';
  const incurredTargetUsage = (field: TokenUsageField) =>
    jsonIncurredUsageField(response, targetPath, incurredTargetPath, field, {
      cachedResponsePath: responseCachePath,
    });
  const incurredAttackerUsage = (field: TokenUsageField) =>
    jsonIncurredUsageField(response, attackerPath, incurredAttackerPath, field, {
      cachedResponsePath: responseCachePath,
      parentIncurredPath: incurredTargetPath,
    });
  const incurredInternalGradingUsage = (field: TokenUsageField) =>
    jsonIncurredUsageField(response, internalGradingPath, incurredInternalGradingPath, field, {
      cachedResponsePath: responseCachePath,
      parentIncurredPath: incurredTargetPath,
    });
  const incurredGradingUsage = (field: TokenUsageField) =>
    jsonIncurredUsageField(gradingResult, gradingPath, incurredGradingPath, field, {
      cachedResponsePath: gradingCachePath,
    });

  const basicMetricsQuery = sql`
    SELECT
      prompt_idx,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as pass_count,
      SUM(CASE WHEN success = 0 AND failure_reason != ${ResultFailureReason.ERROR} THEN 1 ELSE 0 END) as fail_count,
      SUM(CASE WHEN failure_reason = ${ResultFailureReason.ERROR} THEN 1 ELSE 0 END) as error_count,
      SUM(score) as total_score,
      SUM(latency_ms) as total_latency,
      SUM(cost) as total_cost,
      -- Token usage aggregation (token usage is inside response JSON)
      -- Token usage aggregation (token usage is inside response JSON)
      SUM(${jsonUsageTotal(response, targetPath)}) as total_tokens,
      SUM(${jsonUsageNumber(response, targetPath, 'prompt')}) as prompt_tokens,
      SUM(${jsonUsageNumber(response, targetPath, 'completion')}) as completion_tokens,
      SUM(${jsonUsageCached(response, targetPath)}) as cached_tokens,
      SUM(${jsonUsageRequests(response, targetPath)}) as num_requests_with_tokens,
      SUM(${jsonUsageTotal(response, attackerPath)}) as attacker_total_tokens,
      SUM(${jsonUsageNumber(response, attackerPath, 'prompt')}) as attacker_prompt_tokens,
      SUM(${jsonUsageNumber(response, attackerPath, 'completion')}) as attacker_completion_tokens,
      SUM(${jsonUsageCached(response, attackerPath)}) as attacker_cached_tokens,
      SUM(${jsonUsageRequests(response, attackerPath)}) as attacker_num_requests,
      SUM(
        ${jsonUsageTotal(response, internalGradingPath)} +
        ${jsonUsageTotal(gradingResult, gradingPath, gradingCachePath)}
      ) as grading_total_tokens,
      SUM(
        ${jsonUsageNumber(response, internalGradingPath, 'prompt')} +
        ${jsonUsageNumber(gradingResult, gradingPath, 'prompt')}
      ) as grading_prompt_tokens,
      SUM(
        ${jsonUsageNumber(response, internalGradingPath, 'completion')} +
        ${jsonUsageNumber(gradingResult, gradingPath, 'completion')}
      ) as grading_completion_tokens,
      SUM(
        ${jsonUsageCached(response, internalGradingPath)} +
        ${jsonUsageCached(gradingResult, gradingPath, gradingCachePath)}
      ) as grading_cached_tokens,
      SUM(
        ${jsonUsageRequests(response, internalGradingPath)} +
        ${jsonUsageRequests(gradingResult, gradingPath, gradingCachePath)}
      ) as grading_num_requests,
      SUM(
        CASE
          WHEN json_extract(response, ${incurredTargetPath}) IS NOT NULL
            OR json_extract(grading_result, ${incurredGradingPath}) IS NOT NULL
            OR COALESCE(json_extract(response, ${responseCachePath}), 0) = 1
            OR COALESCE(json_extract(grading_result, ${gradingCachePath}), 0) = 1
          THEN 1
          ELSE 0
        END
      ) as has_incurred_usage,
      SUM(${incurredTargetUsage('total')}) as incurred_total_tokens,
      SUM(${incurredTargetUsage('prompt')}) as incurred_prompt_tokens,
      SUM(${incurredTargetUsage('completion')}) as incurred_completion_tokens,
      SUM(${incurredTargetUsage('cached')}) as incurred_cached_tokens,
      SUM(${incurredTargetUsage('numRequests')}) as incurred_num_requests,
      SUM(${incurredAttackerUsage('total')}) as incurred_attacker_total_tokens,
      SUM(${incurredAttackerUsage('prompt')}) as incurred_attacker_prompt_tokens,
      SUM(${incurredAttackerUsage('completion')}) as incurred_attacker_completion_tokens,
      SUM(${incurredAttackerUsage('cached')}) as incurred_attacker_cached_tokens,
      SUM(${incurredAttackerUsage('numRequests')}) as incurred_attacker_num_requests,
      SUM(
        ${incurredInternalGradingUsage('total')} + ${incurredGradingUsage('total')}
      ) as incurred_grading_total_tokens,
      SUM(
        ${incurredInternalGradingUsage('prompt')} + ${incurredGradingUsage('prompt')}
      ) as incurred_grading_prompt_tokens,
      SUM(
        ${incurredInternalGradingUsage('completion')} + ${incurredGradingUsage('completion')}
      ) as incurred_grading_completion_tokens,
      SUM(
        ${incurredInternalGradingUsage('cached')} + ${incurredGradingUsage('cached')}
      ) as incurred_grading_cached_tokens,
      SUM(
        ${incurredInternalGradingUsage('numRequests')} + ${incurredGradingUsage('numRequests')}
      ) as incurred_grading_num_requests
    FROM eval_results
    WHERE ${whereSql}
    GROUP BY prompt_idx
    ORDER BY prompt_idx
  `;

  const basicResults = (await db.all(basicMetricsQuery)) as FilteredBasicMetricsRow[];

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
      tokenUsage: getFilteredTokenUsage(row),
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
