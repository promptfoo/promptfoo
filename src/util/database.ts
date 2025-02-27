import { desc, eq, like, and, sql, not } from 'drizzle-orm';
import { getDb } from '../database';
import {
  evalsTable,
  evalsToDatasetsTable,
} from '../database/tables';
import logger from '../logger';
import Eval, { getSummaryOfLatestEvals } from '../models/eval';
import Prompt from '../models/prompt';
import Dataset from '../models/dataset';
import {
  type EvalWithMetadata,
  type EvaluateTable,
  type PromptWithMetadata,
  type ResultsFile,
  type TestCase,
  type TestCasesWithMetadata,
  type UnifiedConfig,
  type CompletedPrompt,
  type ResultLightweight,
  type EvaluateSummaryV2,
} from '../types';
import invariant from '../util/invariant';
import DatabaseRepository from './repositories';
import { sha256 } from './createHash';

const DEFAULT_QUERY_LIMIT = 100;

/**
 * Write evaluation results to the database
 */
export async function writeResultsToDatabase(
  results: EvaluateSummaryV2,
  config: Partial<UnifiedConfig>,
  createdAt: Date = new Date(),
): Promise<string> {
  return DatabaseRepository.writeResults(results, config, createdAt);
}

/**
 * List the previous evaluation results
 */
export async function listPreviousResults(
  limit: number = DEFAULT_QUERY_LIMIT,
  filterDescription?: string,
  datasetId?: string,
): Promise<ResultLightweight[]> {
  const db = getDb();
  const startTime = performance.now();

  const query = db
    .select({
      evalId: evalsTable.id,
      createdAt: evalsTable.createdAt,
      description: evalsTable.description,
      numTests: sql<number>`json_array_length(${evalsTable.results}->'table'->'body')`,
      datasetId: evalsToDatasetsTable.datasetId,
      isRedteam: sql<boolean>`json_type(${evalsTable.config}, '$.redteam') IS NOT NULL`,
    })
    .from(evalsTable)
    .leftJoin(evalsToDatasetsTable, eq(evalsTable.id, evalsToDatasetsTable.evalId))
    .where(
      and(
        datasetId ? eq(evalsToDatasetsTable.datasetId, datasetId) : undefined,
        filterDescription ? like(evalsTable.description, `%${filterDescription}%`) : undefined,
        not(eq(evalsTable.results, {})),
      ),
    );

  const results = query.orderBy(desc(evalsTable.createdAt)).limit(limit).all();
  const mappedResults = results.map((result) => ({
    evalId: result.evalId,
    createdAt: result.createdAt,
    description: result.description,
    numTests: result.numTests,
    datasetId: result.datasetId,
    isRedteam: result.isRedteam,
  }));

  const endTime = performance.now();
  const executionTime = endTime - startTime;
  const evalResults = await getSummaryOfLatestEvals(undefined, filterDescription, datasetId);
  logger.debug(`listPreviousResults execution time: ${executionTime.toFixed(2)}ms`);
  const combinedResults = [...evalResults, ...mappedResults];
  return combinedResults;
}

/**
 * Read a result by ID
 */
export async function readResult(
  id: string,
): Promise<{ id: string; result: ResultsFile; createdAt: Date } | undefined> {
  try {
    const eval_ = await Eval.findById(id);
    invariant(eval_, `Eval with ID ${id} not found.`);
    
    return {
      id,
      result: await eval_.toResultsFile(),
      createdAt: new Date(eval_.createdAt),
    };
  } catch (err) {
    logger.error(`Failed to read result with ID ${id} from database:\n${err}`);
    return undefined;
  }
}

/**
 * Update a result by ID
 */
export async function updateResult(
  id: string,
  newConfig?: Partial<UnifiedConfig>,
  newTable?: EvaluateTable,
): Promise<void> {
  try {
    // Fetch the existing eval data from the database
    const existingEval = await Eval.findById(id);

    if (!existingEval) {
      logger.debug(`Eval with ID ${id} not found.`);
      return;
    }

    if (newConfig) {
      existingEval.config = newConfig;
    }
    if (newTable) {
      existingEval.setTable(newTable);
    }

    await existingEval.save();

    logger.debug(`Updated eval with ID ${id}`);
  } catch (err) {
    logger.error(`Failed to update eval with ID ${id} from database:\n${err}`);
  }
}

/**
 * Get the latest evaluation
 */
export async function getLatestEval(filterDescription?: string): Promise<ResultsFile | undefined> {
  const eval_ = await Eval.latest();
  return await eval_?.toResultsFile();
}

/**
 * Get prompts filtered by predicate
 */
export async function getPromptsWithPredicate(
  predicate: (result: ResultsFile) => boolean,
  limit: number,
): Promise<PromptWithMetadata[]> {
  return DatabaseRepository.getPromptsWithPredicate(predicate, limit);
}

/**
 * Get prompts by dataset ID hash
 */
export function getPromptsForTestCasesHash(
  testCasesSha256: string,
  limit: number = DEFAULT_QUERY_LIMIT,
) {
  return Prompt.getByDatasetId(testCasesSha256, limit);
}

/**
 * Get prompts for test cases
 */
export function getPromptsForTestCases(testCases: TestCase[]) {
  const testCasesJson = JSON.stringify(testCases);
  const testCasesSha256 = sha256(testCasesJson);
  return Prompt.getByDatasetId(testCasesSha256);
}

/**
 * Get test cases filtered by predicate
 */
export async function getTestCasesWithPredicate(
  predicate: (result: ResultsFile) => boolean,
  limit: number,
): Promise<TestCasesWithMetadata[]> {
  return Dataset.getWithPredicate(predicate, limit);
}

/**
 * Get all prompts
 */
export function getPrompts(limit: number = DEFAULT_QUERY_LIMIT) {
  // Query for all evals and extract prompts
  return Prompt.getByDatasetId('-', limit);
}

/**
 * Get all test cases
 */
export async function getTestCases(limit: number = DEFAULT_QUERY_LIMIT) {
  return Dataset.getAll(limit);
}

/**
 * Get a prompt by its hash
 */
export async function getPromptFromHash(hash: string) {
  return Prompt.getByHash(hash);
}

/**
 * Get a dataset by its hash
 */
export async function getDatasetFromHash(hash: string) {
  return Dataset.getByHash(hash);
}

/**
 * Get evaluations using the repository
 */
export async function getEvals(
  limit: number = DEFAULT_QUERY_LIMIT,
  options: { description?: string; datasetId?: string } = {}
): Promise<EvalWithMetadata[]> {
  return DatabaseRepository.getEvals(limit, options);
}

/**
 * Get an evaluation by ID
 */
export async function getEvalFromId(hash: string): Promise<EvalWithMetadata | undefined> {
  const eval_ = await Eval.findById(hash);
  if (!eval_) {
    return undefined;
  }
  
  return {
    id: eval_.id,
    date: new Date(eval_.createdAt),
    config: eval_.config,
    results: eval_.oldResults as any,
    description: eval_.description,
  };
}

/**
 * Delete an evaluation by ID
 */
export async function deleteEval(evalId: string): Promise<boolean> {
  try {
    const eval_ = await Eval.findById(evalId);
    if (!eval_) {
      logger.debug(`Eval with ID ${evalId} not found.`);
      return false;
    }
    
    await eval_.delete();
    return true;
  } catch (err) {
    logger.error(`Failed to delete eval with ID ${evalId} from database:\n${err}`);
    return false;
  }
}

/**
 * Delete all evaluations
 */
export async function deleteAllEvals(): Promise<boolean> {
  return DatabaseRepository.deleteAllEvals();
}

/**
 * Type definitions for standalone evaluations
 */
export type StandaloneEval = CompletedPrompt & {
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
 * Get standalone evaluations
 */
export async function getStandaloneEvals({
  limit = DEFAULT_QUERY_LIMIT,
  tag,
  description,
}: {
  limit?: number;
  tag?: { key: string; value: string };
  description?: string;
} = {}): Promise<StandaloneEval[]> {
  return DatabaseRepository.getStandaloneEvals({ limit, tag, description });
}
