/**
 * Calculate metrics for filtered evaluation results.
 *
 * This module implements optimized SQL aggregation to calculate metrics for
 * filtered evaluation datasets. It uses a single GROUP BY query to aggregate
 * ALL prompts at once, achieving significant performance improvements over
 * the naive approach of querying each prompt separately.
 *
 * SECURITY: This module uses Drizzle's sql template strings for parameterized queries
 * to prevent SQL injection. The whereSql parameter is a SQL fragment, not a string,
 * ensuring all user-provided values are properly escaped.
 *
 * Performance targets:
 * - Simple eval (2 prompts, 100 results): <50ms
 * - Complex eval (10 prompts, 1000 results): <150ms
 * - Large eval (10 prompts, 10000 results): <500ms
 *
 * Critical design decisions:
 * 1. Single GROUP BY query for all basic metrics + token usage
 * 2. SQL JSON aggregation for named scores (avoids memory issues)
 * 3. SQL JSON aggregation for assertions (complex nested JSON)
 * 4. OOM protection with MAX_RESULTS_FOR_METRICS limit
 */

import { type SQL, sql } from 'drizzle-orm';
import { getDb } from '../database/index';
import logger from '../logger';
import { ResultFailureReason } from '../types/index';

import type { PromptMetrics } from '../types/index';

export interface FilteredMetricsOptions {
  evalId: string;
  numPrompts: number;
  /** SQL fragment for WHERE clause (not a raw string - prevents SQL injection) */
  whereSql: SQL<unknown>;
}

/**
 * Maximum number of results to process for metrics calculation.
 * Protects against OOM on extremely large filtered datasets.
 */
const MAX_RESULTS_FOR_METRICS = 50000;

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
  total_count: number;
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

/**
 * Calculates metrics for filtered results using optimized SQL aggregation.
 * Uses a SINGLE GROUP BY query to aggregate all prompts at once.
 *
 * SECURITY: Uses parameterized SQL queries via Drizzle's sql template strings.
 * The whereSql parameter is a SQL fragment, not a raw string, ensuring all
 * user-provided values are properly escaped.
 *
 * This is the core performance optimization - instead of making 2-3 queries
 * per prompt (which would be 30 queries for 10 prompts), we make 3-4 total queries:
 * 1. Count check (OOM protection)
 * 2. Basic metrics + token usage (GROUP BY prompt_idx)
 * 3. Named scores (GROUP BY prompt_idx, metric_name)
 * 4. Assertions (GROUP BY prompt_idx)
 *
 * @param opts - Options including WHERE clause SQL fragment
 * @returns Array of PromptMetrics, one per prompt
 */
export async function calculateFilteredMetrics(
  opts: FilteredMetricsOptions,
): Promise<PromptMetrics[]> {
  const { numPrompts, whereSql } = opts;

  try {
    // Check result count first (protect against OOM)
    const countResult = await getResultCount(whereSql);
    if (countResult > MAX_RESULTS_FOR_METRICS) {
      logger.warn(`Filtered result count ${countResult} exceeds limit ${MAX_RESULTS_FOR_METRICS}`, {
        evalId: opts.evalId,
      });
      throw new Error(`Result count ${countResult} exceeds maximum ${MAX_RESULTS_FOR_METRICS}`);
    }

    // Calculate metrics using optimized approach
    return await calculateWithOptimizedQuery(opts);
  } catch (error) {
    logger.error('Failed to calculate filtered metrics with optimized query', { error });

    // Fallback: Return empty metrics
    return createEmptyMetricsArray(numPrompts);
  }
}

/**
 * Get count of filtered results (for OOM protection)
 *
 * SECURITY: Uses parameterized SQL query via Drizzle's sql template strings.
 */
async function getResultCount(whereSql: SQL<unknown>): Promise<number> {
  const db = await getDb();
  const query = sql`
    SELECT COUNT(*) as count
    FROM eval_results
    WHERE ${whereSql}
  `;

  const result = (await db.get(query)) as { count: number } | undefined;
  return result?.count || 0;
}

/**
 * OPTIMIZED: Single GROUP BY query aggregating ALL prompts at once.
 * This is the key performance improvement from the audit.
 *
 * SECURITY: Uses parameterized SQL queries via Drizzle's sql template strings.
 */
async function calculateWithOptimizedQuery(opts: FilteredMetricsOptions): Promise<PromptMetrics[]> {
  const { numPrompts, whereSql } = opts;
  const db = await getDb();

  // Initialize empty metrics
  const metrics = createEmptyMetricsArray(numPrompts);
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

  // ===== QUERY 1: Basic metrics + token usage (ALL PROMPTS) =====
  const basicMetricsQuery = sql`
    SELECT
      prompt_idx,
      COUNT(DISTINCT test_idx) as total_count,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as pass_count,
      SUM(CASE WHEN success = 0 AND failure_reason != ${ResultFailureReason.ERROR} THEN 1 ELSE 0 END) as fail_count,
      SUM(CASE WHEN failure_reason = ${ResultFailureReason.ERROR} THEN 1 ELSE 0 END) as error_count,
      SUM(score) as total_score,
      SUM(latency_ms) as total_latency,
      SUM(cost) as total_cost,
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

  // Populate basic metrics
  for (const row of basicResults) {
    const idx = row.prompt_idx;
    if (idx < 0 || idx >= numPrompts) {
      logger.warn(`Invalid prompt_idx ${idx}, expected 0-${numPrompts - 1}`);
      continue;
    }

    metrics[idx] = {
      score: row.total_score || 0,
      testPassCount: row.pass_count || 0,
      testFailCount: row.fail_count || 0,
      testErrorCount: row.error_count || 0,
      totalLatencyMs: row.total_latency || 0,
      cost: row.total_cost || 0,
      tokenUsage: getFilteredTokenUsage(row),
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
      assertPassCount: 0,
      assertFailCount: 0,
    };
  }

  // ===== QUERY 2: Named scores (SQL JSON aggregation) =====
  await aggregateNamedScores(metrics, whereSql);

  // ===== QUERY 3: Assertion counts (SQL JSON aggregation) =====
  await aggregateAssertions(metrics, whereSql);

  logger.debug('Filtered metrics calculated', {
    numPrompts,
    metricsCount: basicResults.length,
  });

  return metrics;
}

/**
 * Aggregate named scores using SQL json_each().
 * This is MUCH more efficient than fetching all results and parsing in JavaScript.
 *
 * SECURITY: Uses parameterized SQL query via Drizzle's sql template strings.
 *
 * Uses SQLite's json_each() to parse JSON in the database, avoiding the need
 * to fetch potentially thousands of rows into memory.
 */
async function aggregateNamedScores(
  metrics: PromptMetrics[],
  whereSql: SQL<unknown>,
): Promise<void> {
  const db = await getDb();

  // Use SQLite's json_each to parse JSON in database. When newer results include
  // grading_result.namedScoreWeights, row-level named scores are weighted averages, so we
  // multiply them back into weighted totals before aggregating prompt metrics.
  const query = sql`
    SELECT
      prompt_idx,
      score_entries.key as metric_name,
      SUM(
        CASE
          WHEN weight_entries.value IS NOT NULL THEN
            CAST(score_entries.value AS REAL) * CAST(weight_entries.value AS REAL)
          ELSE CAST(score_entries.value AS REAL)
        END
      ) as metric_sum,
      COUNT(*) as metric_count,
      SUM(
        CASE
          WHEN weight_entries.value IS NOT NULL THEN CAST(weight_entries.value AS REAL)
          ELSE 1
        END
      ) as metric_weight_total
    FROM eval_results
    JOIN json_each(eval_results.named_scores) as score_entries
    LEFT JOIN json_each(
      CASE
        WHEN grading_result IS NOT NULL
          AND json_valid(grading_result)
          AND json_type(json_extract(grading_result, '$.namedScoreWeights')) = 'object'
        THEN json_extract(grading_result, '$.namedScoreWeights')
        ELSE json('{}')
      END
    ) as weight_entries
      ON weight_entries.key = score_entries.key
    WHERE ${whereSql}
      AND named_scores IS NOT NULL
      AND json_valid(named_scores)
    GROUP BY prompt_idx, score_entries.key
  `;

  const results = (await db.all(query)) as Array<{
    prompt_idx: number;
    metric_name: string;
    metric_sum: number;
    metric_count: number;
    metric_weight_total: number;
  }>;

  // Populate named scores
  for (const row of results) {
    const idx = row.prompt_idx;
    if (idx >= 0 && idx < metrics.length && metrics[idx]) {
      metrics[idx].namedScores[row.metric_name] = row.metric_sum;
      metrics[idx].namedScoresCount[row.metric_name] = row.metric_count;
      metrics[idx].namedScoreWeights ||= {};
      metrics[idx].namedScoreWeights[row.metric_name] = row.metric_weight_total;
    }
  }
}

/**
 * Aggregate assertion counts using SQL json_each().
 * This requires nested JSON extraction for componentResults.
 *
 * SECURITY: Uses parameterized SQL query via Drizzle's sql template strings.
 *
 * The grading_result structure is:
 * {
 *   "componentResults": [
 *     {"pass": true, "assertion": {...}},
 *     {"pass": false, "assertion": {...}}
 *   ]
 * }
 *
 * We need to count pass=true vs pass=false across all results.
 */
async function aggregateAssertions(
  metrics: PromptMetrics[],
  whereSql: SQL<unknown>,
): Promise<void> {
  const db = await getDb();

  // SQLite query to count assertions from nested JSON
  // This is complex but avoids fetching all results into memory
  const query = sql`
    SELECT
      prompt_idx,
      SUM(
        CASE
          WHEN json_valid(grading_result) AND json_type(json_extract(grading_result, '$.componentResults')) = 'array' THEN
            (
              SELECT COUNT(*)
              FROM json_each(json_extract(grading_result, '$.componentResults'))
              WHERE CAST(json_extract(json_each.value, '$.pass') AS INTEGER) = 1
            )
          ELSE 0
        END
      ) as assert_pass_count,
      SUM(
        CASE
          WHEN json_valid(grading_result) AND json_type(json_extract(grading_result, '$.componentResults')) = 'array' THEN
            (
              SELECT COUNT(*)
              FROM json_each(json_extract(grading_result, '$.componentResults'))
              WHERE CAST(json_extract(json_each.value, '$.pass') AS INTEGER) = 0
            )
          ELSE 0
        END
      ) as assert_fail_count
    FROM eval_results
    WHERE ${whereSql}
      AND grading_result IS NOT NULL
    GROUP BY prompt_idx
  `;

  const results = (await db.all(query)) as Array<{
    prompt_idx: number;
    assert_pass_count: number;
    assert_fail_count: number;
  }>;

  // Populate assertion counts
  for (const row of results) {
    const idx = row.prompt_idx;
    if (idx >= 0 && idx < metrics.length && metrics[idx]) {
      metrics[idx].assertPassCount = row.assert_pass_count || 0;
      metrics[idx].assertFailCount = row.assert_fail_count || 0;
    }
  }
}

/**
 * Create empty metrics array initialized with zeros.
 * Used as fallback when calculation fails or no results found.
 */
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
