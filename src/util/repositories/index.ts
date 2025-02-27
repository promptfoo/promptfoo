import { EvalRepository } from './EvalRepository';
import { PromptRepository } from './PromptRepository';
import Eval from '../../models/eval';
import type {
  EvalWithMetadata,
  EvaluateSummaryV2,
  ResultsFile,
  UnifiedConfig,
  CompletedPrompt,
} from '../../types';

// Create instance of eval repository for operations not yet migrated to model
const evalRepository = new EvalRepository();

// Define the StandaloneEval type locally if it's not in the types file
type StandaloneEval = CompletedPrompt & {
  evalId: string;
  description: string | null;
  datasetId: string | null;
  promptId: string | null;
  isRedteam: boolean;
  createdAt: number;
  pluginFailCount: Record<string, number>;
  pluginPassCount: Record<string, number>;
};

/**
 * Facade for database repositories using a mix of repositories and enhanced models
 * This is a transitional layer during migration to Active Record pattern
 */
const DatabaseRepository = {
  /**
   * Get evaluations from the database
   */
  async getEvals(
    limit: number = 100,
    options: { description?: string; datasetId?: string } = {}
  ): Promise<EvalWithMetadata[]> {
    return Eval.getMany({
      limit,
      description: options.description,
      datasetId: options.datasetId
    });
  },

  /**
   * Write results to the database
   */
  async writeResults(
    results: EvaluateSummaryV2,
    config: Partial<UnifiedConfig>,
    createdAt: Date = new Date()
  ): Promise<string> {
    return evalRepository.writeResults(results, config, createdAt);
  },

  /**
   * Get standalone evaluations from the database
   */
  async getStandaloneEvals({
    limit = 100,
    tag,
    description,
  }: {
    limit?: number;
    tag?: { key: string; value: string };
    description?: string;
  } = {}): Promise<StandaloneEval[]> {
    return Eval.getStandaloneEvals({ limit, tag, description });
  },

  /**
   * Get prompts with a predicate
   */
  async getPromptsWithPredicate(
    predicate: (result: ResultsFile) => boolean,
    limit: number
  ): Promise<any[]> {
    // Use the repository since the model doesn't have this method yet
    const promptRepository = new PromptRepository();
    return promptRepository.getPrompts({ limit, filterPredicate: predicate });
  },

  /**
   * Delete all evaluations
   */
  async deleteAllEvals(): Promise<boolean> {
    return Eval.deleteAll();
  },
};

export default DatabaseRepository; 