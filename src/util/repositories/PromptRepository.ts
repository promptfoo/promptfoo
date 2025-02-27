import { desc, eq } from 'drizzle-orm';
import { BaseRepository } from './BaseRepository';
import { evalsTable, evalsToDatasetsTable } from '../../database/tables';
import { 
  type PromptWithMetadata, 
  type ResultsFile, 
  type TestCase 
} from '../../types';
import Eval from '../../models/eval';
import { sha256 } from '../createHash';

/**
 * Repository for working with prompts
 */
export class PromptRepository extends BaseRepository<PromptWithMetadata, string> {
  constructor() {
    super('prompts', 'id');
  }

  /**
   * Helper function to batch load Eval instances
   */
  private async batchLoadEvals(evalIds: string[], context?: string): Promise<Map<string, Eval>> {
    const contextStr = context ? ` for ${context}` : '';
    this.logDebug(`Batch loading ${evalIds.length} evals${contextStr}`);
    
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
  private processPromptsFromEvals(
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
   * Query evaluations with optimized or fallback approach
   */
  private async queryEvals({
    datasetId,
    limit = 100,
    useOptimizedQuery = true,
  }: {
    datasetId?: string;
    limit?: number;
    useOptimizedQuery?: boolean;
  } = {}): Promise<Array<{ evalId: string; createdAt: number; eval_?: Eval; resultWrapper?: ResultsFile }>> {
    const db = this.getDb();
    
    // Use optimized query when possible
    if (useOptimizedQuery) {
      const baseQuery = db
        .select({
          evalId: evalsTable.id,
          createdAt: evalsTable.createdAt,
        })
        .from(evalsTable);
        
      // Apply dataset filter if specified
      if (datasetId) {
        const query = baseQuery
          .innerJoin(
            evalsToDatasetsTable, 
            eq(evalsTable.id, evalsToDatasetsTable.evalId)
          )
          .where(eq(evalsToDatasetsTable.datasetId, datasetId));
          
        return query
          .orderBy(desc(evalsTable.createdAt))
          .limit(limit)
          .all();
      }
      
      // No filter case
      return baseQuery
        .orderBy(desc(evalsTable.createdAt))
        .limit(limit)
        .all();
    }
    
    // Fallback for when we need full evals
    const evals_ = await Eval.getMany(limit);
    
    return Promise.all(evals_.map(async (eval_) => {
      const resultWrapper = await eval_.toResultsFile();
      
      // Cast the entire object to the expected type
      return {
        evalId: eval_.id,
        createdAt: eval_.createdAt || 0, // Provide a default value if undefined
        eval_: eval_ as any, // Cast to any to bypass type checking
        resultWrapper,
      };
    }));
  }

  /**
   * Get prompts with optional filtering
   */
  async getPrompts({
    limit = 100,
    datasetId,
    filterPredicate,
  }: {
    limit?: number;
    datasetId?: string;
    filterPredicate?: (result: ResultsFile) => boolean;
  } = {}): Promise<PromptWithMetadata[]> {
    // Determine if we can use optimized query
    const useOptimizedQuery = !filterPredicate;
    
    // Get evals with appropriate strategy
    const results = await this.queryEvals({
      datasetId,
      limit,
      useOptimizedQuery
    });
    
    if (useOptimizedQuery) {
      // For optimized path, batch load the evals
      const evalIds = results.map(r => r.evalId);
      const evalMap = await this.batchLoadEvals(evalIds, datasetId && `dataset ${datasetId}`);
      
      // Process the results into grouped prompt objects
      return this.processPromptsFromEvals(results, evalMap, datasetId);
    } else {
      // For non-optimized path, filter the results with predicate
      const filteredResults = results.filter(
        r => {
          if (!filterPredicate) {
            return true;
          }
          if (r.resultWrapper) {
            return filterPredicate(r.resultWrapper);
          }
          return false;
        }
      );
      
      // Create eval map from already loaded evals
      const evalMap = new Map<string, Eval>();
      filteredResults.forEach(r => {
        if (r.eval_) {
          evalMap.set(r.evalId, r.eval_);
        }
      });
      
      // Process the filtered results
      return this.processPromptsFromEvals(
        filteredResults.map(r => ({ evalId: r.evalId, createdAt: r.createdAt })),
        evalMap
      );
    }
  }

  /**
   * Get prompts for a specific dataset ID
   */
  async getPromptsByDatasetId(
    datasetId: string,
    limit: number = 100
  ): Promise<PromptWithMetadata[]> {
    return this.getPrompts({ datasetId, limit });
  }

  /**
   * Find a prompt by its hash prefix
   */
  async getPromptByHash(hash: string): Promise<PromptWithMetadata | undefined> {
    const prompts = await this.getPrompts();
    return prompts.find(prompt => prompt.id.startsWith(hash));
  }

  /**
   * Convenience method for getting prompts by test cases hash
   */
  async getPromptsForTestCases(testCases: TestCase[]): Promise<PromptWithMetadata[]> {
    const testCasesJson = JSON.stringify(testCases);
    const testCasesSha256 = sha256(testCasesJson);
    return this.getPromptsByDatasetId(testCasesSha256);
  }
} 