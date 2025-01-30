import { randomUUID } from 'crypto';
import { and, desc, eq, like, sql } from 'drizzle-orm';
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
import type {
  CompletedPrompt,
  EvaluateResult,
  EvaluateStats,
  EvaluateSummaryV3,
  EvaluateSummaryV2,
  EvaluateTable,
  Prompt,
  ResultsFile,
  UnifiedConfig,
} from '../types';
import { convertResultsToTable } from '../util/convertEvalResultsToTable';
import { randomSequence, sha256 } from '../util/createHash';
import invariant from '../util/invariant';
import { getCurrentTimestamp } from '../util/time';
import EvalResult from './evalResult';

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

    const { evals, datasetResults } = await db.transaction(async (tx) => {
      const evals = await tx.select().from(evalsTable).where(eq(evalsTable.id, id));
      const datasetResults = await tx
        .select({
          datasetId: evalsToDatasetsTable.datasetId,
        })
        .from(evalsToDatasetsTable)
        .where(eq(evalsToDatasetsTable.evalId, id))
        .limit(1);

      return { evals, datasetResults };
    });

    if (evals.length === 0) {
      return undefined;
    }
    const eval_ = evals[0];

    const datasetId = datasetResults[0]?.datasetId;

    const evalInstance = new Eval(eval_.config, {
      id: eval_.id,
      createdAt: new Date(eval_.createdAt),
      author: eval_.author || undefined,
      description: eval_.description || undefined,
      prompts: eval_.prompts || [],
      datasetId,
      persisted: true,
    });
    if (eval_.results && 'table' in eval_.results) {
      evalInstance.oldResults = eval_.results as EvaluateSummaryV2;
    }

    return evalInstance;
  }

  static async getMany(limit: number = DEFAULT_QUERY_LIMIT) {
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
    await db.transaction(async (tx) => {
      await tx
        .insert(evalsTable)
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

        await tx
          .insert(promptsTable)
          .values({
            id: promptId,
            prompt: label,
          })
          .onConflictDoNothing()
          .run();

        await tx
          .insert(evalsToPromptsTable)
          .values({
            evalId,
            promptId,
          })
          .onConflictDoNothing()
          .run();

        logger.debug(`Inserting prompt ${promptId}`);
      }
      if (opts?.results && opts.results.length > 0) {
        const res = await tx
          .insert(evalResultsTable)
          .values(opts.results?.map((r) => ({ ...r, evalId, id: randomUUID() })))
          .run();
        logger.debug(`Inserted ${res.changes} eval results`);
      }

      // Record dataset relation
      const datasetId = sha256(JSON.stringify(config.tests || []));
      await tx
        .insert(datasetsTable)
        .values({
          id: datasetId,
          tests: config.tests,
        })
        .onConflictDoNothing()
        .run();

      await tx
        .insert(evalsToDatasetsTable)
        .values({
          evalId,
          datasetId,
        })
        .onConflictDoNothing()
        .run();

      logger.debug(`Inserting dataset ${datasetId}`);

      // Record tags
      if (config.tags) {
        for (const [tagKey, tagValue] of Object.entries(config.tags)) {
          const tagId = sha256(`${tagKey}:${tagValue}`);

          await tx
            .insert(tagsTable)
            .values({
              id: tagId,
              name: tagKey,
              value: tagValue,
            })
            .onConflictDoNothing()
            .run();

          await tx
            .insert(evalsToTagsTable)
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
    };

    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      updateObj.results = this.oldResults;
    }
    await db.update(evalsTable).set(updateObj).where(eq(evalsTable.id, this.id)).run();
    this.persisted = true;
  }

  async getVars() {
    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      return this.oldResults.table?.head.vars || [];
    }
    const db = getDb();
    const query = sql`SELECT DISTINCT j.key from (SELECT json_extract(test_case_results.test_case, '$.vars') as vars
    FROM test_case_results where test_case_results.eval_id = ${this.id}) t, json_each(t.vars) j;`;
    // @ts-ignore
    const results: { key: string }[] = await db.all(query);

    return results.map((r) => r.key) || [];
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

  async fetchResultsByTestIdx(testIdx: number) {
    return await EvalResult.findManyByEvalId(this.id, { testIdx });
  }

  async addPrompts(prompts: CompletedPrompt[]) {
    this.prompts = prompts;
    if (this.persisted) {
      const db = getDb();
      await db.update(evalsTable).set({ prompts }).where(eq(evalsTable.id, this.id)).run();
    }
  }

  async addResults(results: EvalResult[]) {
    this.results = results;
    if (this.persisted) {
      const db = getDb();
      await db.insert(evalResultsTable).values(results.map((r) => ({ ...r, evalId: this.id })));
    }
  }

  async loadResults() {
    this.results = await EvalResult.findManyByEvalId(this.id);
  }

  async getResults(): Promise<EvaluateResult[] | EvalResult[]> {
    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      return this.oldResults.results;
    }
    await this.loadResults();
    return this.results;
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
    }

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
    await db.transaction(() => {
      db.delete(evalsToDatasetsTable).where(eq(evalsToDatasetsTable.evalId, this.id)).run();
      db.delete(evalsToPromptsTable).where(eq(evalsToPromptsTable.evalId, this.id)).run();
      db.delete(evalsToTagsTable).where(eq(evalsToTagsTable.evalId, this.id)).run();

      db.delete(evalResultsTable).where(eq(evalResultsTable.evalId, this.id)).run();
      db.delete(evalsTable).where(eq(evalsTable.id, this.id)).run();
    });
  }
}

export async function getSummaryOfLatestEvals(
  limit: number = DEFAULT_QUERY_LIMIT,
  filterDescription?: string,
  datasetId?: string,
) {
  const db = getDb();
  const startTime = performance.now();
  const query = db
    .select({
      evalId: evalsTable.id,
      createdAt: evalsTable.createdAt,
      description: evalsTable.description,
      numTests: sql`COUNT(DISTINCT ${evalResultsTable.testIdx})`.as('numTests'),
      datasetId: evalsToDatasetsTable.datasetId,
      isRedteam: sql<boolean>`json_type(${evalsTable.config}, '$.redteam') IS NOT NULL`,
    })
    .from(evalsTable)
    .leftJoin(evalsToDatasetsTable, eq(evalsTable.id, evalsToDatasetsTable.evalId))
    .leftJoin(evalResultsTable, eq(evalsTable.id, evalResultsTable.evalId))
    .where(
      and(
        datasetId ? eq(evalsToDatasetsTable.datasetId, datasetId) : undefined,
        filterDescription ? like(evalsTable.description, `%${filterDescription}%`) : undefined,
        eq(evalsTable.results, {}),
      ),
    )
    .groupBy(evalsTable.id);

  const results = query.orderBy(desc(evalsTable.createdAt)).limit(limit).all();

  const mappedResults = results.map((result) => ({
    evalId: result.evalId,
    createdAt: result.createdAt,
    description: result.description,
    numTests: (result.numTests as number) || 0,
    datasetId: result.datasetId,
    isRedteam: result.isRedteam,
  }));

  const endTime = performance.now();
  const executionTime = endTime - startTime;
  logger.debug(`listPreviousResults execution time: ${executionTime.toFixed(2)}ms`);

  return mappedResults;
}
