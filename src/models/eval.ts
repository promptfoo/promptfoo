import { and, desc, eq, like, sql } from 'drizzle-orm';
import invariant from 'tiny-invariant';
import { getDb } from '../database';
import {
  datasets,
  evals,
  evalsToDatasets,
  evalsToPrompts,
  prompts as promptsTable,
  tags as tagsTable,
  evalsToTags,
  testCaseResults,
} from '../database/tables';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import type {
  AtomicTestCase,
  CompletedPrompt,
  EvaluateResult,
  Prompt,
  UnifiedConfig,
} from '../types';
import { DEFAULT_QUERY_LIMIT, sha256 } from '../util';
import TestCaseResult from './test_case_result';

function getEvalId(createdAt: Date = new Date()) {
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

  static async summaryResults(
    limit: number = DEFAULT_QUERY_LIMIT,
    filterDescription?: string,
    datasetId?: string,
  ) {
    const db = getDb();
    const startTime = performance.now();
    const query = db
      .select({
        evalId: evals.id,
        createdAt: evals.createdAt,
        description: evals.description,
        numTests: sql`MAX(${testCaseResults.testCaseIdx} + 1)`.as('numTests'),
        datasetId: evalsToDatasets.datasetId,
      })
      .from(evals)
      .leftJoin(evalsToDatasets, eq(evals.id, evalsToDatasets.evalId))
      .leftJoin(testCaseResults, eq(evals.id, testCaseResults.evalId))
      .where(
        and(
          datasetId ? eq(evalsToDatasets.datasetId, datasetId) : undefined,
          filterDescription ? like(evals.description, `%${filterDescription}%`) : undefined,
        ),
      )
      .groupBy(evals.id);

    const results = query.orderBy(desc(evals.createdAt)).limit(limit).all();

    const mappedResults = results.map((result) => ({
      evalId: result.evalId,
      createdAt: result.createdAt,
      description: result.description,
      numTests: result.numTests || 0,
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
        id: evals.id,
      })
      .from(evals)
      .orderBy(desc(evals.createdAt))
      .limit(1);

    if (db_results.length === 0) {
      return undefined;
    }

    return await Eval.findById(db_results[0].id);
  }
  static async findById(id: string) {
    const db = getDb();

    const [eval_, results] = await Promise.all([
      db.select().from(evals).where(eq(evals.id, id)),
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

    if (eval_.length === 0) {
      return undefined;
    }

    const evalInstance = new Eval(eval_[0].config, {
      id: eval_[0].id,
      createdAt: new Date(eval_[0].createdAt),
      author: eval_[0].author || undefined,
      description: eval_[0].description || undefined,
      prompts: eval_[0].prompts || [],
    });

    evalInstance.results = results.map((r) => new TestCaseResult(r));

    return evalInstance;
  }

  static create(
    config: Partial<UnifiedConfig>,
    renderedPrompts: Prompt[], // The config doesn't contain the actual prompts, so we need to pass them in separately
    id?: string,
    createdAt?: Date,
    author?: string,
  ) {
    createdAt = createdAt || new Date();
    const evalId = id || getEvalId(createdAt);
    const db = getDb();
    db.transaction((tx) => {
      tx.insert(evals)
        .values({
          id: evalId,
          createdAt: createdAt.getTime(),
          author,
          description: config.description,
          config,
        })
        .run();
      invariant(
        Array.isArray(config.prompts) && config.prompts.length > 0,
        'You must have at least 1 prompt',
      );
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
    return new Eval(config, { id: evalId, author });
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

  async addResult(result: EvaluateResult, columnIdx: number, rowIdx: number, test: AtomicTestCase) {
    const newResult = await TestCaseResult.create(this.id, result, columnIdx, rowIdx, test);
    this.results.push(newResult);
  }

  async addPrompts(prompts: CompletedPrompt[]) {
    this.prompts = prompts;
    const db = getDb();
    await db.update(evals).set({ prompts }).where(eq(evals.id, this.id)).run();
  }
}
