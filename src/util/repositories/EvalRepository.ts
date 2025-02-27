import { desc, eq, like, and } from 'drizzle-orm';
import { BaseRepository } from './BaseRepository';
import {
  evalsTable,
  evalsToPromptsTable,
  evalsToDatasetsTable,
  evalsToTagsTable,
  evalResultsTable,
  tagsTable,
} from '../../database/tables';
import Eval, { createEvalId } from '../../models/eval';
import {
  type EvalWithMetadata,
  type ResultsFile,
  type UnifiedConfig,
  type EvaluateSummaryV2,
  type CompletedPrompt,
} from '../../types';
import invariant from '../invariant';
import { sha256 } from '../createHash';
import { getAuthor } from '../../globalConfig/accounts';
import { sql } from 'drizzle-orm';

/**
 * Repository for working with evaluation data
 */
export class EvalRepository extends BaseRepository<EvalWithMetadata, string> {
  constructor() {
    super('evals', 'id', true); // Enable caching
  }

  /**
   * Write evaluation results to the database
   */
  async writeResults(
    results: EvaluateSummaryV2,
    config: Partial<UnifiedConfig>,
    createdAt: Date = new Date(),
  ): Promise<string> {
    createdAt = createdAt || (results.timestamp ? new Date(results.timestamp) : new Date());
    const evalId = createEvalId(createdAt);
    const db = this.getDb();
    
    const promises = [];
    promises.push(
      db
        .insert(evalsTable)
        .values({
          id: evalId,
          createdAt: createdAt.getTime(),
          author: getAuthor(),
          description: config.description,
          config,
          results,
        })
        .onConflictDoNothing()
        .run(),
    );

    this.logDebug(`Inserting eval ${evalId}`);

    // Record prompt relation
    invariant(results.table, 'Table is required');

    for (const prompt of results.table.head.prompts) {
      const promptId = sha256(prompt.raw);

      promises.push(
        db
          .insert(evalsToPromptsTable)
          .values({
            evalId,
            promptId,
          })
          .onConflictDoNothing()
          .run(),
      );

      this.logDebug(`Inserting prompt relation ${promptId}`);
    }

    // Record dataset relation
    const datasetId = sha256(JSON.stringify(config.tests || []));
    promises.push(
      db
        .insert(evalsToDatasetsTable)
        .values({
          evalId,
          datasetId,
        })
        .onConflictDoNothing()
        .run(),
    );

    this.logDebug(`Inserting dataset relation ${datasetId}`);

    // Record tags
    if (config.tags) {
      for (const [tagKey, tagValue] of Object.entries(config.tags)) {
        const tagId = sha256(`${tagKey}:${tagValue}`);

        promises.push(
          db
            .insert(evalsToTagsTable)
            .values({
              evalId,
              tagId,
            })
            .onConflictDoNothing()
            .run(),
        );

        this.logDebug(`Inserting tag relation ${tagId}`);
      }
    }

    this.logDebug(`Awaiting ${promises.length} promises to database...`);
    await Promise.all(promises);

    return evalId;
  }

  /**
   * Read a result by ID
   */
  async readResult(id: string): Promise<{ id: string; result: ResultsFile; createdAt: Date } | undefined> {
    try {
      const eval_ = await Eval.findById(id);
      invariant(eval_, `Eval with ID ${id} not found.`);
      
      return {
        id,
        result: await eval_.toResultsFile(),
        createdAt: new Date(eval_.createdAt),
      };
    } catch (err) {
      this.handleError('read result', err, id);
      return undefined;
    }
  }

  /**
   * Update a result by ID
   */
  async updateResult(
    id: string,
    newConfig?: Partial<UnifiedConfig>,
    newTable?: any,
  ): Promise<void> {
    try {
      // Fetch the existing eval data from the database
      const existingEval = await Eval.findById(id);

      if (!existingEval) {
        this.logDebug(`Eval with ID ${id} not found.`);
        return;
      }

      if (newConfig) {
        existingEval.config = newConfig;
      }
      if (newTable) {
        existingEval.setTable(newTable);
      }

      await existingEval.save();

      this.logDebug(`Updated eval with ID ${id}`);
    } catch (err) {
      this.handleError('update eval', err, id);
    }
  }

  /**
   * Get evaluation by ID prefix
   */
  async getById(hash: string): Promise<EvalWithMetadata | undefined> {
    const db = this.getDb();
    
    const results = await db
      .select({
        id: evalsTable.id,
        createdAt: evalsTable.createdAt,
        author: evalsTable.author,
        results: evalsTable.results,
        config: evalsTable.config,
        description: evalsTable.description,
      })
      .from(evalsTable)
      .where(like(evalsTable.id, `${hash}%`))
      .limit(1)
      .all();
      
    if (results.length > 0) {
      const eval_ = results[0];
      return {
        id: eval_.id,
        date: new Date(eval_.createdAt),
        config: eval_.config,
        // We're using the database type which might be EvaluateSummaryV2
        // but the TypeScript type expects EvaluateSummaryV3
        results: eval_.results as any,
        description: eval_.description || undefined,
      };
    }
    
    return undefined;
  }

  /**
   * Delete an evaluation by ID
   */
  async deleteById(evalId: string): Promise<boolean> {
    try {
      const db = this.getDb();
      await db.transaction(async () => {
        // We need to clean up foreign keys first
        await db.delete(evalsToPromptsTable).where(eq(evalsToPromptsTable.evalId, evalId)).run();
        await db.delete(evalsToDatasetsTable).where(eq(evalsToDatasetsTable.evalId, evalId)).run();
        await db.delete(evalsToTagsTable).where(eq(evalsToTagsTable.evalId, evalId)).run();
        await db.delete(evalResultsTable).where(eq(evalResultsTable.evalId, evalId)).run();

        // Finally, delete the eval record
        const deletedIds = await db.delete(evalsTable).where(eq(evalsTable.id, evalId)).run();
        if (deletedIds.changes === 0) {
          throw new Error(`Eval with ID ${evalId} not found`);
        }
      });
      return true;
    } catch (err) {
      this.handleError('delete eval', err, evalId);
      return false;
    }
  }

  /**
   * Delete all evaluations
   */
  async deleteAll(): Promise<boolean> {
    try {
      const db = this.getDb();
      await db.transaction(async (tx) => {
        await tx.delete(evalResultsTable).run();
        await tx.delete(evalsToPromptsTable).run();
        await tx.delete(evalsToDatasetsTable).run();
        await tx.delete(evalsToTagsTable).run();
        await tx.delete(evalsTable).run();
      });
      return true;
    } catch (err) {
      this.handleError('delete all evals', err);
      return false;
    }
  }

  /**
   * Get many evaluations with filters
   */
  async getMany({
    limit = 100,
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
    
    // Process results into EvalWithMetadata objects
    return results.map((eval_) => ({
      id: eval_.id,
      date: new Date(eval_.createdAt),
      config: eval_.config,
      results: eval_.results as any,
      description: eval_.description || undefined,
    }));
  }

  /**
   * Get standalone evaluations with caching
   */
  async getStandaloneEvals({
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
    if (this.cache) {
      const cachedResult = this.cache.get<Array<CompletedPrompt & {
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

    // Cache the result if we have a cache
    if (this.cache) {
      this.cache.set(cacheKey, standaloneEvals);
    }
    
    return standaloneEvals;
  }
} 