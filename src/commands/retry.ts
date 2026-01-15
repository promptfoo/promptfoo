import chalk from 'chalk';
import { and, eq } from 'drizzle-orm';
import { renderMetricName } from '../assertions/index';
import cliState from '../cliState';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { evaluate } from '../evaluator';
import logger from '../logger';
import Eval from '../models/eval';
import { ResultFailureReason } from '../types/index';
import { resolveConfigs } from '../util/config/load';
import {
  accumulateAssertionTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';
import type { Command } from 'commander';

import type { EvaluateOptions, TokenUsage } from '../types/index';

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
 * Recalculates prompt metrics based on current results after ERROR results have been deleted
 */
export async function recalculatePromptMetrics(evalRecord: Eval): Promise<void> {
  logger.debug('Recalculating prompt metrics after deleting ERROR results');

  // Load current results from database
  await evalRecord.loadResults();

  // Create a map to track metrics by promptIdx
  const promptMetricsMap = new Map<
    number,
    {
      score: number;
      testPassCount: number;
      testFailCount: number;
      testErrorCount: number;
      assertPassCount: number;
      assertFailCount: number;
      totalLatencyMs: number;
      tokenUsage: TokenUsage;
      namedScores: Record<string, number>;
      namedScoresCount: Record<string, number>;
      cost: number;
    }
  >();

  // Initialize metrics for each prompt
  for (const prompt of evalRecord.prompts) {
    const promptIdx = evalRecord.prompts.indexOf(prompt);
    promptMetricsMap.set(promptIdx, {
      score: 0,
      testPassCount: 0,
      testFailCount: 0,
      testErrorCount: 0,
      assertPassCount: 0,
      assertFailCount: 0,
      totalLatencyMs: 0,
      tokenUsage: createEmptyTokenUsage(),
      namedScores: {},
      namedScoresCount: {},
      cost: 0,
    });
  }

  // Recalculate metrics from current results
  for (const result of evalRecord.results) {
    const metrics = promptMetricsMap.get(result.promptIdx);
    if (!metrics) {
      continue;
    }

    // Update test counts
    if (result.success) {
      metrics.testPassCount++;
    } else if (result.failureReason === ResultFailureReason.ERROR) {
      metrics.testErrorCount++;
    } else {
      metrics.testFailCount++;
    }

    // Update scores and other metrics
    metrics.score += result.score || 0;
    metrics.totalLatencyMs += result.latencyMs || 0;
    metrics.cost += result.cost || 0;

    // Update named scores
    for (const [key, value] of Object.entries(result.namedScores || {})) {
      metrics.namedScores[key] = (metrics.namedScores[key] || 0) + value;

      // Count assertions contributing to this named score
      // Note: We need to render template variables in assertion metrics before comparing
      const testVars = result.testCase?.vars || {};
      let contributingAssertions = 0;
      result.gradingResult?.componentResults?.forEach((componentResult) => {
        const renderedMetric = renderMetricName(componentResult.assertion?.metric, testVars);
        if (renderedMetric === key) {
          contributingAssertions++;
        }
      });
      metrics.namedScoresCount[key] =
        (metrics.namedScoresCount[key] || 0) + (contributingAssertions || 1);
    }

    // Update assertion counts
    if (result.gradingResult?.componentResults) {
      metrics.assertPassCount += result.gradingResult.componentResults.filter((r) => r.pass).length;
      metrics.assertFailCount += result.gradingResult.componentResults.filter(
        (r) => !r.pass,
      ).length;
    }

    // Update token usage
    if (result.response?.tokenUsage) {
      accumulateResponseTokenUsage(metrics.tokenUsage, { tokenUsage: result.response.tokenUsage });
    }

    // Update assertion token usage
    if (result.gradingResult?.tokensUsed) {
      if (!metrics.tokenUsage.assertions) {
        metrics.tokenUsage.assertions = createEmptyAssertions();
      }
      accumulateAssertionTokenUsage(metrics.tokenUsage.assertions, result.gradingResult.tokensUsed);
    }
  }

  // Update prompt metrics with recalculated values
  for (const [promptIdx, newMetrics] of promptMetricsMap.entries()) {
    if (promptIdx < evalRecord.prompts.length) {
      evalRecord.prompts[promptIdx].metrics = newMetrics;
    }
  }

  // Save the updated prompt metrics
  if (evalRecord.persisted) {
    await evalRecord.addPrompts(evalRecord.prompts);
  }

  logger.debug('Prompt metrics recalculation completed');
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

  // Calculate effective maxConcurrency from CLI or config
  const effectiveMaxConcurrency = cmdObj.maxConcurrency ?? (config as any).maxConcurrency;
  const effectiveDelay = cmdObj.delay ?? (config as any).delay;

  // Propagate maxConcurrency to cliState for providers (e.g., Python worker pool)
  // Handle delay mode: force concurrency to 1 when delay is set
  if (effectiveDelay && effectiveDelay > 0) {
    cliState.maxConcurrency = 1;
    logger.info(
      `Running at concurrency=1 because ${effectiveDelay}ms delay was requested between API calls`,
    );
  } else if (effectiveMaxConcurrency !== undefined) {
    cliState.maxConcurrency = effectiveMaxConcurrency;
  }

  // Set up evaluation options
  const evaluateOptions: EvaluateOptions = {
    maxConcurrency: effectiveDelay && effectiveDelay > 0 ? 1 : effectiveMaxConcurrency,
    delay: effectiveDelay,
    eventSource: 'cli',
    showProgressBar: !cmdObj.verbose, // Show progress bar unless verbose mode
  };

  try {
    // Run the retry evaluation - this will only run the missing test cases due to resume mode
    const retriedEval = await evaluate(testSuite, originalEval, evaluateOptions);

    logger.info(`✅ Retry completed for evaluation: ${chalk.cyan(evalId)}`);
    return retriedEval;
  } finally {
    // Always clear the resume state and maxConcurrency to prevent stale state
    cliState.resume = false;
    cliState.maxConcurrency = undefined;
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
