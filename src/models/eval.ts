import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { DEFAULT_QUERY_LIMIT, HUMAN_ASSERTION_TYPE } from '../constants';
import { getDb } from '../database/index';
import { updateSignalFile } from '../database/signal';
import {
  datasetsTable,
  evalResultsTable,
  evalsTable,
  evalsToDatasetsTable,
  evalsToPromptsTable,
  evalsToTagsTable,
  promptsTable,
  tagsTable,
} from '../database/tables';
import { getEnvBool } from '../envars';
import { getUserEmail } from '../globalConfig/accounts';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import { PLUGIN_CATEGORIES } from '../redteam/constants';
import { calculateAttackSuccessRate } from '../redteam/metrics';
import { getRiskCategorySeverityMap } from '../redteam/sharedFrontend';
import { getTraceStore } from '../tracing/store';
import {
  type CompletedPrompt,
  type EvalSummary,
  type EvaluateResult,
  type EvaluateStats,
  type EvaluateSummaryV2,
  type EvaluateSummaryV3,
  type EvaluateTable,
  type EvaluateTableRow,
  type Prompt,
  ResultFailureReason,
  type ResultsFile,
  type UnifiedConfig,
} from '../types/index';
import { calculateFilteredMetrics } from '../util/calculateFilteredMetrics';
import { convertResultsToTable } from '../util/convertEvalResultsToTable';
import { randomSequence, sha256 } from '../util/createHash';
import { convertTestResultsToTableRow } from '../util/exportToFile/index';
import invariant from '../util/invariant';
import { getCurrentTimestamp } from '../util/time';
import { accumulateTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';
import {
  getCachedResultsCount,
  getTotalResultRowCount,
  queryTestIndicesOptimized,
} from './evalPerformance';
import EvalResult from './evalResult';

import type { EvalResultsFilterMode, TraceData } from '../types/index';

/**
 * Database query result type interfaces
 * These types ensure type safety for raw SQL queries that don't use Drizzle's query builder
 */

/** Result from COUNT queries using db.get() - count may be null if query fails */
interface FilteredCountRow {
  count: number | null;
}

/** Result from queries selecting test_idx column */
interface TestIndexRow {
  test_idx: number;
}

/** Result from queries selecting distinct metadata or variable keys */
interface MetadataKeyResult {
  key: string;
}

/**
 * Sanitizes runtime options to ensure only JSON-serializable data is persisted.
 * Removes non-serializable fields like AbortSignal, functions, and symbols.
 */
function sanitizeRuntimeOptions(
  options?: Partial<import('../types').EvaluateOptions>,
): Partial<import('../types').EvaluateOptions> | undefined {
  if (!options) {
    return undefined;
  }

  // Create a deep copy to avoid mutating the original
  const sanitized = { ...options };

  // Remove known non-serializable fields
  delete sanitized.abortSignal;

  // Remove any function or symbol values
  for (const key in sanitized) {
    // biome-ignore lint/suspicious/noExplicitAny: FIXME this should use Object.keys or something to keep it type safe
    const value = (sanitized as any)[key];
    if (typeof value === 'function' || typeof value === 'symbol') {
      // biome-ignore lint/suspicious/noExplicitAny: FIXME this should use Object.keys or something to keep it type safe
      delete (sanitized as any)[key];
    }
  }

  return sanitized;
}

export function createEvalId(createdAt: Date = new Date()) {
  return `eval-${randomSequence(3)}-${createdAt.toISOString().slice(0, 19)}`;
}

/** Result from queries extracting variable keys with eval IDs */
export interface VarKeyWithEvalIdResult {
  key: string;
  eval_id: string;
}

/** Result from queries extracting variable keys */
export interface VarKeyResult {
  key: string;
}

/**
 * Escapes a key for use in a JSON path expression.
 * Handles backslashes and double quotes which have special meaning in JSON paths.
 */
export function escapeJsonPathKey(key: string): string {
  return key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Builds a safe JSON path for use in SQLite json_extract() queries.
 *
 * SECURITY NOTE: This function uses sql.raw() which is normally unsafe, but is REQUIRED here
 * because SQLite's json_extract() function only accepts JSON paths as string literals,
 * not as parameterized values.
 *
 * Safety is ensured through double escaping:
 * 1. JSON path characters are escaped (backslashes and double quotes)
 * 2. SQL single quotes are escaped using standard SQL escaping ('' for ')
 *
 * @param field - The JSON field name from user input
 * @returns A sql.raw() fragment containing the safely escaped JSON path
 */
export function buildSafeJsonPath(field: string): ReturnType<typeof sql.raw> {
  const jsonPathContent = `$."${escapeJsonPathKey(field)}"`;
  // Escape single quotes for SQL string literal (standard SQL escaping)
  const sqlSafeJsonPath = jsonPathContent.replace(/'/g, "''");
  // sql.raw() is safe here because we've fully escaped the content
  return sql.raw(`'${sqlSafeJsonPath}'`);
}

/**
 * Represents a filter condition with its associated logic operator.
 */
export interface FilterConditionWithOperator {
  condition: SQL<unknown>;
  logicOperator: string;
}

/**
 * Combines multiple filter conditions using their associated logic operators (AND/OR).
 *
 * @param filterConditions - Array of conditions with their logic operators
 * @returns A single SQL fragment combining all conditions, or null if empty
 */
export function combineFilterConditions(
  filterConditions: FilterConditionWithOperator[],
): SQL<unknown> | null {
  if (filterConditions.length === 0) {
    return null;
  }

  if (filterConditions.length === 1) {
    return filterConditions[0].condition;
  }

  return filterConditions.reduce((acc, { condition: cond, logicOperator }, idx) => {
    if (idx === 0) {
      return cond;
    }
    return logicOperator === 'OR' ? sql`${acc} OR ${cond}` : sql`${acc} AND ${cond}`;
  }, filterConditions[0].condition);
}

export class EvalQueries {
  static async getVarsFromEvals(evals: Eval[]) {
    const db = getDb();

    // Handle empty array case to avoid SQL syntax error
    if (evals.length === 0) {
      return {};
    }

    const evalIds = evals.map((e) => e.id);

    // Use parameterized query to prevent SQL injection
    const query = sql`
      SELECT DISTINCT j.key, eval_id
      FROM (
        SELECT eval_id, json_extract(eval_results.test_case, '$.vars') as vars
        FROM eval_results
        WHERE eval_id IN (${sql.join(evalIds, sql`, `)})
      ) t, json_each(t.vars) j
    `;

    const results = await db.all<VarKeyWithEvalIdResult>(query);
    const vars = results.reduce((acc: Record<string, string[]>, r) => {
      acc[r.eval_id] = acc[r.eval_id] || [];
      acc[r.eval_id].push(r.key);
      return acc;
    }, {});
    return vars;
  }

  static async getVarsFromEval(evalId: string) {
    const db = getDb();

    // Use parameterized query to prevent SQL injection
    const query = sql`
      SELECT DISTINCT j.key
      FROM (
        SELECT json_extract(eval_results.test_case, '$.vars') as vars
        FROM eval_results
        WHERE eval_results.eval_id = ${evalId}
      ) t, json_each(t.vars) j
    `;

    const results = await db.all<VarKeyResult>(query);
    const vars = results.map((r) => r.key);

    return vars;
  }

  static async setVars(evalId: string, vars: string[]) {
    const db = getDb();
    try {
      db.update(evalsTable).set({ vars }).where(eq(evalsTable.id, evalId)).run();
    } catch (e) {
      logger.error(`Error setting vars: ${vars} for eval ${evalId}: ${e}`);
    }
  }

  static async getMetadataKeysFromEval(
    evalId: string,
    comparisonEvalIds: string[] = [],
  ): Promise<string[]> {
    const db = getDb();
    try {
      // Combine primary eval ID with comparison eval IDs
      const allEvalIds = [evalId, ...comparisonEvalIds];

      // Use json_valid() to filter out malformed JSON and add LIMIT for DoS protection
      const query = sql`
        SELECT DISTINCT j.key FROM (
          SELECT metadata FROM eval_results
          WHERE eval_id IN (${sql.join(allEvalIds, sql`, `)})
            AND metadata IS NOT NULL
            AND metadata != '{}'
            AND json_valid(metadata)
          LIMIT 10000
        ) t, json_each(t.metadata) j
        ORDER BY j.key
        LIMIT 1000
      `;
      const results = await db.all<MetadataKeyResult>(query);
      return results.map((r) => r.key);
    } catch (error) {
      // Log error but return empty array to prevent breaking the UI
      logger.error(
        `Error fetching metadata keys for eval ${evalId} and comparisons [${comparisonEvalIds.join(', ')}]: ${error}`,
      );
      return [];
    }
  }

  /**
   * Queries all unique metadata values for a given metadata key.
   * @param evalId - The ID of the eval to get the metadata values from.
   * @param key - The key of the metadata to get the values from.
   * @returns An array of unique metadata values.
   */
  static getMetadataValuesFromEval(evalId: string, key: string): string[] {
    const db = getDb();
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return [];
    }

    try {
      const escapedKey = escapeJsonPathKey(trimmedKey);
      const jsonPath = `$."${escapedKey}"`;

      const query = sql`
        SELECT DISTINCT
          json_extract(${evalResultsTable.metadata}, ${jsonPath}) AS value
        FROM ${evalResultsTable}
        WHERE ${evalResultsTable.evalId} = ${evalId}
          AND ${evalResultsTable.metadata} IS NOT NULL
          AND ${evalResultsTable.metadata} != '{}'
          AND json_valid(${evalResultsTable.metadata})
          AND json_extract(${evalResultsTable.metadata}, ${jsonPath}) IS NOT NULL
        ORDER BY value
        LIMIT 1000
      `;

      const rows = db.all<{ value: string }>(query);
      const values = rows
        .map(({ value }) => String(value).trim())
        .filter((value) => value.length > 0);

      return Array.from(new Set(values));
    } catch (error) {
      logger.error(
        `Error fetching metadata values for eval ${evalId} and key ${trimmedKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}

export default class Eval {
  id: string;
  createdAt: number;
  author?: string;
  description?: string;
  config: Partial<UnifiedConfig>;
  // If these are empty, you need to call loadResults(). We don't load them by default to save memory.
  results: EvalResult[];
  datasetId?: string;
  prompts: CompletedPrompt[];
  oldResults?: EvaluateSummaryV2;
  persisted: boolean;
  vars: string[];
  _resultsLoaded: boolean = false;
  runtimeOptions?: Partial<import('../types').EvaluateOptions>;
  _shared: boolean = false;
  durationMs?: number;

  /**
   * The shareable URL for this evaluation, if it has been shared.
   * Set by the evaluate() function when sharing is enabled.
   */
  shareableUrl?: string;

  static async latest() {
    const db = getDb();
    const db_results = await db
      .select({
        id: evalsTable.id,
      })
      .from(evalsTable)
      .orderBy(desc(evalsTable.createdAt))
      .limit(1);

    if (db_results.length === 0) {
      return undefined;
    }

    return await Eval.findById(db_results[0].id);
  }

  static async findById(id: string) {
    const db = getDb();

    const evalData = db.select().from(evalsTable).where(eq(evalsTable.id, id)).all();

    if (evalData.length === 0) {
      return undefined;
    }

    const datasetResults = db
      .select({
        datasetId: evalsToDatasetsTable.datasetId,
      })
      .from(evalsToDatasetsTable)
      .where(eq(evalsToDatasetsTable.evalId, id))
      .limit(1)
      .all();

    const eval_ = evalData[0];
    const datasetId = datasetResults[0]?.datasetId;

    // Extract durationMs from results column (for V4 evals)
    // Validate that it's a finite positive number to guard against corrupted data
    const resultsObj = eval_.results as Record<string, unknown> | undefined;
    const rawDurationMs =
      resultsObj && 'durationMs' in resultsObj ? resultsObj.durationMs : undefined;
    const durationMs =
      typeof rawDurationMs === 'number' && Number.isFinite(rawDurationMs) && rawDurationMs >= 0
        ? rawDurationMs
        : undefined;

    const evalInstance = new Eval(eval_.config, {
      id: eval_.id,
      createdAt: new Date(eval_.createdAt),
      author: eval_.author || undefined,
      description: eval_.description || undefined,
      prompts: eval_.prompts || [],
      datasetId,
      persisted: true,
      vars: eval_.vars || [],
      runtimeOptions: eval_.runtimeOptions ?? undefined,
      durationMs,
    });
    if (eval_.results && 'table' in eval_.results) {
      evalInstance.oldResults = eval_.results as EvaluateSummaryV2;
    }

    // backfill vars
    if (!eval_.vars || eval_.vars.length === 0) {
      const vars = await EvalQueries.getVarsFromEval(id);
      evalInstance.setVars(vars);
      await EvalQueries.setVars(id, vars);
    }

    return evalInstance;
  }

  static async getMany(limit: number = DEFAULT_QUERY_LIMIT): Promise<Eval[]> {
    const db = getDb();
    const evals = await db
      .select()
      .from(evalsTable)
      .limit(limit)
      .orderBy(desc(evalsTable.createdAt))
      .all();
    return evals.map(
      (e) =>
        new Eval(e.config, {
          id: e.id,
          createdAt: new Date(e.createdAt),
          author: e.author || undefined,
          description: e.description || undefined,
          prompts: e.prompts || [],
          persisted: true,
        }),
    );
  }

  /**
   * Get paginated evals with offset support for efficient infinite scroll.
   * @param offset - Number of evals to skip
   * @param limit - Maximum number of evals to return
   */
  static async getPaginated(
    offset: number = 0,
    limit: number = DEFAULT_QUERY_LIMIT,
  ): Promise<Eval[]> {
    const db = getDb();
    const evals = await db
      .select()
      .from(evalsTable)
      .orderBy(desc(evalsTable.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
    return evals.map(
      (e) =>
        new Eval(e.config, {
          id: e.id,
          createdAt: new Date(e.createdAt),
          author: e.author || undefined,
          description: e.description || undefined,
          prompts: e.prompts || [],
          persisted: true,
        }),
    );
  }

  /**
   * Get total count of evals for pagination.
   */
  static async getCount(): Promise<number> {
    const db = getDb();
    const result = await db.select({ count: sql<number>`count(*)` }).from(evalsTable).get();
    return result?.count ?? 0;
  }

  static async create(
    config: Partial<UnifiedConfig>,
    renderedPrompts: Prompt[], // The config doesn't contain the actual prompts, so we need to pass them in separately
    opts?: {
      id?: string;
      createdAt?: Date;
      author?: string;
      // Be wary, this is EvalResult[] and not EvaluateResult[]
      results?: EvalResult[];
      vars?: string[];
      runtimeOptions?: Partial<import('../types').EvaluateOptions>;
      completedPrompts?: CompletedPrompt[];
    },
  ): Promise<Eval> {
    const createdAt = opts?.createdAt || new Date();
    const evalId = opts?.id || createEvalId(createdAt);
    const author = opts?.author || getUserEmail();
    const db = getDb();

    const datasetId = sha256(JSON.stringify(config.tests || []));

    db.transaction(() => {
      db.insert(evalsTable)
        .values({
          id: evalId,
          createdAt: createdAt.getTime(),
          author,
          description: config.description,
          config,
          results: {},
          vars: opts?.vars || [],
          runtimeOptions: sanitizeRuntimeOptions(opts?.runtimeOptions),
          prompts: opts?.completedPrompts || [],
        })
        .run();

      for (const prompt of renderedPrompts) {
        const label = prompt.label || prompt.display || prompt.raw;
        const promptId = hashPrompt(prompt);

        db.insert(promptsTable)
          .values({
            id: promptId,
            prompt: label,
          })
          .onConflictDoNothing()
          .run();

        db.insert(evalsToPromptsTable)
          .values({
            evalId,
            promptId,
          })
          .onConflictDoNothing()
          .run();

        logger.debug(`Inserting prompt ${promptId}`);
      }

      if (opts?.results && opts.results.length > 0) {
        const res = db
          .insert(evalResultsTable)
          .values(opts.results?.map((r) => ({ ...r, evalId, id: crypto.randomUUID() })))
          .run();
        logger.debug(`Inserted ${res.changes} eval results`);
      }

      db.insert(datasetsTable)
        .values({
          id: datasetId,
          tests: config.tests,
        })
        .onConflictDoNothing()
        .run();

      db.insert(evalsToDatasetsTable)
        .values({
          evalId,
          datasetId,
        })
        .onConflictDoNothing()
        .run();

      logger.debug(`Inserting dataset ${datasetId}`);

      if (config.tags) {
        for (const [tagKey, tagValue] of Object.entries(config.tags)) {
          const tagId = sha256(`${tagKey}:${tagValue}`);

          db.insert(tagsTable)
            .values({
              id: tagId,
              name: tagKey,
              value: tagValue,
            })
            .onConflictDoNothing()
            .run();

          db.insert(evalsToTagsTable)
            .values({
              evalId,
              tagId,
            })
            .onConflictDoNothing()
            .run();

          logger.debug(`Inserting tag ${tagId}`);
        }
      }
    });

    return new Eval(config, {
      id: evalId,
      author: opts?.author,
      createdAt,
      persisted: true,
      runtimeOptions: sanitizeRuntimeOptions(opts?.runtimeOptions),
    });
  }

  constructor(
    config: Partial<UnifiedConfig>,
    opts?: {
      id?: string;
      createdAt?: Date;
      author?: string;
      description?: string;
      prompts?: CompletedPrompt[];
      datasetId?: string;
      persisted?: boolean;
      vars?: string[];
      runtimeOptions?: Partial<import('../types').EvaluateOptions>;
      durationMs?: number;
    },
  ) {
    const createdAt = opts?.createdAt || new Date();
    this.createdAt = createdAt.getTime();
    this.id = opts?.id || createEvalId(createdAt);
    this.author = opts?.author;
    this.config = config;
    this.results = [];
    this.prompts = opts?.prompts || [];
    this.datasetId = opts?.datasetId;
    this.persisted = opts?.persisted || false;
    this._resultsLoaded = false;
    this.vars = opts?.vars || [];
    this.runtimeOptions = opts?.runtimeOptions;
    this.durationMs = opts?.durationMs;
  }

  version() {
    /**
     * Version 3 is the denormalized version of where the table and results are stored on the eval object.
     * Version 4 is the normalized version where the results are stored in another databse table and the table for vizualization is generated by the app.
     */
    return this.oldResults && 'table' in this.oldResults ? 3 : 4;
  }

  useOldResults() {
    return this.version() < 4;
  }

  setTable(table: EvaluateTable) {
    invariant(this.version() < 4, 'Eval is not version 3');
    invariant(this.oldResults, 'Old results not found');
    this.oldResults.table = table;
  }

  async save() {
    const db = getDb();
    const updateObj: Record<string, unknown> = {
      config: this.config,
      prompts: this.prompts,
      description: this.config.description,
      author: this.author,
      updatedAt: getCurrentTimestamp(),
      vars: Array.from(this.vars),
      runtimeOptions: sanitizeRuntimeOptions(this.runtimeOptions),
    };

    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      updateObj.results = this.oldResults;
    } else if (this.durationMs !== undefined) {
      // For V4 evals, store durationMs in the results column
      updateObj.results = { durationMs: this.durationMs };
    }
    db.update(evalsTable).set(updateObj).where(eq(evalsTable.id, this.id)).run();
    this.persisted = true;
  }

  setVars(vars: string[]) {
    this.vars = vars;
  }

  addVar(varName: string) {
    this.vars.push(varName);
  }

  setDurationMs(durationMs: number) {
    this.durationMs = durationMs;
  }

  getPrompts() {
    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      return this.oldResults.table?.head.prompts || [];
    }
    return this.prompts;
  }

  async getTable(): Promise<EvaluateTable> {
    if (this.useOldResults()) {
      return this.oldResults?.table || { head: { prompts: [], vars: [] }, body: [] };
    }
    return convertResultsToTable(await this.toResultsFile());
  }

  async addResult(result: EvaluateResult) {
    const newResult = await EvalResult.createFromEvaluateResult(this.id, result, {
      persist: this.persisted,
    });
    if (!this.persisted) {
      // We're only going to keep results in memory if the eval isn't persisted in the database
      // This is to avoid memory issues when running large evaluations
      this.results.push(newResult);
    }
    if (this.persisted) {
      // Notify watchers that new results are available, passing the eval ID
      updateSignalFile(this.id);
    }
  }

  async *fetchResultsBatched(batchSize: number = 100) {
    for await (const batch of EvalResult.findManyByEvalIdBatched(this.id, { batchSize })) {
      yield batch;
    }
  }

  async getResultsCount(): Promise<number> {
    // Returns distinct test count (unique test cases) - used for UI display
    return getCachedResultsCount(this.id);
  }

  /**
   * Get the total count of all result rows for this eval.
   * Use this when iterating over all results (e.g., for sharing progress).
   * This may be higher than getResultsCount() when there are multiple prompts/providers.
   */
  async getTotalResultRowCount(): Promise<number> {
    return getTotalResultRowCount(this.id);
  }

  async fetchResultsByTestIdx(testIdx: number) {
    return await EvalResult.findManyByEvalId(this.id, { testIdx });
  }

  /**
   * CRITICAL: Builds the WHERE SQL clause for filtering results.
   * This is the single source of truth for all filtering logic.
   * Used by both queryTestIndices() (pagination) and getFilteredMetrics().
   *
   * SECURITY: This method uses Drizzle's sql template strings for parameterized queries
   * to prevent SQL injection. All user-provided values are passed as parameters,
   * not interpolated into the SQL string.
   *
   * Any changes to filter logic MUST be made here to ensure consistency
   * between displayed rows and calculated metrics.
   *
   * @returns SQL fragment (without "WHERE" keyword) that can be used in queries
   */
  private buildFilterWhereSql(opts: {
    filterMode?: EvalResultsFilterMode;
    searchQuery?: string;
    filters?: string[];
  }): SQL<unknown> {
    const mode: EvalResultsFilterMode = opts.filterMode ?? 'all';

    // Build filter conditions as SQL fragments
    const conditions: SQL<unknown>[] = [sql`eval_id = ${this.id}`];

    if (mode === 'errors') {
      conditions.push(sql`failure_reason = ${ResultFailureReason.ERROR}`);
    } else if (mode === 'failures') {
      conditions.push(sql`success = 0 AND failure_reason != ${ResultFailureReason.ERROR}`);
    } else if (mode === 'passes') {
      conditions.push(sql`success = 1`);
    } else if (mode === 'highlights') {
      conditions.push(sql`json_extract(grading_result, '$.comment') LIKE ${'!highlight%'}`);
    } else if (mode === 'user-rated') {
      // Check if componentResults array contains an entry with assertion.type = 'human'
      // Uses EXISTS + json_each for accurate JSON querying (avoids false positives from LIKE)
      conditions.push(sql`
        EXISTS (
          SELECT 1
          FROM json_each(grading_result, '$.componentResults')
          WHERE json_extract(value, '$.assertion.type') = ${HUMAN_ASSERTION_TYPE}
        )
      `);
    }

    // Add filters
    if (opts.filters && opts.filters.length > 0) {
      const filterConditions: FilterConditionWithOperator[] = [];

      opts.filters.forEach((filter) => {
        const { logicOperator, type, operator, value, field } = JSON.parse(filter);
        let condition: SQL<unknown> | null = null;

        if (type === 'metric') {
          // For backward compatibility: old filters use 'value' for metric name with 'equals' operator
          // New filters use 'field' for metric name with comparison operators
          const metricKey = field || value;
          if (!metricKey) {
            logger.warn('Invalid metric filter: missing field and value', { filter });
            return;
          }

          const jsonPath = buildSafeJsonPath(metricKey);

          // Value must be a number
          const numericValue = typeof value === 'number' ? value : Number.parseFloat(value);

          if (operator === 'is_defined' || (operator === 'equals' && !field)) {
            // 'is_defined': new operator that checks if metric exists
            // 'equals' without field: old format for backward compatibility
            condition = sql`json_extract(named_scores, ${jsonPath}) IS NOT NULL`;
          }
          // For the numeric operators, validate that the value is a number
          else if (Number.isFinite(numericValue)) {
            if (operator === 'eq') {
              condition = sql`CAST(json_extract(named_scores, ${jsonPath}) AS REAL) = ${numericValue}`;
            } else if (operator === 'neq') {
              condition = sql`(json_extract(named_scores, ${jsonPath}) IS NOT NULL AND CAST(json_extract(named_scores, ${jsonPath}) AS REAL) != ${numericValue})`;
            } else if (operator === 'gt') {
              condition = sql`CAST(json_extract(named_scores, ${jsonPath}) AS REAL) > ${numericValue}`;
            } else if (operator === 'gte') {
              condition = sql`CAST(json_extract(named_scores, ${jsonPath}) AS REAL) >= ${numericValue}`;
            } else if (operator === 'lt') {
              condition = sql`CAST(json_extract(named_scores, ${jsonPath}) AS REAL) < ${numericValue}`;
            } else if (operator === 'lte') {
              condition = sql`CAST(json_extract(named_scores, ${jsonPath}) AS REAL) <= ${numericValue}`;
            }
          } else {
            // Invalid numeric value (NaN, Infinity, etc.)
            logger.warn('Invalid numeric value in metric filter', {
              metricKey,
              value,
              numericValue,
              operator,
            });
            return;
          }
        } else if (type === 'metadata' && field) {
          const jsonPath = buildSafeJsonPath(field);

          if (operator === 'equals') {
            condition = sql`json_extract(metadata, ${jsonPath}) = ${value}`;
          } else if (operator === 'contains') {
            condition = sql`json_extract(metadata, ${jsonPath}) LIKE ${`%${value}%`}`;
          } else if (operator === 'not_contains') {
            condition = sql`(json_extract(metadata, ${jsonPath}) IS NULL OR json_extract(metadata, ${jsonPath}) NOT LIKE ${`%${value}%`})`;
          } else if (operator === 'exists') {
            // For exists, check if the field is present AND not empty
            condition = sql`LENGTH(TRIM(COALESCE(json_extract(metadata, ${jsonPath}), ''))) > 0`;
          }
        } else if (type === 'plugin') {
          const isCategory = Object.keys(PLUGIN_CATEGORIES).includes(value);

          if (operator === 'equals') {
            if (isCategory) {
              condition = sql`json_extract(metadata, '$.pluginId') LIKE ${`${value}:%`}`;
            } else {
              condition = sql`json_extract(metadata, '$.pluginId') = ${value}`;
            }
          } else if (operator === 'not_equals') {
            if (isCategory) {
              condition = sql`(json_extract(metadata, '$.pluginId') IS NULL OR (json_extract(metadata, '$.pluginId') != ${value} AND json_extract(metadata, '$.pluginId') NOT LIKE ${`${value}:%`}))`;
            } else {
              condition = sql`(json_extract(metadata, '$.pluginId') IS NULL OR json_extract(metadata, '$.pluginId') != ${value})`;
            }
          }
        } else if (type === 'strategy' && operator === 'equals') {
          if (value === 'basic') {
            // Basic is represented by NULL in the metadata.strategyId field
            condition = sql`(json_extract(metadata, '$.strategyId') IS NULL OR json_extract(metadata, '$.strategyId') = '')`;
          } else {
            condition = sql`json_extract(metadata, '$.strategyId') = ${value}`;
          }
        } else if (type === 'severity' && operator === 'equals') {
          // Severity can be explicit (metadata.severity) or implied by pluginId.
          const explicit = sql`json_extract(metadata, '$.severity') = ${value}`;

          // Get the severity map for all plugins
          const severityMap = getRiskCategorySeverityMap(this.config?.redteam?.plugins);

          // Find all plugin IDs that match the requested severity
          const matchingPluginIds = Object.entries(severityMap)
            .filter(([, severity]) => severity === value)
            .map(([pluginId]) => pluginId);

          // Build pluginId match conditions for this severity
          const pluginConditions: SQL<unknown>[] = matchingPluginIds.map((pluginId) => {
            return pluginId.includes(':')
              ? sql`json_extract(metadata, '$.pluginId') = ${pluginId}`
              : sql`json_extract(metadata, '$.pluginId') LIKE ${`${pluginId}:%`}`;
          });

          // Final condition: explicit OR (plugin match AND no conflicting override)
          if (pluginConditions.length > 0) {
            const pluginMatch = sql.join(pluginConditions, sql` OR `);
            const overrideOk = sql`(json_extract(metadata, '$.severity') IS NULL OR json_extract(metadata, '$.severity') = ${value})`;
            condition = sql`(${explicit} OR ((${pluginMatch}) AND ${overrideOk}))`;
          } else {
            condition = sql`(${explicit})`;
          }
        } else if (type === 'policy' && operator === 'equals') {
          condition = sql`(named_scores LIKE '%PolicyViolation:%' AND named_scores LIKE ${`%${value}%`})`;
        }

        if (condition) {
          filterConditions.push({
            condition,
            logicOperator: logicOperator || 'AND',
          });
        }
      });

      // Combine filter conditions with logic operators
      const filterClause = combineFilterConditions(filterConditions);
      if (filterClause) {
        conditions.push(sql`(${filterClause})`);
      }
    }

    // Add search condition if searchQuery is provided
    if (opts.searchQuery && opts.searchQuery.trim() !== '') {
      const searchPattern = `%${opts.searchQuery}%`;

      const searchConditions = [
        sql`response LIKE ${searchPattern}`,
        sql`json_extract(grading_result, '$.reason') LIKE ${searchPattern}`,
        sql`json_extract(grading_result, '$.comment') LIKE ${searchPattern}`,
        sql`json_extract(named_scores, '$') LIKE ${searchPattern}`,
        sql`json_extract(metadata, '$') LIKE ${searchPattern}`,
        sql`json_extract(test_case, '$.vars') LIKE ${searchPattern}`,
        sql`json_extract(test_case, '$.metadata') LIKE ${searchPattern}`,
      ];

      const searchClause = sql.join(searchConditions, sql` OR `);
      conditions.push(sql`(${searchClause})`);
    }

    // Build final WHERE clause by joining conditions with AND
    return sql.join(conditions, sql` AND `);
  }

  /**
   * Private helper method to build filter conditions and query for test indices.
   *
   * SECURITY: Uses parameterized queries via Drizzle's sql template strings
   * to prevent SQL injection attacks.
   */
  private async queryTestIndices(opts: {
    offset?: number;
    limit?: number;
    filterMode?: EvalResultsFilterMode;
    searchQuery?: string;
    filters?: string[];
  }): Promise<{ testIndices: number[]; filteredCount: number }> {
    const db = getDb();
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;

    // CRITICAL: Use single source of truth for WHERE clause (now returns SQL fragment)
    const whereSql = this.buildFilterWhereSql({
      filterMode: opts.filterMode,
      searchQuery: opts.searchQuery,
      filters: opts.filters,
    });

    // Get filtered count using parameterized query
    const filteredCountQuery = sql`
      SELECT COUNT(DISTINCT test_idx) as count
      FROM eval_results
      WHERE ${whereSql}
    `;
    const countStart = Date.now();
    const countResult = await db.get<FilteredCountRow>(filteredCountQuery);
    const countEnd = Date.now();
    logger.debug(`Count query took ${countEnd - countStart}ms`);
    const filteredCount = countResult?.count || 0;

    // Query for test indices based on filters using parameterized query
    const idxQuery = sql`
      SELECT DISTINCT test_idx
      FROM eval_results
      WHERE ${whereSql}
      ORDER BY test_idx
      LIMIT ${limit}
      OFFSET ${offset}
    `;
    const idxStart = Date.now();
    const rows = await db.all<TestIndexRow>(idxQuery);
    const idxEnd = Date.now();
    logger.debug(`Index query took ${idxEnd - idxStart}ms`);

    // Get all test indices from the rows
    const testIndices = rows.map((row) => row.test_idx);

    return { testIndices, filteredCount };
  }

  /**
   * CRITICAL: Calculates metrics for filtered results.
   * Uses the SAME WHERE clause as queryTestIndices() to ensure consistency.
   *
   * SECURITY: Uses parameterized SQL queries to prevent SQL injection.
   *
   * This method is called from the API route when filters are active to provide
   * metrics that accurately reflect the filtered dataset.
   *
   * @returns Array of PromptMetrics, one per prompt
   */
  async getFilteredMetrics(opts: {
    filterMode?: EvalResultsFilterMode;
    searchQuery?: string;
    filters?: string[];
  }): Promise<import('../types').PromptMetrics[]> {
    // CRITICAL: Use the SAME WHERE clause as queryTestIndices (now returns SQL fragment)
    const whereSql = this.buildFilterWhereSql(opts);

    return calculateFilteredMetrics({
      evalId: this.id,
      numPrompts: this.prompts.length,
      whereSql,
    });
  }

  async getTablePage(opts: {
    offset?: number;
    limit?: number;
    filterMode?: EvalResultsFilterMode;
    testIndices?: number[];
    searchQuery?: string;
    filters?: string[];
  }): Promise<{
    head: { prompts: Prompt[]; vars: string[] };
    body: EvaluateTableRow[];
    totalCount: number;
    filteredCount: number;
    id: string;
  }> {
    // Get total count of tests for this eval
    const totalCount = await this.getResultsCount();

    // Determine test indices to use
    let testIndices: number[];
    let filteredCount: number;

    if (opts.testIndices && opts.testIndices.length > 0) {
      // Use the provided test indices directly
      testIndices = opts.testIndices;
      filteredCount = testIndices.length;
    } else {
      // Use optimized query for simple cases, fall back to original for complex filters
      const hasComplexFilters = opts.filters && opts.filters.length > 0;

      let queryResult;
      if (hasComplexFilters) {
        // Fall back to original query for complex filters
        logger.debug('Using original query for complex filters');
        queryResult = await this.queryTestIndices({
          offset: opts.offset,
          limit: opts.limit,
          filterMode: opts.filterMode,
          searchQuery: opts.searchQuery,
          filters: opts.filters,
        });
      } else {
        // Use optimized query for better performance
        logger.debug('Using optimized query for table page');
        queryResult = await queryTestIndicesOptimized(this.id, {
          offset: opts.offset,
          limit: opts.limit,
          filterMode: opts.filterMode,
          searchQuery: opts.searchQuery,
          filters: opts.filters,
        });
      }

      testIndices = queryResult.testIndices;
      filteredCount = queryResult.filteredCount;
    }

    // Get vars for this eval
    const varsStart = Date.now();
    const vars = Array.from(this.vars);
    const varsEnd = Date.now();
    logger.debug(`Vars query took ${varsEnd - varsStart}ms`);

    // Initialize the body array that will hold table rows
    const body: EvaluateTableRow[] = [];
    const bodyStart = Date.now();

    // Early return if no test indices found
    if (testIndices.length === 0) {
      const bodyEnd = Date.now();
      logger.debug(`Body query took ${bodyEnd - bodyStart}ms`);
      return {
        head: { prompts: this.prompts, vars },
        body,
        totalCount,
        filteredCount,
        id: this.id,
      };
    }

    // Fetch all results for these test indices in a single query
    const allResults = await EvalResult.findManyByEvalIdAndTestIndices(this.id, testIndices);

    // Check if any result has metadata.sessionId and add to vars header if not present
    const hasSessionIdInMetadata = allResults.some(
      (result) => result.metadata?.sessionId && !result.testCase?.vars?.sessionId,
    );
    if (hasSessionIdInMetadata && !vars.includes('sessionId')) {
      vars.push('sessionId');
      vars.sort();
    }

    // Group results by test index
    const resultsByTestIdx = new Map<number, EvalResult[]>();
    for (const result of allResults) {
      if (!resultsByTestIdx.has(result.testIdx)) {
        resultsByTestIdx.set(result.testIdx, []);
      }
      resultsByTestIdx.get(result.testIdx)!.push(result);
    }

    // Create table rows in the same order as the original query
    for (const testIdx of testIndices) {
      const results = resultsByTestIdx.get(testIdx) || [];
      if (results.length > 0) {
        body.push(convertTestResultsToTableRow(results, vars));
      }
    }

    const bodyEnd = Date.now();
    logger.debug(`Body query took ${bodyEnd - bodyStart}ms`);

    return { head: { prompts: this.prompts, vars }, body, totalCount, filteredCount, id: this.id };
  }

  async addPrompts(prompts: CompletedPrompt[]) {
    this.prompts = prompts;
    if (this.persisted) {
      const db = getDb();
      db.update(evalsTable).set({ prompts }).where(eq(evalsTable.id, this.id)).run();
    }
  }

  async setResults(results: EvalResult[]) {
    this.results = results;
    if (this.persisted) {
      const db = getDb();
      await db.insert(evalResultsTable).values(results.map((r) => ({ ...r, evalId: this.id })));
    }
    this._resultsLoaded = true;
  }

  async loadResults() {
    this.results = await EvalResult.findManyByEvalId(this.id);
    this._resultsLoaded = true;
  }

  async getResults(): Promise<EvaluateResult[] | EvalResult[]> {
    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      return this.oldResults.results;
    }
    await this.loadResults();
    this._resultsLoaded = true;
    return this.results;
  }

  clearResults() {
    this.results = [];
    this._resultsLoaded = false;
  }

  getStats(): EvaluateStats {
    const stats: EvaluateStats = {
      successes: 0,
      failures: 0,
      errors: 0,
      tokenUsage: createEmptyTokenUsage(),
      durationMs: this.durationMs,
    };

    for (const prompt of this.prompts) {
      stats.successes += prompt.metrics?.testPassCount ?? 0;
      stats.failures += prompt.metrics?.testFailCount ?? 0;
      stats.errors += prompt.metrics?.testErrorCount ?? 0;

      accumulateTokenUsage(stats.tokenUsage, prompt.metrics?.tokenUsage);
    }

    return stats;
  }

  async toEvaluateSummary(): Promise<EvaluateSummaryV3 | EvaluateSummaryV2> {
    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      return {
        version: 2,
        timestamp: new Date(this.createdAt).toISOString(),
        results: this.oldResults.results,
        table: this.oldResults.table,
        stats: this.oldResults.stats,
      };
    }
    if (this.results.length === 0) {
      await this.loadResults();
    }

    const stats = await this.getStats();
    const shouldStripPromptText = getEnvBool('PROMPTFOO_STRIP_PROMPT_TEXT', false);

    const prompts = shouldStripPromptText
      ? this.prompts.map((p) => ({
          ...p,
          raw: '[prompt stripped]',
        }))
      : this.prompts;

    return {
      version: 3,
      timestamp: new Date(this.createdAt).toISOString(),
      prompts,
      results: this.results.map((r) => r.toEvaluateResult()),
      stats,
    };
  }

  async getTraces(): Promise<TraceData[]> {
    try {
      const traceStore = getTraceStore();
      const tracesData = await traceStore.getTracesByEvaluation(this.id);

      // Transform trace data to match the expected schema
      return tracesData.map((trace: TraceData) => ({
        traceId: trace.traceId,
        evaluationId: trace.evaluationId,
        testCaseId: trace.testCaseId,
        metadata: trace.metadata,
        // biome-ignore lint/suspicious/noExplicitAny: FIXME yeah that aint right
        spans: (trace.spans || []).map((span: any) => {
          // Calculate duration
          const durationMs =
            span.endTime && span.startTime ? (span.endTime - span.startTime) / 1000000 : undefined;

          // Map status code
          const statusCode =
            span.statusCode === 1 ? 'ok' : span.statusCode === 2 ? 'error' : 'unset';

          return {
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            name: span.name,
            kind: span.kind || 'unspecified',
            startTime: span.startTime,
            endTime: span.endTime,
            durationMs,
            attributes: span.attributes || {},
            status: {
              code: statusCode,
              message: span.statusMessage,
            },
            depth: 0, // Will be calculated on the server side when storing
            events: span.events || [],
          };
        }),
      }));
    } catch (error) {
      logger.debug(`Failed to fetch traces for eval ${this.id}: ${error}`);
      return [];
    }
  }

  async toResultsFile(): Promise<ResultsFile> {
    const traces = await this.getTraces();

    const results: ResultsFile = {
      version: this.version(),
      createdAt: new Date(this.createdAt).toISOString(),
      results: await this.toEvaluateSummary(),
      config: this.config,
      author: this.author || null,
      prompts: this.getPrompts(),
      datasetId: this.datasetId || null,
      ...(traces.length > 0 && { traces }),
    };

    return results;
  }

  async delete() {
    const db = getDb();
    db.transaction(() => {
      db.delete(evalsToDatasetsTable).where(eq(evalsToDatasetsTable.evalId, this.id)).run();
      db.delete(evalsToPromptsTable).where(eq(evalsToPromptsTable.evalId, this.id)).run();
      db.delete(evalsToTagsTable).where(eq(evalsToTagsTable.evalId, this.id)).run();
      db.delete(evalResultsTable).where(eq(evalResultsTable.evalId, this.id)).run();
      db.delete(evalsTable).where(eq(evalsTable.id, this.id)).run();
    });
  }

  /**
   * Creates a deep copy of this eval including all results.
   * Uses batching to avoid memory exhaustion on large evals.
   * @param description - Optional description for the new eval
   * @param distinctTestCount - Optional pre-computed test count to avoid duplicate query
   */
  async copy(description?: string, distinctTestCount?: number): Promise<Eval> {
    const newEvalId = createEvalId(new Date());
    const copyDescription = description || `${this.description || 'Evaluation'} (Copy)`;

    // Get distinct test count for logging and progress tracking
    const testCount = distinctTestCount ?? (await this.getResultsCount());

    logger.info('Starting eval copy', {
      sourceEvalId: this.id,
      targetEvalId: newEvalId,
      distinctTestCount: testCount,
    });

    // Deep clone to prevent mutation issues
    const newConfig = structuredClone(this.config);
    newConfig.description = copyDescription;

    const newPrompts = structuredClone(this.prompts);
    const newVars = this.vars ? structuredClone(this.vars) : [];
    const author = getUserEmail();

    const db = getDb();

    // Copy eval, results, and relationships within transaction for atomicity
    let copiedCount = 0;
    db.transaction(() => {
      // Create the new eval record first
      db.insert(evalsTable)
        .values({
          id: newEvalId,
          createdAt: Date.now(),
          author,
          description: copyDescription,
          config: newConfig,
          results: {},
          prompts: newPrompts,
          vars: newVars,
          runtimeOptions: sanitizeRuntimeOptions(this.runtimeOptions),
          isRedteam: Boolean(newConfig.redteam),
        })
        .run();

      // Copy prompts relationships
      // Note: prompts already exist in promptsTable from when the source eval was created
      // We just need to create new relationships pointing to those same prompts
      const promptRels = db
        .select()
        .from(evalsToPromptsTable)
        .where(eq(evalsToPromptsTable.evalId, this.id))
        .all();

      if (promptRels.length > 0) {
        db.insert(evalsToPromptsTable)
          .values(
            promptRels.map((rel) => ({
              evalId: newEvalId,
              promptId: rel.promptId,
            })),
          )
          .onConflictDoNothing()
          .run();
      }

      // Copy tags relationships (from config.tags)
      if (this.config.tags) {
        for (const [tagKey, tagValue] of Object.entries(this.config.tags)) {
          const tagId = sha256(`${tagKey}:${tagValue}`);

          db.insert(tagsTable)
            .values({
              id: tagId,
              name: tagKey,
              value: tagValue,
            })
            .onConflictDoNothing()
            .run();

          db.insert(evalsToTagsTable)
            .values({
              evalId: newEvalId,
              tagId,
            })
            .onConflictDoNothing()
            .run();
        }
      }

      // Copy dataset relationship
      const datasetRel = db
        .select()
        .from(evalsToDatasetsTable)
        .where(eq(evalsToDatasetsTable.evalId, this.id))
        .limit(1)
        .all();

      if (datasetRel.length > 0) {
        db.insert(evalsToDatasetsTable)
          .values({
            evalId: newEvalId,
            datasetId: datasetRel[0].datasetId,
          })
          .onConflictDoNothing()
          .run();
      }

      // Copy results in batches to avoid memory exhaustion
      const BATCH_SIZE = 1000;
      let offset = 0;

      while (true) {
        // Fetch batch from source eval
        const batch = db
          .select()
          .from(evalResultsTable)
          .where(eq(evalResultsTable.evalId, this.id))
          .orderBy(evalResultsTable.id)
          .limit(BATCH_SIZE)
          .offset(offset)
          .all();

        if (batch.length === 0) {
          break;
        }

        // Map to new eval with new IDs and timestamps
        const now = Date.now();
        const copiedResults = batch.map((result) => ({
          ...result,
          id: crypto.randomUUID(),
          evalId: newEvalId,
          createdAt: now,
          updatedAt: now,
        }));

        // Insert batch
        db.insert(evalResultsTable).values(copiedResults).run();

        copiedCount += batch.length;
        offset += BATCH_SIZE;

        logger.debug('Copied batch of eval results', {
          sourceEvalId: this.id,
          targetEvalId: newEvalId,
          batchSize: batch.length,
          rowsCopied: copiedCount,
          distinctTestCount: testCount,
        });
      }
    });

    logger.info('Eval copy completed successfully', {
      sourceEvalId: this.id,
      targetEvalId: newEvalId,
      rowsCopied: copiedCount,
      distinctTestCount: testCount,
    });

    return (await Eval.findById(newEvalId)) as Eval;
  }

  get shared() {
    return this._shared;
  }

  set shared(shared: boolean) {
    this._shared = shared;
  }
}

/**
 * Queries summaries of all evals, optionally for a given dataset.
 *
 * @param datasetId - An optional dataset ID to filter by.
 * @param type - An optional eval type to filter by.
 * @param includeProviders - An optional flag to include providers in the summary.
 * @returns A list of eval summaries.
 */
export async function getEvalSummaries(
  datasetId?: string,
  type?: 'redteam' | 'eval',
  includeProviders: boolean = false,
): Promise<EvalSummary[]> {
  const db = getDb();

  const whereClauses = [];

  if (datasetId) {
    whereClauses.push(eq(evalsToDatasetsTable.datasetId, datasetId));
  }

  if (type) {
    if (type === 'redteam') {
      whereClauses.push(sql<boolean>`json_type(${evalsTable.config}, '$.redteam') IS NOT NULL`);
    } else {
      whereClauses.push(sql<boolean>`json_type(${evalsTable.config}, '$.redteam') IS NULL`);
    }
  }

  const results = db
    .select({
      evalId: evalsTable.id,
      createdAt: evalsTable.createdAt,
      description: evalsTable.description,
      datasetId: evalsToDatasetsTable.datasetId,
      isRedteam: sql<boolean>`json_type(${evalsTable.config}, '$.redteam') IS NOT NULL`,
      prompts: evalsTable.prompts,
      config: evalsTable.config,
    })
    .from(evalsTable)
    .leftJoin(evalsToDatasetsTable, eq(evalsTable.id, evalsToDatasetsTable.evalId))
    .where(and(...whereClauses))
    .orderBy(desc(evalsTable.createdAt))
    .all();

  /**
   * Deserialize the evals. A few things to note:
   *
   * - Test statistics are derived from the prompt metrics as this is the only reliable source of truth
   * that's written to the evals table.
   */
  return results.map((result) => {
    const passCount =
      result.prompts?.reduce((memo, prompt) => {
        return memo + (prompt.metrics?.testPassCount ?? 0);
      }, 0) ?? 0;

    const failCount =
      result.prompts?.reduce((memo, prompt) => {
        return memo + (prompt.metrics?.testFailCount ?? 0);
      }, 0) ?? 0;

    // All prompts should have the same number of test cases:
    const testCounts = result.prompts?.map((p) => {
      return (
        (p.metrics?.testPassCount ?? 0) +
        (p.metrics?.testFailCount ?? 0) +
        (p.metrics?.testErrorCount ?? 0)
      );
    }) ?? [0];

    // Derive the number of tests from the first prompt.
    const testCount = testCounts.length > 0 ? testCounts[0] : 0;

    // Test count * prompt count
    const testRunCount = testCount * (result.prompts?.length ?? 0);

    // Construct an array of providers
    const deserializedProviders = [];
    const providers = result.config.providers;

    if (includeProviders) {
      if (typeof providers === 'string') {
        // `providers: string`
        deserializedProviders.push({
          id: providers,
          label: null,
        });
      } else if (Array.isArray(providers)) {
        providers.forEach((p) => {
          if (typeof p === 'string') {
            // `providers: string[]`
            deserializedProviders.push({
              id: p,
              label: null,
            });
          } else if (typeof p === 'object' && p) {
            // Check if it's a declarative provider (record format)
            // e.g., { 'openai:gpt-4': { config: {...} } }
            const keys = Object.keys(p);
            if (keys.length === 1 && !('id' in p)) {
              // This is a declarative provider
              const providerId = keys[0];
              // biome-ignore lint/suspicious/noExplicitAny: FIXME this should use Object.keys or something to keep it type safe
              const providerConfig = (p as any)[providerId];
              deserializedProviders.push({
                id: providerId,
                label: providerConfig.label ?? null,
              });
            } else {
              // `providers: ProviderOptions[]` with explicit id
              deserializedProviders.push({
                id: p.id ?? 'unknown',
                label: p.label ?? null,
              });
            }
          }
        });
      }
    }

    return {
      evalId: result.evalId,
      createdAt: result.createdAt,
      description: result.description,
      numTests: testCount,
      datasetId: result.datasetId,
      isRedteam: Boolean(result.isRedteam),
      passRate: testRunCount > 0 ? (passCount / testRunCount) * 100 : 0,
      label: result.description ? `${result.description} (${result.evalId})` : result.evalId,
      providers: deserializedProviders,
      attackSuccessRate:
        type === 'redteam' ? calculateAttackSuccessRate(testRunCount, failCount) : undefined,
    };
  });
}
