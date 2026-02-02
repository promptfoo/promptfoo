import chalk from 'chalk';
import dedent from 'dedent';
import { and, eq, inArray } from 'drizzle-orm';
import { renderMetricName } from '../assertions/index';
import cliState from '../cliState';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { evaluate } from '../evaluator';
import logger from '../logger';
import Eval from '../models/eval';
import { createShareableUrl, isSharingEnabled } from '../share';
import { ResultFailureReason } from '../types/index';
import { resolveConfigs } from '../util/config/load';
import { shouldShareResults } from '../util/sharing';
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
  share?: boolean;
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
 * Deletes ERROR results after successful retry.
 * Uses batch delete for better performance.
 */
export async function deleteErrorResults(resultIds: string[]): Promise<void> {
  if (resultIds.length === 0) {
    return;
  }

  const db = getDb();

  // Use batch delete with inArray for better performance
  await db.delete(evalResultsTable).where(inArray(evalResultsTable.id, resultIds));

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

  // Get all ERROR result IDs - capture these BEFORE retry so we know what to delete on success
  const errorResultIds = await getErrorResultIds(evalId);
  if (errorResultIds.length === 0) {
    logger.info('✅ No ERROR results found in this evaluation');
    return originalEval;
  }

  logger.info(`Found ${errorResultIds.length} ERROR results to retry`);

  // Load configuration - from provided config file or from original evaluation
  let testSuite;
  let commandLineOptions: Record<string, unknown> | undefined;
  let config: Record<string, unknown> | undefined;
  if (cmdObj.config) {
    // Load configuration from the provided config file
    const configs = await resolveConfigs({ config: [cmdObj.config] }, {});
    testSuite = configs.testSuite;
    commandLineOptions = configs.commandLineOptions;
    config = configs.config;
  } else {
    // Load configuration from the original evaluation
    const configs = await resolveConfigs({}, originalEval.config);
    testSuite = configs.testSuite;
    commandLineOptions = configs.commandLineOptions;
    config = configs.config;
  }

  // CRITICAL: We do NOT delete ERROR results here anymore!
  // Previously (before this fix), deletion happened before evaluate(), which caused data loss:
  // - If retry failed (network error, API timeout, etc.), the ERROR results were already gone
  // - User could not re-retry because the original ERROR results were permanently deleted
  // Now we delete AFTER successful retry, so if retry fails, ERROR results are preserved
  // and the user can simply run the retry command again.

  logger.info(
    `🔄 Running evaluation with resume mode to retry ${errorResultIds.length} test cases...`,
  );

  // Enable resume mode so only the missing results will be evaluated
  // Enable retry mode so getCompletedIndexPairs excludes ERROR results
  cliState.resume = true;
  cliState.retryMode = true;

  // Calculate effective maxConcurrency from CLI or config (commandLineOptions)
  // Priority: CLI flag > config file's commandLineOptions
  // Use runtime validation to handle cases where config may contain wrong types (e.g., string "5" instead of number 5)
  const configMaxConcurrency = commandLineOptions?.maxConcurrency;
  const effectiveMaxConcurrency =
    cmdObj.maxConcurrency ??
    (typeof configMaxConcurrency === 'number' ? configMaxConcurrency : undefined);

  const configDelay = commandLineOptions?.delay;
  const effectiveDelay =
    cmdObj.delay ?? (typeof configDelay === 'number' ? configDelay : undefined);

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
    // Run the retry evaluation - this will only run ERROR test cases due to retry mode
    const retriedEval = await evaluate(testSuite, originalEval, evaluateOptions);

    // SUCCESS: Now it's safe to delete the old ERROR results
    // This is the key fix for data loss - deletion only happens after successful retry
    try {
      await deleteErrorResults(errorResultIds);
      await recalculatePromptMetrics(retriedEval);
    } catch (cleanupError) {
      // Cleanup failure is non-fatal - retry itself succeeded
      logger.warn('Post-retry cleanup had issues. Retry results are saved.', {
        error: cleanupError,
      });
    }

    logger.info(`✅ Retry completed for evaluation: ${chalk.cyan(evalId)}`);

    // Cloud sync: Determine if we should share results (same precedence as eval command)
    const wantsToShare = shouldShareResults({
      cliShare: cmdObj.share,
      configShare: commandLineOptions?.share,
      configSharing: config?.sharing,
    });

    const canShareEval = isSharingEnabled(retriedEval);
    const willShare = wantsToShare && canShareEval;

    logger.debug('Share decision', { wantsToShare, canShareEval, willShare });

    if (willShare) {
      try {
        const shareUrl = await createShareableUrl(retriedEval, { silent: false });
        if (shareUrl) {
          logger.info(
            `${chalk.dim('>>>')} ${chalk.green('View results:')} ${chalk.cyan(shareUrl)}`,
          );
        } else {
          logger.warn(
            `Cloud sync failed. Run ${chalk.cyan(`promptfoo share ${evalId}`)} to retry manually.`,
          );
        }
      } catch (shareError) {
        // Share failure is non-fatal - retry itself succeeded
        logger.debug('Cloud sync error', { error: shareError });
        logger.warn(
          `Cloud sync failed. Run ${chalk.cyan(`promptfoo share ${evalId}`)} to retry manually.`,
        );
      }
    }

    return retriedEval;
  } finally {
    // Always clear the state flags to prevent stale state
    cliState.resume = false;
    cliState.retryMode = false;
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
    .option('--share', 'Share results to cloud (auto-shares when cloud is configured)')
    .option('--no-share', 'Do not share results to cloud')
    .action(async (evalId: string, cmdObj: RetryCommandOptions) => {
      try {
        await retryCommand(evalId, cmdObj);
      } catch (error) {
        logger.error('Failed to retry evaluation', { error, evalId });
        logger.info(
          chalk.yellow(dedent`

            Recovery options:
              - Run the same retry command again to continue
              - Check API credentials and network connectivity
              - Use --verbose for detailed error information
          `),
        );
        process.exitCode = 1;
      }
    });
}
