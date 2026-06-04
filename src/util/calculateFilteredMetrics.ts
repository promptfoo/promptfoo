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
 * 2. SQL JSON aggregation for weighted named scores
 * 3. Bounded fallback batches for legacy named scores without stored weights
 * 4. SQL JSON aggregation for assertions (complex nested JSON)
 * 5. OOM protection with MAX_RESULTS_FOR_METRICS limit
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
const NAMED_SCORE_FALLBACK_BATCH_SIZE = 5000;
const AMBIGUOUS_NAMED_SCORE_BATCH_SIZE = 500;

/**
 * Calculates metrics for filtered results using optimized SQL aggregation.
 * Uses a SINGLE GROUP BY query to aggregate all prompts at once.
 *
 * SECURITY: Uses parameterized SQL queries via Drizzle's sql template strings.
 * The whereSql parameter is a SQL fragment, not a raw string, ensuring all
 * user-provided values are properly escaped.
 *
 * This is the core performance optimization - instead of making 2-3 queries
 * per prompt (which would be 30 queries for 10 prompts), we make seven baseline
 * queries plus bounded fallback pages when matching rows exist:
 * 1. Count check (OOM protection)
 * 2. Basic metrics + token usage (GROUP BY prompt_idx)
 * 3. Weighted named scores (GROUP BY prompt_idx, metric_name)
 * 4. Ambiguous named-score JSON fallback probe/pages
 * 5. Legacy unweighted named-score fallback probe/pages
 * 6. Assertions (GROUP BY prompt_idx)
 * 7. Ambiguous assertion JSON fallback probe/pages
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
 * Safe JSON objects for named-score aggregation.
 *
 * Every json_each() input uses these expressions so malformed imported JSON
 * cannot fail before SQLite applies a json_valid() filter.
 */
const namedScoresJson = sql`
  CASE
    WHEN named_scores IS NOT NULL
      AND json_valid(named_scores)
      AND json_type(named_scores) = 'object'
    THEN named_scores
    ELSE json('{}')
  END
`;

const gradingResultJson = sql`
  CASE
    WHEN grading_result IS NOT NULL
      AND json_valid(grading_result)
      AND json_type(grading_result) = 'object'
    THEN grading_result
    ELSE json('{}')
  END
`;

const namedScoreWeightsJson = sql`
  CASE
    WHEN json_type(${gradingResultJson}, '$.namedScoreWeights') = 'object'
    THEN json_extract(${gradingResultJson}, '$.namedScoreWeights')
    ELSE json('{}')
  END
`;

const testCaseJson = sql`
  CASE
    WHEN test_case IS NOT NULL
      AND json_valid(test_case)
      AND json_type(test_case) = 'object'
    THEN test_case
    ELSE json('{}')
  END
`;

const componentResultsJson = sql`
  CASE
    WHEN json_type(${gradingResultJson}, '$.componentResults') = 'array'
    THEN json_extract(${gradingResultJson}, '$.componentResults')
    ELSE json('[]')
  END
`;

const componentMetricTemplatesJson = sql`
  (
    SELECT json_group_array(
      CASE
        WHEN component_entries.type = 'object'
        THEN json_extract(component_entries.value, '$.assertion.metric')
        ELSE NULL
      END
    )
    FROM json_each(${componentResultsJson}) as component_entries
  )
`;

const testVarsJson = sql`
  CASE
    WHEN json_type(${testCaseJson}, '$.vars') = 'object'
    THEN json_extract(${testCaseJson}, '$.vars')
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

const validNamedScoreSql = sql`
  score_entries.type IN ('integer', 'real')
  AND CAST(score_entries.value AS REAL)
    BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308
`;

const hasDuplicateNamedScoreKeysSql = sql`
  EXISTS (
    SELECT 1
    FROM json_each(${namedScoresJson}) as duplicate_score_entries
    GROUP BY duplicate_score_entries.key
    HAVING COUNT(*) > 1
  )
`;

const hasDuplicateNamedScoreWeightsPropertySql = sql`
  EXISTS (
    SELECT 1
    FROM json_each(${gradingResultJson}) as grading_result_entries
    WHERE grading_result_entries.key = 'namedScoreWeights'
    GROUP BY grading_result_entries.key
    HAVING COUNT(*) > 1
  )
`;

const hasDuplicateNamedScoreWeightKeysSql = sql`
  EXISTS (
    SELECT 1
    FROM json_each(${namedScoreWeightsJson}) as duplicate_weight_entries
    GROUP BY duplicate_weight_entries.key
    HAVING COUNT(*) > 1
  )
`;

const hasDuplicateComponentResultsPropertySql = sql`
  EXISTS (
    SELECT 1
    FROM json_each(${gradingResultJson}) as grading_result_entries
    WHERE grading_result_entries.key = 'componentResults'
    GROUP BY grading_result_entries.key
    HAVING COUNT(*) > 1
  )
`;

const hasDuplicateComponentMetricPropertySql = sql`
  EXISTS (
    SELECT 1
    FROM json_each(${componentResultsJson}) as component_entries
    WHERE component_entries.type = 'object'
      AND (
        (
          SELECT COUNT(*)
          FROM json_each(component_entries.value) as component_properties
          WHERE component_properties.key = 'assertion'
        ) > 1
        OR (
          SELECT COUNT(*)
          FROM json_each(
            CASE
              WHEN json_type(component_entries.value, '$.assertion') = 'object'
              THEN json_extract(component_entries.value, '$.assertion')
              ELSE json('{}')
            END
          ) as assertion_properties
          WHERE assertion_properties.key = 'metric'
        ) > 1
      )
  )
`;

const hasDuplicateComponentPassPropertySql = sql`
  EXISTS (
    SELECT 1
    FROM json_each(${componentResultsJson}) as component_entries
    WHERE component_entries.type = 'object'
      AND (
        SELECT COUNT(*)
        FROM json_each(component_entries.value) as component_properties
        WHERE component_properties.key = 'pass'
      ) > 1
  )
`;

const hasDuplicateTestVarsPropertySql = sql`
  EXISTS (
    SELECT 1
    FROM json_each(${testCaseJson}) as test_case_entries
    WHERE test_case_entries.key = 'vars'
    GROUP BY test_case_entries.key
    HAVING COUNT(*) > 1
  )
`;

const hasAmbiguousNamedScoreJsonSql = sql`
  ${hasDuplicateNamedScoreKeysSql}
  OR ${hasDuplicateNamedScoreWeightsPropertySql}
  OR ${hasDuplicateNamedScoreWeightKeysSql}
  OR ${hasDuplicateComponentResultsPropertySql}
  OR ${hasDuplicateComponentMetricPropertySql}
  OR ${hasDuplicateTestVarsPropertySql}
`;

const hasAmbiguousAssertionJsonSql = sql`
  ${hasDuplicateComponentResultsPropertySql}
  OR ${hasDuplicateComponentPassPropertySql}
`;

/**
 * Aggregate named scores using SQL json_each().
 * This is much more efficient than fetching ordinary weighted results and parsing
 * them in JavaScript. Legacy and ambiguous rows are processed in bounded batches.
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
    JOIN json_each(${namedScoresJson}) as score_entries
    JOIN json_each(${namedScoreWeightsJson}) as weight_entries
      ON weight_entries.key = score_entries.key
      AND ${validNamedScoreWeightSql}
    WHERE ${whereSql}
      AND named_scores IS NOT NULL
      AND ${validNamedScoreSql}
      AND NOT (${hasAmbiguousNamedScoreJsonSql})
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
      setOwnMetricValue(metrics[idx].namedScores, row.metric_name, row.metric_sum);
      setOwnMetricValue(metrics[idx].namedScoresCount, row.metric_name, row.metric_count);
      metrics[idx].namedScoreWeights ||= {};
      setOwnMetricValue(metrics[idx].namedScoreWeights, row.metric_name, row.metric_weight_total);
    }
  }

  await aggregateFallbackNamedScores(metrics, whereSql);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
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

function parseJsonArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isValidNamedScoreWeight(weight: unknown): weight is number {
  return typeof weight === 'number' && Number.isFinite(weight);
}

function getValidNamedScoreWeight(
  gradingResult: GradingResult | undefined,
  metricName: string,
): number | undefined {
  const namedScoreWeights = gradingResult?.namedScoreWeights;
  if (!Object.prototype.hasOwnProperty.call(namedScoreWeights ?? {}, metricName)) {
    return undefined;
  }
  const weight = namedScoreWeights?.[metricName];
  return isValidNamedScoreWeight(weight) ? weight : undefined;
}

function parseGradingResultForNamedMetrics(value: unknown): GradingResult | undefined {
  const gradingResult = parseJsonObject(value);
  if (!gradingResult) {
    return undefined;
  }

  const rawWeights = isRecord(gradingResult.namedScoreWeights)
    ? gradingResult.namedScoreWeights
    : undefined;
  const validWeights = rawWeights
    ? Object.fromEntries(
        Object.entries(rawWeights).filter((entry): entry is [string, number] =>
          isValidNamedScoreWeight(entry[1]),
        ),
      )
    : undefined;
  const componentResults = Array.isArray(gradingResult.componentResults)
    ? (gradingResult.componentResults.filter(isRecord) as unknown as GradingResult[])
    : undefined;

  return {
    pass: false,
    score: 0,
    reason: '',
    componentResults,
    namedScoreWeights: validWeights,
  };
}

function createCompactGradingResultForNamedMetrics(
  namedScoreWeightsValue: unknown,
  componentMetricTemplatesValue: unknown,
): GradingResult {
  const rawWeights = parseJsonObject(namedScoreWeightsValue);
  const validWeights = rawWeights
    ? Object.fromEntries(
        Object.entries(rawWeights).filter((entry): entry is [string, number] =>
          isValidNamedScoreWeight(entry[1]),
        ),
      )
    : undefined;
  const componentResults = (parseJsonArray(componentMetricTemplatesValue) ?? [])
    .filter((metric): metric is string => typeof metric === 'string')
    .map((metric) => ({ assertion: { metric } }) as GradingResult);

  return {
    pass: false,
    score: 0,
    reason: '',
    componentResults,
    namedScoreWeights: validWeights,
  };
}

function setOwnMetricValue(
  record: Record<string, number>,
  metricName: string,
  value: number,
): void {
  Object.defineProperty(record, metricName, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function addOwnMetricValue(
  record: Record<string, number>,
  metricName: string,
  delta: number,
): void {
  const currentValue = Object.prototype.hasOwnProperty.call(record, metricName)
    ? record[metricName]
    : 0;
  setOwnMetricValue(record, metricName, currentValue + delta);
}

interface FallbackNamedScoreRow {
  id: string;
  prompt_idx: number;
  named_scores: unknown;
  grading_result?: unknown;
  test_case?: unknown;
  named_score_weights?: unknown;
  component_metric_templates?: unknown;
  test_vars: unknown;
}

function aggregateFallbackNamedScoreRow(
  metrics: PromptMetrics[],
  row: FallbackNamedScoreRow,
  aggregateAllMetrics: boolean,
): void {
  const idx = row.prompt_idx;
  if (idx < 0 || idx >= metrics.length || !metrics[idx]) {
    return;
  }

  const namedScores = parseJsonObject(row.named_scores);
  if (!namedScores) {
    return;
  }

  const gradingResult = aggregateAllMetrics
    ? parseGradingResultForNamedMetrics(row.grading_result)
    : createCompactGradingResultForNamedMetrics(
        row.named_score_weights,
        row.component_metric_templates,
      );
  const testVars = aggregateAllMetrics
    ? ((parseJsonObject(row.test_case)?.vars as Vars | undefined) ?? {})
    : ((parseJsonObject(row.test_vars) ?? {}) as Vars);

  for (const [metricName, metricValue] of Object.entries(namedScores)) {
    if (typeof metricValue !== 'number' || !Number.isFinite(metricValue)) {
      continue;
    }

    const metricWeight = getValidNamedScoreWeight(gradingResult, metricName);
    if (metricWeight !== undefined) {
      if (aggregateAllMetrics) {
        addOwnMetricValue(metrics[idx].namedScores, metricName, metricValue * metricWeight);
        addOwnMetricValue(metrics[idx].namedScoresCount, metricName, 1);
        metrics[idx].namedScoreWeights ||= {};
        addOwnMetricValue(metrics[idx].namedScoreWeights, metricName, metricWeight);
      }
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

async function aggregateFallbackNamedScores(
  metrics: PromptMetrics[],
  whereSql: SQL<unknown>,
): Promise<void> {
  await aggregateAmbiguousNamedScores(metrics, whereSql);
  await aggregateUnweightedNamedScores(metrics, whereSql);
}

async function aggregateAmbiguousNamedScores(
  metrics: PromptMetrics[],
  whereSql: SQL<unknown>,
): Promise<void> {
  const db = await getDb();
  let lastResultId: string | undefined;

  while (true) {
    const cursorSql =
      lastResultId === undefined ? sql`` : sql`AND eval_results.id > ${lastResultId}`;
    const query = sql`
      SELECT
        id,
        prompt_idx,
        named_scores,
        grading_result,
        test_case,
        NULL as test_vars
      FROM eval_results
      WHERE ${whereSql}
        ${cursorSql}
        AND named_scores IS NOT NULL
        AND (${hasAmbiguousNamedScoreJsonSql})
      ORDER BY eval_results.id
      LIMIT ${AMBIGUOUS_NAMED_SCORE_BATCH_SIZE}
    `;

    const results = (await db.all(query)) as FallbackNamedScoreRow[];

    if (results.length === 0) {
      break;
    }

    for (const row of results) {
      aggregateFallbackNamedScoreRow(metrics, row, true);
    }

    lastResultId = results[results.length - 1]?.id;
    if (lastResultId === undefined || results.length < AMBIGUOUS_NAMED_SCORE_BATCH_SIZE) {
      break;
    }
  }
}

async function aggregateUnweightedNamedScores(
  metrics: PromptMetrics[],
  whereSql: SQL<unknown>,
): Promise<void> {
  const db = await getDb();
  let lastResultId: string | undefined;

  while (true) {
    const cursorSql =
      lastResultId === undefined ? sql`` : sql`AND eval_results.id > ${lastResultId}`;
    const query = sql`
      SELECT
        id,
        prompt_idx,
        named_scores,
        ${namedScoreWeightsJson} as named_score_weights,
        ${componentMetricTemplatesJson} as component_metric_templates,
        ${testVarsJson} as test_vars
      FROM eval_results
      WHERE ${whereSql}
        ${cursorSql}
        AND named_scores IS NOT NULL
        AND NOT (${hasAmbiguousNamedScoreJsonSql})
        AND EXISTS (
          SELECT 1
          FROM json_each(${namedScoresJson}) as score_entries
          LEFT JOIN json_each(${namedScoreWeightsJson}) as weight_entries
            ON weight_entries.key = score_entries.key
          WHERE ${validNamedScoreSql}
            AND (
              weight_entries.key IS NULL
              OR NOT (${validNamedScoreWeightSql})
            )
        )
      ORDER BY eval_results.id
      LIMIT ${NAMED_SCORE_FALLBACK_BATCH_SIZE}
    `;

    const results = (await db.all(query)) as FallbackNamedScoreRow[];

    if (results.length === 0) {
      break;
    }

    for (const row of results) {
      aggregateFallbackNamedScoreRow(metrics, row, false);
    }

    lastResultId = results[results.length - 1]?.id;
    if (lastResultId === undefined || results.length < NAMED_SCORE_FALLBACK_BATCH_SIZE) {
      break;
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

  // Count ordinary rows in SQLite. Rows with duplicate JSON properties are
  // excluded so they can use JSON.parse's last-key-wins semantics below.
  const query = sql`
    SELECT
      prompt_idx,
      SUM(
        (
          SELECT COUNT(*)
          FROM json_each(${componentResultsJson}) as component_entries
          WHERE component_entries.type = 'object'
            AND CAST(json_extract(component_entries.value, '$.pass') AS INTEGER) = 1
        )
      ) as assert_pass_count,
      SUM(
        (
          SELECT COUNT(*)
          FROM json_each(${componentResultsJson}) as component_entries
          WHERE component_entries.type = 'object'
            AND CAST(json_extract(component_entries.value, '$.pass') AS INTEGER) = 0
        )
      ) as assert_fail_count
    FROM eval_results
    WHERE ${whereSql}
      AND grading_result IS NOT NULL
      AND NOT (${hasAmbiguousAssertionJsonSql})
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

  await aggregateAmbiguousAssertions(metrics, whereSql);
}

interface AmbiguousAssertionRow {
  id: string;
  prompt_idx: number;
  grading_result: unknown;
}

function aggregateAmbiguousAssertionRow(
  metrics: PromptMetrics[],
  row: AmbiguousAssertionRow,
): void {
  const idx = row.prompt_idx;
  if (idx < 0 || idx >= metrics.length || !metrics[idx]) {
    return;
  }

  const gradingResult = parseJsonObject(row.grading_result);
  const componentResults = Array.isArray(gradingResult?.componentResults)
    ? gradingResult.componentResults
    : [];

  for (const componentResult of componentResults) {
    if (!isRecord(componentResult)) {
      continue;
    }
    if (componentResult.pass === true) {
      metrics[idx].assertPassCount++;
    } else if (componentResult.pass === false) {
      metrics[idx].assertFailCount++;
    }
  }
}

async function aggregateAmbiguousAssertions(
  metrics: PromptMetrics[],
  whereSql: SQL<unknown>,
): Promise<void> {
  const db = await getDb();
  let lastResultId: string | undefined;

  while (true) {
    const cursorSql =
      lastResultId === undefined ? sql`` : sql`AND eval_results.id > ${lastResultId}`;
    const query = sql`
      SELECT id, prompt_idx, grading_result
      FROM eval_results
      WHERE ${whereSql}
        ${cursorSql}
        AND grading_result IS NOT NULL
        AND (${hasAmbiguousAssertionJsonSql})
      ORDER BY eval_results.id
      LIMIT ${AMBIGUOUS_NAMED_SCORE_BATCH_SIZE}
    `;

    const results = (await db.all(query)) as AmbiguousAssertionRow[];
    if (results.length === 0) {
      break;
    }

    for (const row of results) {
      aggregateAmbiguousAssertionRow(metrics, row);
    }

    lastResultId = results[results.length - 1]?.id;
    if (lastResultId === undefined || results.length < AMBIGUOUS_NAMED_SCORE_BATCH_SIZE) {
      break;
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
