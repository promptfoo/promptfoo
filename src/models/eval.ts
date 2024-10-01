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
  testCaseResults,
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
import { sha256 } from '../util/createHash';
import type Provider from './provider';
import TestCaseResult from './test_case_result';

export function getEvalId(createdAt: Date = new Date()) {
  return `eval-${createdAt.toISOString().slice(0, 19)}`;
}

export default class Eval {
  id: string;
  createdAt: number;
  author?: string;
  description?: string;
  config: Partial<UnifiedConfig>;
  results: TestCaseResult[];
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
        numTests: sql`MAX(${testCaseResults.testCaseIdx} + 1)`.as('numTests'),
        datasetId: evalsToDatasets.datasetId,
      })
      .from(evalsTable)
      .leftJoin(evalsToDatasets, eq(evalsTable.id, evalsToDatasets.evalId))
      .leftJoin(testCaseResults, eq(evalsTable.id, testCaseResults.evalId))
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

    const [evals, results] = await Promise.all([
      db.select().from(evalsTable).where(eq(evalsTable.id, id)),
      db.select().from(testCaseResults).where(eq(testCaseResults.evalId, id)).execute(),

      db
        .select({
          id: promptsTable.id,
          prompt: promptsTable.prompt,
        })
        .from(evalsToPrompts)
        .leftJoin(promptsTable, eq(evalsToPrompts.promptId, promptsTable.id))
        .where(eq(evalsToPrompts.evalId, id))
        .execute(),
    ]);

    if (evals.length === 0) {
      return undefined;
    }
    const eval_ = evals[0];

    const evalInstance = new Eval(eval_.config, {
      id: eval_.id,
      createdAt: new Date(eval_.createdAt),
      author: eval_.author || undefined,
      description: eval_.description || undefined,
      prompts: eval_.prompts || [],
    });
    if (results.length > 0) {
      evalInstance.results = results.map((r) => new TestCaseResult(r));
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
    },
  ) {
    const createdAt = opts?.createdAt || new Date();
    this.createdAt = createdAt.getTime();
    this.id = opts?.id || getEvalId(createdAt);
    this.author = opts?.author;
    this.config = config;
    this.results = [];
    this.prompts = opts?.prompts || [];
  }

  isVersion3() {
    return this.oldResults && 'table' in this.oldResults;
  }

  setTable(table: EvaluateTable) {
    invariant(this.isVersion3(), 'Eval is not version 3');
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

    if (this.isVersion3()) {
      invariant(this.oldResults, 'Old results not found');
      updateObj.results = this.oldResults;
    }
    await db.update(evalsTable).set(updateObj).where(eq(evalsTable.id, this.id)).run();
  }

  getPrompts() {
    if (this.isVersion3()) {
      invariant(this.oldResults, 'Old results not found');
      return this.oldResults.table?.head.prompts || [];
    }
    return this.prompts;
  }

  async getTable() {
    if (this.isVersion3()) {
      invariant(this.oldResults, 'Old results not found');
      return this.oldResults.table;
    }
    return convertResultsToTable(await this.toResultsFile());
  }

  async addResult(result: EvaluateResult, columnIdx: number, rowIdx: number, test: AtomicTestCase) {
    const newResult = await TestCaseResult.create(this.id, result, columnIdx, rowIdx, test);
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
        console.log({ id, evalId: this.id });
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
    this.results = await TestCaseResult.findManyByEvalId(this.id);
  }

  async toEvaluateSummary(): Promise<EvaluateSummary> {
    if (this.isVersion3()) {
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

  async toResultsFile(): Promise<ResultsFile> {
    const summary = await this.toEvaluateSummary();
    return {
      version: this.isVersion3() ? 3 : 4,
      createdAt: new Date(this.createdAt).toISOString(),
      results: summary,
      config: this.config,
      author: this.author || null,
      prompts: this.prompts,
      datasetId: this.datasetId || null,
    };
  }
}
