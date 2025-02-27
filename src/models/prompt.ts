import type { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { sha256 } from '../util/createHash';
import type { PromptSchema } from '../validators/prompts';
import { getDb } from '../database';
import { evalsTable, evalsToDatasetsTable } from '../database/tables';
import Eval from './eval';
import logger from '../logger';
import type { PromptWithMetadata } from '../types';

type PromptModel = z.infer<typeof PromptSchema>;

export function generateIdFromPrompt(prompt: PromptModel) {
  return prompt.id || prompt.label
    ? sha256(prompt.label)
    : sha256(typeof prompt.raw === 'object' ? JSON.stringify(prompt.raw) : prompt.raw);
}

/**
 * Model class for working with Prompts
 */
export default class Prompt {
  /**
   * Helper function to batch load Eval instances
   */
  private static async batchLoadEvals(evalIds: string[], context?: string): Promise<Map<string, Eval>> {
    const contextStr = context ? ` for ${context}` : '';
    logger.debug(`Batch loading ${evalIds.length} evals${contextStr}`);
    
    // Fetch all Eval instances in parallel
    const evalPromises = evalIds.map(id => Eval.findById(id));
    const evals = await Promise.all(evalPromises);
    
    // Create a lookup map for faster access
    const evalMap = new Map<string, Eval>();
    evalIds.forEach((id, index) => {
      const eval_ = evals[index];
      if (eval_) {
        evalMap.set(id, eval_);
      }
    });
    
    return evalMap;
  }

  /**
   * Process database results to group prompts with common metrics
   */
  private static processPromptsFromEvals(
    results: Array<{ evalId: string; createdAt: number }>,
    evalMap: Map<string, Eval>,
    datasetId?: string
  ): PromptWithMetadata[] {
    const groupedPrompts: Record<string, PromptWithMetadata> = {};
    
    // Process each result
    for (const result of results) {
      const eval_ = evalMap.get(result.evalId);
      if (!eval_) {
        continue;
      }
      
      const createdAt = new Date(result.createdAt).toISOString();
      
      // Process prompts from this eval
      for (const prompt of eval_.getPrompts()) {
        const promptId = sha256(prompt.raw);
        const currentDatasetId = datasetId || '-';
        
        if (promptId in groupedPrompts) {
          // Update existing prompt group
          groupedPrompts[promptId].recentEvalDate = new Date(
            Math.max(
              groupedPrompts[promptId].recentEvalDate.getTime(),
              new Date(createdAt).getTime(),
            ),
          );
          groupedPrompts[promptId].count += 1;
          groupedPrompts[promptId].evals.push({
            id: eval_.id,
            datasetId: currentDatasetId,
            metrics: prompt.metrics,
          });
        } else {
          // Create new prompt group
          groupedPrompts[promptId] = {
            count: 1,
            id: promptId,
            prompt,
            recentEvalDate: new Date(createdAt),
            recentEvalId: eval_.id,
            evals: [
              {
                id: eval_.id,
                datasetId: currentDatasetId,
                metrics: prompt.metrics,
              },
            ],
          };
        }
      }
    }
    
    return Object.values(groupedPrompts);
  }

  /**
   * Get prompts by dataset ID
   */
  static async getByDatasetId(
    datasetId: string,
    limit: number = 100
  ): Promise<PromptWithMetadata[]> {
    const db = getDb();
    const startTime = performance.now();
    
    // Query for evals with the specified dataset ID
    const results = await db
      .select({
        evalId: evalsTable.id,
        createdAt: evalsTable.createdAt,
      })
      .from(evalsTable)
      .innerJoin(
        evalsToDatasetsTable, 
        eq(evalsTable.id, evalsToDatasetsTable.evalId)
      )
      .where(eq(evalsToDatasetsTable.datasetId, datasetId))
      .orderBy(desc(evalsTable.createdAt))
      .limit(limit)
      .all();
    
    // Batch load the evals
    const evalIds = results.map(r => r.evalId);
    const evalMap = await Prompt.batchLoadEvals(evalIds, `dataset ${datasetId}`);
    
    // Process the results into grouped prompt objects
    const prompts = Prompt.processPromptsFromEvals(results, evalMap, datasetId);
    
    const endTime = performance.now();
    logger.debug(`getByDatasetId execution time: ${(endTime - startTime).toFixed(2)}ms`);
    
    return prompts;
  }

  /**
   * Find a prompt by its hash prefix
   */
  static async getByHash(hash: string): Promise<PromptWithMetadata | undefined> {
    // Get all prompts and find the one with matching hash prefix
    const db = getDb();
    const results = await db
      .select({
        evalId: evalsTable.id,
        createdAt: evalsTable.createdAt,
      })
      .from(evalsTable)
      .orderBy(desc(evalsTable.createdAt))
      .limit(100)
      .all();
    
    // Batch load the evals
    const evalIds = results.map(r => r.evalId);
    const evalMap = await Prompt.batchLoadEvals(evalIds);
    
    // Process the results into grouped prompt objects
    const prompts = Prompt.processPromptsFromEvals(results, evalMap);
    
    // Find the prompt with matching hash prefix
    return prompts.find(prompt => prompt.id.startsWith(hash));
  }
}
