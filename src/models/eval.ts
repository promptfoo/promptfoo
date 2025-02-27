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
import { BaseModel } from './BaseModel';

/**
 * Interface for minimal evaluation metadata returned by query functions
 */
export interface EvalWithMetadata {
  id: string;
  date: Date; // Note: this is the date field, not createdAt
  config: Partial<UnifiedConfig>;
  results: any;
  description?: string;
  
  // Helper methods to make this compatible with Eval class in existing code
  getPrompts(): CompletedPrompt[];
  toResultsFile(): Promise<ResultsFile>;
  
  // Add createdAt to match Eval properties - this is required, not optional
  createdAt: number;
}

/**
 * Create a unique evaluation ID with a timestamp
 */
export function createEvalId(createdAt: Date = new Date()) {
  return `eval-${randomSequence(3)}-${createdAt.toISOString().slice(0, 19)}`;
}

/**
 * Main evaluation model class using Active Record pattern
 * Extends BaseModel for common functionality
 */
export default class Eval extends BaseModel {
  id: string;
  createdAt: number;
  author?: string;
  description?: string;
  config: Partial<UnifiedConfig>;
  results: EvalResult[];
  resultsCount: number;
  datasetId?: string;
  prompts: CompletedPrompt[];
  oldResults?: EvaluateSummaryV2;
  persisted: boolean;

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
    super(); // Call parent constructor
    const createdAt = opts?.createdAt || new Date();
    this.createdAt = createdAt.getTime();
    this.id = opts?.id || createEvalId(createdAt);
    this.author = opts?.author;
    this.description = opts?.description || config.description;
    this.config = config;
    this.results = [];
    this.resultsCount = 0;
    this.prompts = opts?.prompts || [];
    this.datasetId = opts?.datasetId;
    this.persisted = opts?.persisted || false;
  }

  /**
   * Convert current instance to EvalWithMetadata interface
   */
  toEvalWithMetadata(): EvalWithMetadata {
    const id = this.id;
    return {
      id: this.id,
      date: new Date(this.createdAt),
      createdAt: this.createdAt,
      config: this.config,
      results: this.oldResults || {},
      description: this.description,
      
      // Add methods to make it compatible with Eval class
      getPrompts() {
        if (this.results && 'table' in this.results) {
          return this.results.table?.head.prompts || [];
        }
        return [];
      },
      
      async toResultsFile() {
        const fullEval = await Eval.findById(id);
        if (!fullEval) {
          throw new Error(`Eval with ID ${id} not found when trying to convert to ResultsFile`);
        }
        return fullEval.toResultsFile();
      }
    };
  }

  /**
   * Get most recent evaluation
   */
  static async latest() {
    const db = this.getDb();
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

  /**
   * Find an evaluation by ID
   */
  static async findById(id: string) {
    const db = this.getDb();

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

  /**
   * Overloaded getMany method to support both number and object parameter
   * For backward compatibility
   */
  static async getMany(limitOrOptions?: number | {
    limit?: number;
    description?: string;
    datasetId?: string;
  }): Promise<EvalWithMetadata[]> {
    // Handle the case where only a number is passed
    if (typeof limitOrOptions === 'number' || limitOrOptions === undefined) {
      return this.getManyWithOptions({
        limit: typeof limitOrOptions === 'number' ? limitOrOptions : DEFAULT_QUERY_LIMIT
      });
    }
    
    // Otherwise, it's already an options object
    return this.getManyWithOptions(limitOrOptions);
  }

  /**
   * Internal implementation of getMany that always takes an options object
   */
  private static async getManyWithOptions({
    limit = DEFAULT_QUERY_LIMIT,
    description,
    datasetId,
  }: {
    limit?: number;
    description?: string;
    datasetId?: string;
  } = {}): Promise<EvalWithMetadata[]> {
    const db = this.getDb();
    
    // Build query with specific filters
    const query = db
      .select({
        id: evalsTable.id,
        createdAt: evalsTable.createdAt,
        author: evalsTable.author,
        results: evalsTable.results,
        config: evalsTable.config,
        description: evalsTable.description,
      })
      .from(evalsTable);
      
    // Add join and condition if filtering by datasetId
    if (datasetId) {
      query
        .innerJoin(
          evalsToDatasetsTable,
          eq(evalsTable.id, evalsToDatasetsTable.evalId)
        )
        .where(eq(evalsToDatasetsTable.datasetId, datasetId));
    }
    
    // Add description filter if needed
    if (description) {
      query.where(
        datasetId 
          ? and(eq(evalsToDatasetsTable.datasetId, datasetId), like(evalsTable.description, `%${description}%`))
          : like(evalsTable.description, `%${description}%`)
      );
    }
    
    const results = await query
      .orderBy(desc(evalsTable.createdAt))
      .limit(limit)
      .all();
    
    this.logDebug(`Found ${results.length} evals with query filters`);
    
    // Process results into EvalWithMetadata objects with method implementations
    return results.map((eval_) => {
      // Create an evaluation ID and closure to efficiently implement methods on the metadata object
      const evalId = eval_.id;
      const metadata: EvalWithMetadata = {
        id: evalId,
        date: new Date(eval_.createdAt),
        createdAt: eval_.createdAt,
        config: eval_.config,
        results: eval_.results as any,
        description: eval_.description || undefined,
        
        // Implement methods that delegate to the Eval class
        getPrompts() {
          if (this.results && 'table' in this.results) {
            return this.results.table?.head.prompts || [];
          }
          return [];
        },
        
        async toResultsFile() {
          const fullEval = await Eval.findById(evalId);
          if (!fullEval) {
            throw new Error(`Eval with ID ${evalId} not found when trying to convert to ResultsFile`);
          }
          return fullEval.toResultsFile();
        }
      };
      
      return metadata;
    });
  }

  /**
   * Get standalone evaluations with caching
   */
  static async getStandaloneEvals({
    limit = 100,
    tag,
    description,
  }: {
    limit?: number;
    tag?: { key: string; value: string };
    description?: string;
  } = {}): Promise<Array<CompletedPrompt & {
    evalId: string;
    description: string | null;
    datasetId: string | null;
    promptId: string | null;
    isRedteam: boolean;
    createdAt: number;
    pluginFailCount: Record<string, number>;
    pluginPassCount: Record<string, number>;
  }>> {
    const db = this.getDb();
    
    const cacheKey = `standalone_evals_${limit}_${tag?.key}_${tag?.value}_${description || ''}`;
    // Check if we have a cache
    const cache = this.getModelCache();
    const cachedResult = cache.get<Array<CompletedPrompt & {
      evalId: string;
      description: string | null;
      datasetId: string | null;
      promptId: string | null;
      isRedteam: boolean;
      createdAt: number;
      pluginFailCount: Record<string, number>;
      pluginPassCount: Record<string, number>;
    }>>(cacheKey);
    
    if (cachedResult) {
      return cachedResult;
    }
    
    const results = db
      .select({
        evalId: evalsTable.id,
        description: evalsTable.description,
        results: evalsTable.results,
        createdAt: evalsTable.createdAt,
        promptId: evalsToPromptsTable.promptId,
        datasetId: evalsToDatasetsTable.datasetId,
        tagName: tagsTable.name,
        tagValue: tagsTable.value,
        isRedteam: sql`json_extract(evals.config, '$.redteam') IS NOT NULL`.as('isRedteam'),
      })
      .from(evalsTable)
      .leftJoin(evalsToPromptsTable, eq(evalsTable.id, evalsToPromptsTable.evalId))
      .leftJoin(evalsToDatasetsTable, eq(evalsTable.id, evalsToDatasetsTable.evalId))
      .leftJoin(evalsToTagsTable, eq(evalsTable.id, evalsToTagsTable.evalId))
      .leftJoin(tagsTable, eq(evalsToTagsTable.tagId, tagsTable.id))
      .where(
        and(
          tag ? and(eq(tagsTable.name, tag.key), eq(tagsTable.value, tag.value)) : undefined,
          description ? eq(evalsTable.description, description) : undefined,
        ),
      )
      .orderBy(desc(evalsTable.createdAt))
      .limit(limit)
      .all();

    const standaloneEvals = (
      await Promise.all(
        results.map(async (result) => {
          const {
            description,
            createdAt,
            evalId,
            promptId,
            datasetId,
            isRedteam,
          } = result;
          const eval_ = await Eval.findById(evalId);
          invariant(eval_, `Eval with ID ${evalId} not found`);
          const table = (await eval_.getTable()) || { body: [] };
          
          return eval_.getPrompts().map((col, index) => {
            // Compute some stats
            const pluginCounts = table.body.reduce(
              (acc, row) => {
                const pluginId = row.test.metadata?.pluginId;
                if (pluginId) {
                  const isPass = row.outputs[index].pass;
                  acc.pluginPassCount[pluginId] =
                    (acc.pluginPassCount[pluginId] || 0) + (isPass ? 1 : 0);
                  acc.pluginFailCount[pluginId] =
                    (acc.pluginFailCount[pluginId] || 0) + (isPass ? 0 : 1);
                }
                return acc;
              },
              { pluginPassCount: {}, pluginFailCount: {} } as {
                pluginPassCount: Record<string, number>;
                pluginFailCount: Record<string, number>;
              },
            );

            return {
              evalId,
              description,
              promptId,
              datasetId,
              createdAt,
              isRedteam: isRedteam as boolean,
              ...pluginCounts,
              ...col,
            };
          });
        }),
      )
    ).flat();

    // Cache the result
    cache.set(cacheKey, standaloneEvals);
    
    return standaloneEvals;
  }

  /**
   * Delete all evaluations from the database
   */
  static async deleteAll(): Promise<boolean> {
    try {
      return await this.transaction(async (tx) => {
        await tx.delete(evalResultsTable).run();
        await tx.delete(evalsToPromptsTable).run();
        await tx.delete(evalsToDatasetsTable).run();
        await tx.delete(evalsToTagsTable).run();
        await tx.delete(evalsTable).run();
        
        this.logDebug('All evaluations deleted successfully');
        this.clearModelCache();
        return true;
      });
    } catch (err) {
      this.handleError('delete all evals', err);
      return false;
    }
  }

  /**
   * Get vars from evaluations
   */
  static async getVarsFromEvals(evals: Eval[]) {
    const db = this.getDb();
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

  /**
   * Create a new evaluation
   */
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
    const db = this.getDb();
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

        this.logDebug(`Inserting prompt ${promptId}`);
      }
      if (opts?.results && opts.results.length > 0) {
        const res = await tx
          .insert(evalResultsTable)
          .values(opts.results?.map((r) => ({ ...r, evalId, id: randomUUID() })))
          .run();
        this.logDebug(`Inserted ${res.changes} eval results`);
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

      this.logDebug(`Inserting dataset ${datasetId}`);

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
    this.resultsCount++;
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

  async setResults(results: EvalResult[]) {
    this.results = results;
    this.resultsCount = results.length;
    if (this.persisted) {
      const db = getDb();
      await db.insert(evalResultsTable).values(results.map((r) => ({ ...r, evalId: this.id })));
    }
  }

  async loadResults() {
    this.results = await EvalResult.findManyByEvalId(this.id);
    this.resultsCount = this.results.length;
  }

  async getResults(): Promise<EvaluateResult[] | EvalResult[]> {
    if (this.useOldResults()) {
      invariant(this.oldResults, 'Old results not found');
      return this.oldResults.results;
    }
    await this.loadResults();
    return this.results;
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
    await db.transaction(() => {
      db.delete(evalsToDatasetsTable).where(eq(evalsToDatasetsTable.evalId, this.id)).run();
      db.delete(evalsToPromptsTable).where(eq(evalsToPromptsTable.evalId, this.id)).run();
      db.delete(evalsToTagsTable).where(eq(evalsToTagsTable.evalId, this.id)).run();

      db.delete(evalResultsTable).where(eq(evalResultsTable.evalId, this.id)).run();
      db.delete(evalsTable).where(eq(evalsTable.id, this.id)).run();
    });
  }
}

/**
 * Namespace for static evaluation utilities used in other parts of the codebase
 * Maintains backward compatibility with existing code
 */
export namespace EvalQueries {
  /**
   * Get vars from evaluations - renamed to work with both EvalWithMetadata and Eval 
   */
  export async function getVarsFromEvals(evals: EvalWithMetadata[] | Eval[]) {
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
