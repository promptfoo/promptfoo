import { randomUUID } from 'crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { DEFAULT_QUERY_LIMIT } from '../constants';
import { getDb } from '../database';
import {
  datasetsTable,
  evalsTable,
  evalsToDatasetsTable,
  evalsToPromptsTable,
  promptsTable,
  tagsTable,
  evalsToTagsTable,
  evalResultsTable,
} from '../database/tables';
import { getEnvBool } from '../envars';
import { getUserEmail } from '../globalConfig/accounts';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import {
  type CompletedPrompt,
  type EvaluateResult,
  type EvaluateStats,
  type EvaluateSummaryV3,
  type EvaluateSummaryV2,
  type EvaluateTable,
  ResultFailureReason,
  type Prompt,
  type ResultsFile,
  type UnifiedConfig,
  type EvalSummary,
  type EvaluateTableRow,
} from '../types';
import { convertResultsToTable } from '../util/convertEvalResultsToTable';
import { randomSequence, sha256 } from '../util/createHash';
import { convertTestResultsToTableRow } from '../util/exportToFile';
import invariant from '../util/invariant';
import { getCurrentTimestamp } from '../util/time';
import EvalResult from './evalResult';

interface FilteredCountRow {
  count: number | null;
}

interface TestIndexRow {
  test_idx: number;
}

export function createEvalId(createdAt: Date = new Date()) {
  return `eval-${randomSequence(3)}-${createdAt.toISOString().slice(0, 19)}`;
}

export class EvalQueries {
  static async getVarsFromEvals(evals: Eval[]) {
    const db = getDb();
    const query = sql.raw(
      `SELECT DISTINCT j.key, eval_id from (SELECT eval_id, json_extract(eval_results.test_case, '$.vars') as vars
FROM eval_results where eval_id IN (${evals.map((e) => `'${e.id}'`).join(',')})) t, json_each(t.vars) j;`,
    );
    // @ts-ignore
    const results: { key: string; eval_id: string }[] = await db.all(query);
    const vars = results.reduce((acc: Record<string, string[]>, r) => {
      acc[r.eval_id] = acc[r.eval_id] || [];
      acc[r.eval_id].push(r.key);
      return acc;
    }, {});
    return vars;
  }

  static async getVarsFromEval(evalId: string) {
    const db = getDb();
    const query = sql.raw(
      `SELECT DISTINCT j.key from (SELECT json_extract(eval_results.test_case, '$.vars') as vars
    FROM eval_results where eval_results.eval_id = '${evalId}') t, json_each(t.vars) j;`,
    );
    // @ts-ignore
    const results: { key: string }[] = await db.all(query);
    const vars = results.map((r) => r.key);

    return new Set(vars);
  }

  static async setVars(evalId: string, vars: Set<string>) {
    const db = getDb();
    try {
      await db
        .update(evalsTable)
        .set({ vars: Array.from(vars) })
        .where(eq(evalsTable.id, evalId))
        .run();
    } catch (e) {
      logger.error(`Error setting vars: ${vars} for eval ${evalId}: ${e}`);
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
  _resultsLoaded: boolean = false;
  _vars: Set<string>;

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

    const evalInstance = new Eval(eval_.config, {
      id: eval_.id,
      createdAt: new Date(eval_.createdAt),
      author: eval_.author || undefined,
      description: eval_.description || undefined,
      prompts: eval_.prompts || [],
      datasetId,
      persisted: true,
      vars: new Set(eval_.vars || []),
    });
    if (eval_.results && 'table' in eval_.results) {
      evalInstance.oldResults = eval_.results as EvaluateSummaryV2;
    }

    // backfill vars
    if (!eval_.vars) {
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

  static async create(
    config: Partial<UnifiedConfig>,
    renderedPrompts: Prompt[], // The config doesn't contain the actual prompts, so we need to pass them in separately
    opts?: {
      id?: string;
      createdAt?: Date;
      author?: string;
      // Be wary, this is EvalResult[] and not EvaluateResult[]
      results?: EvalResult[];
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
          .values(opts.results?.map((r) => ({ ...r, evalId, id: randomUUID() })))
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

    return new Eval(config, { id: evalId, author: opts?.author, createdAt, persisted: true });
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
      vars?: Set<string>;
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
    this._vars = new Set(opts?.vars || []);
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
    const updateObj: Record<string, any> = {
      config: this.config,
      prompts: this.prompts,
      description: this.config.description,
      author: this.author,
      updatedAt: getCurrentTimestamp(),
      vars: Array.from(this.vars),
    };

    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      updateObj.results = this.oldResults;
    }
    await db.update(evalsTable).set(updateObj).where(eq(evalsTable.id, this.id)).run();
    this.persisted = true;
  }

  setVars(vars: Set<string>) {
    this._vars = vars;
  }

  addVar(varName: string) {
    this.vars.add(varName);
  }

  get vars(): Set<string> {
    return this._vars;
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
  }

  async *fetchResultsBatched(batchSize: number = 100) {
    for await (const batch of EvalResult.findManyByEvalIdBatched(this.id, { batchSize })) {
      yield batch;
    }
  }

  async getResultsCount(): Promise<number> {
    const db = getDb();
    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(evalResultsTable)
      .where(eq(evalResultsTable.evalId, this.id))
      .all();
    const count = result[0]?.count ?? 0;
    return Number(count);
  }

  async fetchResultsByTestIdx(testIdx: number) {
    return await EvalResult.findManyByEvalId(this.id, { testIdx });
  }

  /**
   * Private helper method to build filter conditions and query for test indices
   */
  private async queryTestIndices(opts: {
    offset?: number;
    limit?: number;
    filterMode?: string;
    searchQuery?: string;
    metricFilter?: string;
  }): Promise<{ testIndices: number[]; filteredCount: number }> {
    const db = getDb();
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;
    const filter = opts.filterMode ?? 'all';

    // Build filter conditions
    const conditions = [`eval_id = '${this.id}'`];
    if (filter === 'errors') {
      conditions.push(`failure_reason = ${ResultFailureReason.ERROR}`);
    } else if (filter === 'failures') {
      conditions.push(`success = 0 AND failure_reason != ${ResultFailureReason.ERROR}`);
    } else if (filter === 'passes') {
      conditions.push(`success = 1`);
    }

    // Add specific metric filter if provided
    if (opts.metricFilter && opts.metricFilter.trim() !== '') {
      const sanitizedMetric = opts.metricFilter.replace(/'/g, "''");
      conditions.push(`json_extract(named_scores, '$.${sanitizedMetric}') IS NOT NULL`);
    }

    // Add search condition if searchQuery is provided
    if (opts.searchQuery && opts.searchQuery.trim() !== '') {
      const sanitizedSearch = opts.searchQuery.replace(/'/g, "''");
      const searchConditions = [
        // Search in response text
        `response LIKE '%${sanitizedSearch}%'`,
        // Search in grading result reason
        `json_extract(grading_result, '$.reason') LIKE '%${sanitizedSearch}%'`,
        // Search in grading result comment
        `json_extract(grading_result, '$.comment') LIKE '%${sanitizedSearch}%'`,
        // Search in named scores
        `json_extract(named_scores, '$') LIKE '%${sanitizedSearch}%'`,
        // Search in metadata
        `json_extract(metadata, '$') LIKE '%${sanitizedSearch}%'`,
        // Search in test case vars
        `json_extract(test_case, '$.vars') LIKE '%${sanitizedSearch}%'`,
        // Search in test case metadata
        `json_extract(test_case, '$.metadata') LIKE '%${sanitizedSearch}%'`,
      ];
      conditions.push(`(${searchConditions.join(' OR ')})`);
    }

    const whereSql = conditions.join(' AND ');

    // Get filtered count
    const filteredCountQuery = sql.raw(
      `SELECT COUNT(DISTINCT test_idx) as count FROM eval_results WHERE ${whereSql}`,
    );
    const countStart = Date.now();
    const countResult = await db.get<FilteredCountRow>(filteredCountQuery);
    const countEnd = Date.now();
    logger.debug(`Count query took ${countEnd - countStart}ms`);
    const filteredCount = countResult?.count || 0;

    // Query for test indices based on filters
    const idxQuery = sql.raw(
      `SELECT DISTINCT test_idx FROM eval_results WHERE ${whereSql} ORDER BY test_idx LIMIT ${limit} OFFSET ${offset}`,
    );
    const idxStart = Date.now();
    const rows = await db.all<TestIndexRow>(idxQuery);
    const idxEnd = Date.now();
    logger.debug(`Index query took ${idxEnd - idxStart}ms`);

    // Get all test indices from the rows
    const testIndices = rows.map((row) => row.test_idx);

    return { testIndices, filteredCount };
  }

  async getTablePage(opts: {
    offset?: number;
    limit?: number;
    filterMode?: string;
    testIndices?: number[];
    searchQuery?: string;
    metricFilter?: string;
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
      // Query for test indices based on filters
      const queryResult = await this.queryTestIndices({
        offset: opts.offset,
        limit: opts.limit,
        filterMode: opts.filterMode,
        searchQuery: opts.searchQuery,
        metricFilter: opts.metricFilter,
      });

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
      await db.update(evalsTable).set({ prompts }).where(eq(evalsTable.id, this.id)).run();
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
      tokenUsage: {
        cached: 0,
        completion: 0,
        prompt: 0,
        total: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
        assertions: {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
        },
      },
    };

    for (const prompt of this.prompts) {
      stats.successes += prompt.metrics?.testPassCount || 0;
      stats.failures += prompt.metrics?.testFailCount || 0;
      stats.errors += prompt.metrics?.testErrorCount || 0;
      stats.tokenUsage.prompt += prompt.metrics?.tokenUsage.prompt || 0;
      stats.tokenUsage.cached += prompt.metrics?.tokenUsage.cached || 0;
      stats.tokenUsage.completion += prompt.metrics?.tokenUsage.completion || 0;
      stats.tokenUsage.total += prompt.metrics?.tokenUsage.total || 0;
      stats.tokenUsage.numRequests += prompt.metrics?.tokenUsage.numRequests || 0;

      stats.tokenUsage.completionDetails.reasoning! +=
        prompt.metrics?.tokenUsage.completionDetails?.reasoning || 0;
      stats.tokenUsage.completionDetails.acceptedPrediction! +=
        prompt.metrics?.tokenUsage.completionDetails?.acceptedPrediction || 0;
      stats.tokenUsage.completionDetails.rejectedPrediction! +=
        prompt.metrics?.tokenUsage.completionDetails?.rejectedPrediction || 0;

      // Add assertion token usage from prompt metrics
      if (prompt.metrics?.tokenUsage.assertions) {
        stats.tokenUsage.assertions.total! += prompt.metrics.tokenUsage.assertions.total || 0;
        stats.tokenUsage.assertions.prompt! += prompt.metrics.tokenUsage.assertions.prompt || 0;
        stats.tokenUsage.assertions.completion! +=
          prompt.metrics.tokenUsage.assertions.completion || 0;
        stats.tokenUsage.assertions.cached! += prompt.metrics.tokenUsage.assertions.cached || 0;
      }
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

  async toResultsFile(): Promise<ResultsFile> {
    const results: ResultsFile = {
      version: this.version(),
      createdAt: new Date(this.createdAt).toISOString(),
      results: await this.toEvaluateSummary(),
      config: this.config,
      author: this.author || null,
      prompts: this.getPrompts(),
      datasetId: this.datasetId || null,
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
}

/**
 * Queries summaries of all evals, optionally for a given dataset.
 *
 * @param datasetId - An optional dataset ID to filter by.
 * @returns A list of eval summaries.
 */
export async function getEvalSummaries(datasetId?: string): Promise<EvalSummary[]> {
  const db = getDb();

  const results = db
    .select({
      evalId: evalsTable.id,
      createdAt: evalsTable.createdAt,
      description: evalsTable.description,
      datasetId: evalsToDatasetsTable.datasetId,
      isRedteam: sql<boolean>`json_type(${evalsTable.config}, '$.redteam') IS NOT NULL`,
      prompts: evalsTable.prompts,
    })
    .from(evalsTable)
    .leftJoin(evalsToDatasetsTable, eq(evalsTable.id, evalsToDatasetsTable.evalId))
    .where(datasetId ? eq(evalsToDatasetsTable.datasetId, datasetId) : undefined)
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
        // TODO(will): Verify whether prompt.metrics *should* be required.
        invariant(!!prompt.metrics, 'Prompt metrics are required');
        return memo + prompt.metrics!.testPassCount;
      }, 0) ?? 0;

    // All prompts should have the same number of test cases:
    const testCounts = result.prompts?.map((p) => {
      return (
        (p.metrics?.testPassCount ?? 0) +
        (p.metrics?.testFailCount ?? 0) +
        (p.metrics?.testErrorCount ?? 0)
      );
    }) ?? [0];

    invariant(
      testCounts.every((t) => t === testCounts[0]),
      'All prompts must have the same number of test cases',
    );

    // Derive the number of tests from the first prompt.
    const testCount = testCounts.length > 0 ? testCounts[0] : 0;

    // Test count * prompt count
    const testRunCount = testCount * (result.prompts?.length ?? 0);

    return {
      evalId: result.evalId,
      createdAt: result.createdAt,
      description: result.description,
      numTests: testCount,
      datasetId: result.datasetId,
      isRedteam: result.isRedteam,
      passRate: testRunCount > 0 ? (passCount / testRunCount) * 100 : 0,
      label: result.description ? `${result.description} (${result.evalId})` : result.evalId,
    };
  });
}
