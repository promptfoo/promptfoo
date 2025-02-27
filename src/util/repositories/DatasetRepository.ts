import { desc, eq } from 'drizzle-orm';
import { BaseRepository } from './BaseRepository';
import { 
  datasetsTable, 
  evalsTable, 
  evalsToDatasetsTable 
} from '../../database/tables';
import { 
  type TestCasesWithMetadata,
  type TestCasesWithMetadataPrompt,
  type ResultsFile, 
  type TestCase 
} from '../../types';
import Eval from '../../models/eval';
import { sha256 } from '../createHash';

/**
 * Repository for working with test case datasets
 */
export class DatasetRepository extends BaseRepository<TestCasesWithMetadata, string> {
  constructor() {
    super('datasets', 'id');
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
   * Create a properly typed prompt for test cases
   */
  private createTestCasePrompt(eval_: Eval, prompt: any): TestCasesWithMetadataPrompt {
    // Ensure prompt has all required fields
    const enhancedPrompt = {
      raw: prompt.raw,
      label: prompt.label || prompt.display || prompt.raw,
      provider: prompt.provider || 'unknown',
      ...prompt,
    };
    
    return {
      id: sha256(prompt.raw),
      prompt: enhancedPrompt,
      evalId: eval_.id,
    };
  }

  /**
   * Process database results to group datasets
   */
  private processTestCasesFromEvals(
    results: Array<{ datasetId: string; tests: any; evalId: string; createdAt: number }>,
    evalMap: Map<string, Eval>
  ): TestCasesWithMetadata[] {
    const groupedDatasets: Record<string, TestCasesWithMetadata> = {};
    
    for (const result of results) {
      const eval_ = evalMap.get(result.evalId);
      if (!eval_) {
        continue;
      }
      
      const { datasetId, tests } = result;
      const createdAt = new Date(result.createdAt).toISOString();
      
      // Helper function to get prompts from an eval with proper typing
      const getPromptItems = (eval_: Eval): TestCasesWithMetadataPrompt[] => {
        return eval_.getPrompts().map(prompt => this.createTestCasePrompt(eval_, prompt));
      };
      
      if (datasetId in groupedDatasets) {
        // Update existing dataset
        groupedDatasets[datasetId].recentEvalDate = new Date(
          Math.max(
            groupedDatasets[datasetId].recentEvalDate.getTime(),
            new Date(createdAt).getTime(),
          ),
        );
        groupedDatasets[datasetId].count += 1;
        
        // Add prompts if they don't already exist
        const newPrompts = getPromptItems(eval_);
        
        // Create a map of existing prompts by ID
        const promptsById: Record<string, TestCasesWithMetadataPrompt> = {};
        
        // Add existing prompts first
        for (const prompt of groupedDatasets[datasetId].prompts) {
          promptsById[prompt.id] = prompt;
        }
        
        // Then add new prompts
        for (const prompt of newPrompts) {
          if (!(prompt.id in promptsById)) {
            promptsById[prompt.id] = prompt;
          }
        }
        
        groupedDatasets[datasetId].prompts = Object.values(promptsById);
      } else {
        // Create new dataset entry
        const newPrompts = getPromptItems(eval_);
        
        groupedDatasets[datasetId] = {
          id: datasetId,
          count: 1,
          testCases: tests as TestCase[],
          recentEvalDate: new Date(createdAt),
          recentEvalId: eval_.id,
          prompts: newPrompts,
        };
      }
    }
    
    return Object.values(groupedDatasets);
  }

  /**
   * Get test case datasets with optional filtering
   */
  async getDatasets({
    limit = 100,
    filterPredicate,
  }: {
    limit?: number;
    filterPredicate?: (result: ResultsFile) => boolean;
  } = {}): Promise<TestCasesWithMetadata[]> {
    const db = this.getDb();
    
    // If we don't have a predicate, we can use an optimized query
    if (!filterPredicate) {
      // Directly query unique datasets with their associated prompts
      const results = await db
        .select({
          datasetId: datasetsTable.id,
          tests: datasetsTable.tests,
          evalId: evalsToDatasetsTable.evalId,
          createdAt: evalsTable.createdAt,
        })
        .from(datasetsTable)
        .innerJoin(
          evalsToDatasetsTable,
          eq(datasetsTable.id, evalsToDatasetsTable.datasetId)
        )
        .innerJoin(
          evalsTable,
          eq(evalsToDatasetsTable.evalId, evalsTable.id)
        )
        .orderBy(desc(evalsTable.createdAt))
        .limit(limit)
        .all();
      
      this.logDebug(`Found ${results.length} datasets`);
      
      // Batch load evals for all datasets
      const evalIds = [...new Set(results.map(r => r.evalId))];
      const evalMap = await this.batchLoadEvals(evalIds, 'datasets');
      
      // Process the results into grouped test case objects
      return this.processTestCasesFromEvals(results, evalMap);
    }
    
    // Fall back to original implementation for complex predicates
    const evals_ = await Eval.getMany(limit);
    const results = await Promise.all(evals_.map(async (eval_) => {
      const resultWrapper = await eval_.toResultsFile();
      
      if (filterPredicate && !filterPredicate(resultWrapper)) {
        return null;
      }
      
      const testCases = resultWrapper.config.tests;
      if (!testCases) {
        return null;
      }
      
      return {
        eval_,
        datasetId: sha256(JSON.stringify(testCases)),
        tests: testCases,
        evalId: eval_.id,
        createdAt: eval_.createdAt
      };
    }));
    
    // Filter out null results
    const filteredResults = results.filter(Boolean) as unknown as Array<{
      eval_: Eval;
      datasetId: string;
      tests: any;
      evalId: string;
      createdAt: number;
    }>;
    
    // Create eval map from already loaded evals
    const evalMap = new Map<string, Eval>();
    filteredResults.forEach(r => evalMap.set(r.evalId, r.eval_));
    
    // Process the filtered results
    return this.processTestCasesFromEvals(filteredResults, evalMap);
  }

  /**
   * Find a dataset by its hash prefix
   */
  async getDatasetByHash(hash: string): Promise<TestCasesWithMetadata | undefined> {
    const datasets = await this.getDatasets();
    return datasets.find(dataset => dataset.id.startsWith(hash));
  }
} 