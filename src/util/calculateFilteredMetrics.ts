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
import { accumulateNamedMetric } from './namedMetrics';

import type { GradingResult, PromptMetrics, Vars } from '../types/index';

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

  const basicResults = (await db.all(basicMetricsQuery)) as Array<{
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
  }>;

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
      tokenUsage: {
        total: row.total_tokens || 0,
        prompt: row.prompt_tokens || 0,
        completion: row.completion_tokens || 0,
        cached: row.cached_tokens || 0,
        numRequests: row.num_requests_with_tokens || 0,
      },
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
 * SQL expression yielding a result's `grading_result.namedScoreWeights` object,
 * or an empty object when it is missing or malformed.
 *
 * Shared by the weighted SQL fast path and the unweighted JS fallback selector
 * so both define the weighted/unweighted partition boundary identically.
 */
const namedScoreWeightsJson = sql`
  CASE
    WHEN grading_result IS NOT NULL
      AND json_valid(grading_result)
      AND json_type(json_extract(grading_result, '$.namedScoreWeights')) = 'object'
    THEN json_extract(grading_result, '$.namedScoreWeights')
    ELSE json('{}')
  END
`;

// Keep the SQL fast path aligned with Number.isFinite() in the JavaScript fallback.
// SQLite classifies valid JSON overflow literals such as 1e999 as REAL Infinity.
const validNamedScoreWeightSql = sql`
  weight_entries.type IN ('integer', 'real')
  AND CAST(weight_entries.value AS REAL)
    BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308
`;

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
  //
  // Entries without stored weights need the same assertion-count fallback as
  // accumulateNamedMetric(), including template-rendered metric names, so those
  // rows are handled in JavaScript below.
  const query = sql`
    SELECT
      prompt_idx,
      score_entries.key as metric_name,
      SUM(CAST(score_entries.value AS REAL) * CAST(weight_entries.value AS REAL)) as metric_sum,
      COUNT(*) as metric_count,
      SUM(CAST(weight_entries.value AS REAL)) as metric_weight_total
    FROM eval_results
    JOIN json_each(eval_results.named_scores) as score_entries
    JOIN json_each(${namedScoreWeightsJson}) as weight_entries
      ON weight_entries.key = score_entries.key
      AND ${validNamedScoreWeightSql}
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

  await aggregateUnweightedNamedScores(metrics, whereSql);
}

function parseJsonObject<T extends object>(value: unknown): T | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'object') {
    return value as T;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

function isValidNamedScoreWeight(weight: unknown): weight is number {
  return typeof weight === 'number' && Number.isFinite(weight);
}

function hasValidNamedScoreWeight(
  gradingResult: GradingResult | undefined,
  metricName: string,
): boolean {
  return isValidNamedScoreWeight(gradingResult?.namedScoreWeights?.[metricName]);
}

function withOnlyValidNamedScoreWeights(
  gradingResult: GradingResult | undefined,
): GradingResult | undefined {
  if (!gradingResult?.namedScoreWeights) {
    return gradingResult;
  }

  const validWeights = Object.fromEntries(
    Object.entries(gradingResult.namedScoreWeights).filter(([, weight]) =>
      isValidNamedScoreWeight(weight),
    ),
  );

  return {
    ...gradingResult,
    namedScoreWeights: validWeights,
  };
}

async function aggregateUnweightedNamedScores(
  metrics: PromptMetrics[],
  whereSql: SQL<unknown>,
): Promise<void> {
  const db = getDb();

  const query = sql`
    SELECT
      prompt_idx,
      named_scores,
      grading_result,
      test_case
    FROM eval_results
    WHERE ${whereSql}
      AND named_scores IS NOT NULL
      AND json_valid(named_scores)
      AND EXISTS (
        SELECT 1
        FROM json_each(eval_results.named_scores) as score_entries
        LEFT JOIN json_each(${namedScoreWeightsJson}) as weight_entries
          ON weight_entries.key = score_entries.key
        WHERE weight_entries.key IS NULL
          OR NOT (${validNamedScoreWeightSql})
      )
  `;

  const results = (await db.all(query)) as Array<{
    prompt_idx: number;
    named_scores: unknown;
    grading_result: unknown;
    test_case: unknown;
  }>;

  for (const row of results) {
    const idx = row.prompt_idx;
    if (idx < 0 || idx >= metrics.length || !metrics[idx]) {
      continue;
    }

    const namedScores = parseJsonObject<Record<string, unknown>>(row.named_scores);
    if (!namedScores) {
      continue;
    }

    const gradingResult = parseJsonObject<GradingResult>(row.grading_result);
    const gradingResultWithValidWeights = withOnlyValidNamedScoreWeights(gradingResult);
    const testCase = parseJsonObject<{ vars?: Vars }>(row.test_case);

    for (const [metricName, metricValue] of Object.entries(namedScores)) {
      if (
        typeof metricValue !== 'number' ||
        !Number.isFinite(metricValue) ||
        hasValidNamedScoreWeight(gradingResult, metricName)
      ) {
        continue;
      }

      accumulateNamedMetric(metrics[idx], {
        metricName,
        metricValue,
        gradingResult: gradingResultWithValidWeights,
        testVars: testCase?.vars || {},
      });
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
