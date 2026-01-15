import chalk from 'chalk';
import { and, eq } from 'drizzle-orm';
import cliState from '../cliState';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { evaluate } from '../evaluator';
import logger from '../logger';
import Eval from '../models/eval';
import { ResultFailureReason } from '../types/index';
import { resolveConfigs } from '../util/config/load';
import { recalculatePromptMetrics } from '../util/recalculatePromptMetrics';
import type { Command } from 'commander';

import type { EvaluateOptions } from '../types/index';

interface RetryCommandOptions {
  config?: string;
  verbose?: boolean;
  maxConcurrency?: number;
  delay?: number;
}

/**
 * Gets all ERROR results from an evaluation and returns their IDs
 */
export async function getErrorResultIds(evalId: string): Promise<string[]> {
  const db = getDb();

  const errorResults = await db
    .select({ id: evalResultsTable.id })
    .from(evalResultsTable)
    .where(
      and(
        eq(evalResultsTable.evalId, evalId),
        eq(evalResultsTable.failureReason, ResultFailureReason.ERROR),
      ),
    )
    .all();

  return errorResults.map((r) => r.id);
}

/**
 * Deletes ERROR results to prepare for retry
 */
export async function deleteErrorResults(resultIds: string[]): Promise<void> {
  const db = getDb();

  for (const resultId of resultIds) {
    await db.delete(evalResultsTable).where(eq(evalResultsTable.id, resultId));
  }

  logger.debug(`Deleted ${resultIds.length} error results from database`);
}


/**
 * Main retry function
 */
export async function retryCommand(evalId: string, cmdObj: RetryCommandOptions) {
  logger.info(`🔄 Retrying failed tests for evaluation: ${chalk.cyan(evalId)}`);

  // Load the original evaluation
  const originalEval = await Eval.findById(evalId);
  if (!originalEval) {
    throw new Error(`Evaluation with ID ${evalId} not found`);
  }

  // Get all ERROR result IDs
  const errorResultIds = await getErrorResultIds(evalId);
  if (errorResultIds.length === 0) {
    logger.info('✅ No ERROR results found in this evaluation');
    return originalEval;
  }

  logger.info(`Found ${errorResultIds.length} ERROR results to retry`);

  // Load configuration - from provided config file or from original evaluation
  let config;
  let testSuite;
  if (cmdObj.config) {
    // Load configuration from the provided config file
    const configs = await resolveConfigs({ config: [cmdObj.config] }, {});
    config = configs.config;
    testSuite = configs.testSuite;
  } else {
    // Load configuration from the original evaluation
    const configs = await resolveConfigs({}, originalEval.config);
    config = configs.config;
    testSuite = configs.testSuite;
  }

  // Delete the ERROR results so they will be re-evaluated when we run with resume
  await deleteErrorResults(errorResultIds);

  // Recalculate prompt metrics after deleting ERROR results to avoid double-counting
  await recalculatePromptMetrics(originalEval);

  logger.info(
    `🔄 Running evaluation with resume mode to retry ${errorResultIds.length} test cases...`,
  );

  // Enable resume mode so only the missing (deleted) results will be evaluated
  cliState.resume = true;

  // Set up evaluation options
  const evaluateOptions: EvaluateOptions = {
    maxConcurrency: cmdObj.maxConcurrency || (config as any).maxConcurrency,
    delay: cmdObj.delay || (config as any).delay,
    eventSource: 'cli',
    showProgressBar: !cmdObj.verbose, // Show progress bar unless verbose mode
  };

  try {
    // Run the retry evaluation - this will only run the missing test cases due to resume mode
    const retriedEval = await evaluate(testSuite, originalEval, evaluateOptions);

    logger.info(`✅ Retry completed for evaluation: ${chalk.cyan(evalId)}`);
    return retriedEval;
  } finally {
    // Always clear the resume state
    cliState.resume = false;
  }
}

/**
 * Set up the retry command
 */
export function setupRetryCommand(program: Command) {
  program
    .command('retry <evalId>')
    .description('Retry all ERROR results from a given evaluation')
    .option(
      '-c, --config <path>',
      'Path to configuration file (optional, uses original eval config if not provided)',
    )
    .option('-v, --verbose', 'Verbose output')
    .option('--max-concurrency <number>', 'Maximum number of concurrent evaluations', parseInt)
    .option('--delay <number>', 'Delay between evaluations in milliseconds', parseInt)
    .action(async (evalId: string, cmdObj: RetryCommandOptions) => {
      try {
        await retryCommand(evalId, cmdObj);
      } catch (error) {
        logger.error(`Failed to retry evaluation: ${error}`);
        process.exit(1);
      }
    });
}
