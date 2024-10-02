import { and, desc, eq, like, sql } from 'drizzle-orm';
import invariant from 'tiny-invariant';
import { DEFAULT_QUERY_LIMIT } from '../constants';
import { getDb } from '../database';
import {
  datasets,
  evals as evalsTable,
  evalsToDatasets,
  evalsToPrompts,
  prompts as promptsTable,
  tags as tagsTable,
  evalsToTags,
  evalResultsTable,
  evalsToProviders,
} from '../database/tables';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import type {
  AtomicTestCase,
  CompletedPrompt,
  EvaluateResult,
  EvaluateStats,
  EvaluateSummary,
  EvaluateTable,
  Prompt,
  ResultsFile,
  UnifiedConfig,
} from '../types';
import { convertResultsToTable } from '../util/convertEvalResultsToTable';
import { randomSequence, sha256 } from '../util/createHash';
import EvalResult from './evalResult';
import type Provider from './provider';

export function getEvalId(createdAt: Date = new Date()) {
  return `eval-${createdAt.toISOString().slice(0, 19)}-${randomSequence(3)}`;
}

export interface EvalV4 extends Omit<Eval, 'oldResults'> {}

export default class Eval {
  id: string;
  createdAt: number;
  author?: string;
  description?: string;
  config: Partial<UnifiedConfig>;
  results: EvalResult[];
  datasetId?: string;
  prompts: CompletedPrompt[];
  oldResults?: EvaluateSummary;

  static async summaryResults(
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
        numTests: sql`MAX(${evalResultsTable.testCaseIdx} + 1)`.as('numTests'),
        datasetId: evalsToDatasets.datasetId,
      })
      .from(evalsTable)
      .leftJoin(evalsToDatasets, eq(evalsTable.id, evalsToDatasets.evalId))
      .leftJoin(evalResultsTable, eq(evalsTable.id, evalResultsTable.evalId))
      .where(
        and(
          datasetId ? eq(evalsToDatasets.datasetId, datasetId) : undefined,
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
    }));

    const endTime = performance.now();
    const executionTime = endTime - startTime;
    logger.debug(`listPreviousResults execution time: ${executionTime.toFixed(2)}ms`);

    return mappedResults;
  }

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

    const [evals, results, datasetResults] = await Promise.all([
      db.select().from(evalsTable).where(eq(evalsTable.id, id)),
      db.select().from(evalResultsTable).where(eq(evalResultsTable.evalId, id)).execute(),
      db
        .select({
          datasetId: evalsToDatasets.datasetId,
        })
        .from(evalsToDatasets)
        .where(eq(evalsToDatasets.evalId, id))
        .limit(1)
        .execute(),
    ]);

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
    });
    if (results.length > 0) {
      evalInstance.results = results.map((r) => new EvalResult(r));
    } else {
      evalInstance.oldResults = eval_.results as EvaluateSummary;
    }

    return evalInstance;
  }

  static async getAll(limit: number = DEFAULT_QUERY_LIMIT) {
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
        }),
    );
  }

  static create(
    config: Partial<UnifiedConfig>,
    renderedPrompts: Prompt[], // The config doesn't contain the actual prompts, so we need to pass them in separately
    opts?: {
      id?: string;
      createdAt?: Date;
      author?: string;
    },
  ) {
    const createdAt = opts?.createdAt || new Date();
    const evalId = opts?.id || getEvalId(createdAt);
    const db = getDb();
    db.transaction((tx) => {
      tx.insert(evalsTable)
        .values({
          id: evalId,
          createdAt: createdAt.getTime(),
          author: opts?.author,
          description: config.description,
          config,
          results: {},
        })
        .run();

      for (const prompt of renderedPrompts) {
        const label = prompt.label || prompt.display || prompt.raw;
        const promptId = hashPrompt(prompt);

        tx.insert(promptsTable)
          .values({
            id: promptId,
            prompt: label,
          })
          .onConflictDoNothing()
          .run();

        tx.insert(evalsToPrompts)
          .values({
            evalId,
            promptId,
          })
          .onConflictDoNothing()
          .run();

        logger.debug(`Inserting prompt ${promptId}`);
      }

      // Record dataset relation
      const datasetId = sha256(JSON.stringify(config.tests || []));
      tx.insert(datasets)
        .values({
          id: datasetId,
          tests: config.tests,
        })
        .onConflictDoNothing()
        .run();

      tx.insert(evalsToDatasets)
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

          tx.insert(tagsTable)
            .values({
              id: tagId,
              name: tagKey,
              value: tagValue,
            })
            .onConflictDoNothing()
            .run();

          tx.insert(evalsToTags)
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
    return new Eval(config, { id: evalId, author: opts?.author, createdAt });
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
    },
  ) {
    const createdAt = opts?.createdAt || new Date();
    this.createdAt = createdAt.getTime();
    this.id = opts?.id || getEvalId(createdAt);
    this.author = opts?.author;
    this.config = config;
    this.results = [];
    this.prompts = opts?.prompts || [];
    this.datasetId = opts?.datasetId;
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
    };

    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      updateObj.results = this.oldResults;
    }
    await db.update(evalsTable).set(updateObj).where(eq(evalsTable.id, this.id)).run();
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

  async addResult(result: EvaluateResult, columnIdx: number, rowIdx: number, test: AtomicTestCase) {
    const newResult = await EvalResult.create(this.id, result, columnIdx, rowIdx, test);
    this.results.push(newResult);
  }

  async addPrompts(prompts: CompletedPrompt[]) {
    this.prompts = prompts;
    const db = getDb();
    await db.update(evalsTable).set({ prompts }).where(eq(evalsTable.id, this.id)).run();
  }

  async addProviders(providers: Provider[]) {
    const db = getDb();
    await db.transaction(async (tx) => {
      for (const provider of providers) {
        const id = provider.id;
        tx.insert(evalsToProviders)
          .values({
            evalId: this.id,
            providerId: id,
          })
          .onConflictDoNothing()
          .run();
      }
    });
  }

  async loadResults() {
    this.results = await EvalResult.findManyByEvalId(this.id);
  }

  async toEvaluateSummary(): Promise<EvaluateSummary> {
    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      return this.oldResults;
    }
    if (this.results.length === 0) {
      await this.loadResults();
    }
    const stats: EvaluateStats = {
      successes: 0,
      failures: 0,
      tokenUsage: {
        cached: 0,
        completion: 0,
        prompt: 0,
        total: 0,
      },
    };

    for (const prompt of this.prompts) {
      stats.successes += prompt.metrics?.testPassCount || 0;
      stats.failures += prompt.metrics?.testFailCount || 0;
      stats.tokenUsage.prompt += prompt.metrics?.tokenUsage.prompt || 0;
      stats.tokenUsage.cached += prompt.metrics?.tokenUsage.cached || 0;
      stats.tokenUsage.completion += prompt.metrics?.tokenUsage.completion || 0;
      stats.tokenUsage.total += prompt.metrics?.tokenUsage.total || 0;
    }

    return {
      timestamp: new Date(this.createdAt).toISOString(),
      results: this.results.map((r) => r.toEvaluateResult()),
      stats,
    };
  }

  async toResultsFile(generateTable: boolean = false): Promise<ResultsFile> {
    const summary = await this.toEvaluateSummary();
    const results: ResultsFile = {
      version: this.version(),
      createdAt: new Date(this.createdAt).toISOString(),
      results: summary,
      config: this.config,
      author: this.author || null,
      prompts: this.prompts,
      datasetId: this.datasetId || null,
    };

    if (this.useOldResults() && generateTable) {
      results.results.table = await this.getTable();
    }
    return results;
  }

  async delete() {
    const db = getDb();
    await db.transaction(() => {
      db.delete(evalsToDatasets).where(eq(evalsToDatasets.evalId, this.id)).run();
      db.delete(evalsToPrompts).where(eq(evalsToPrompts.evalId, this.id)).run();
      db.delete(evalsToTags).where(eq(evalsToTags.evalId, this.id)).run();
      db.delete(evalsToProviders).where(eq(evalsToProviders.evalId, this.id)).run();
      db.delete(evalResultsTable).where(eq(evalResultsTable.evalId, this.id)).run();
      db.delete(evalsTable).where(eq(evalsTable.id, this.id)).run();
    });
  }
}
