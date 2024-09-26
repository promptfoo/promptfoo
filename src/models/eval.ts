import { desc, eq } from 'drizzle-orm';
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
  evalResult,
} from '../database/tables';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import type { EvaluateResult, Prompt, UnifiedConfig } from '../types';
import { sha256 } from '../util';
import EvalResult from './eval_result';

function getEvalId(createdAt: Date = new Date()) {
  return `eval-${createdAt.toISOString().slice(0, 19)}`;
}

export default class Eval {
  id: string;
  createdAt: number;
  author?: string;
  description?: string;
  config: Partial<UnifiedConfig>;
  results: EvalResult[];
  datasetId?: string;
  prompts: { id: string | null; prompt: string | null }[];

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

    const [eval_, results, promptsData] = await Promise.all([
      db.select().from(evals).where(eq(evals.id, id)),
      db.select().from(evalResult).where(eq(evalResult.evalId, id)).execute(),

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
    });

    evalInstance.results = results.map((r) => new EvalResult(r));

    evalInstance.prompts = promptsData
      .map((p) => ({ id: p.id, prompt: p.prompt }))
      .filter((p) => p.prompt !== null);

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
    const evalId = getEvalId(createdAt);
    const db = getDb();
    db.transaction((tx) => {
      tx.insert(evals)
        .values({
          id: evalId,
          createdAt: createdAt.getTime(),
          author,
          description: config.description,
          config,
          results: [], // Initialize as an empty array
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
    opts?: { id?: string; createdAt?: Date; author?: string; description?: string },
  ) {
    const createdAt = opts?.createdAt || new Date();
    this.createdAt = createdAt.getTime();
    this.id = opts?.id || getEvalId(createdAt);
    this.author = opts?.author;
    this.config = config;
    this.results = [];
    this.prompts = [];
  }

  async addResult(result: EvaluateResult, columnIdx: number, rowIdx: number, description?: string) {
    const newResult = await EvalResult.create(this.id, result, columnIdx, rowIdx, description);
    this.results.push(newResult);
  }
}
