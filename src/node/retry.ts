import chalk from 'chalk';
import { and, eq, inArray } from 'drizzle-orm';
import cliState from '../cliState';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { evaluate } from '../evaluator';
import logger from '../logger';
import Eval from '../models/eval';
import { notifyEvaluationChanged } from '../models/evalMutation';
import { createShareableUrl, isSharingEnabled } from '../share';
import { ResultFailureReason } from '../types/index';
import { resolveConfigs } from '../util/config/load';
import { normalizePersistedConfigForResume } from '../util/config/persistence';
import { accumulateNamedMetric } from '../util/namedMetrics';
import { writeMultipleOutputs } from '../util/output';
import { getOutputFileFormat } from '../util/outputFormats';
import { shouldShareResults } from '../util/sharing';
import {
  accumulateAssertionTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';

import type { TokenUsage } from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';

export interface RetryCommandOptions {
  config?: string;
  verbose?: boolean;
  maxConcurrency?: number;
  delay?: number;
  share?: boolean;
}

function getJsonlOutputPaths(outputPath: string | string[] | undefined): string[] {
  return (Array.isArray(outputPath) ? outputPath : [outputPath]).filter(
    (path): path is string => typeof path === 'string' && getOutputFileFormat(path) === 'jsonl',
  );
}

async function restoreJsonlOutputsAfterPersistenceFailure(
  jsonlOutputPaths: string[],
  evalRecord: Eval,
): Promise<void> {
  if (jsonlOutputPaths.length === 0) {
    return;
  }

  try {
    // A failed retry must restore the pre-retry database view, not union in
    // replacement rows that were streamed before persistence failed.
    evalRecord.resultPersistenceFailed = false;
    await writeMultipleOutputs(jsonlOutputPaths, evalRecord, null);
  } catch (error) {
    logger.warn('Retry results failed to persist, and restoring JSONL output failed.', {
      error,
      jsonlOutputPaths,
    });
  } finally {
    evalRecord.resultPersistenceFailed = true;
  }
}

/**
 * Gets all ERROR results from an evaluation and returns their IDs
 */
export async function getErrorResultIds(evalId: string): Promise<string[]> {
  const db = await getDb();

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

  const db = await getDb();
  const affectedEvals = await db
    .selectDistinct({ evalId: evalResultsTable.evalId })
    .from(evalResultsTable)
    .where(inArray(evalResultsTable.id, resultIds))
    .all();

  // Use batch delete with inArray for better performance
  await db.delete(evalResultsTable).where(inArray(evalResultsTable.id, resultIds)).run();

  for (const { evalId } of affectedEvals) {
    notifyEvaluationChanged(evalId);
  }

  logger.debug(`Deleted ${resultIds.length} error results from database`);
}

// Batch size of 1000 balances memory usage vs. database query overhead for large evals (40K+ results)
const RECALCULATE_BATCH_SIZE = 1000;

/**
 * Recalculates prompt metrics based on current results after ERROR results have been deleted.
 * Uses streaming batched iteration to avoid OOM with large evaluations (40K+ results).
 */
export async function recalculatePromptMetrics(evalRecord: Eval): Promise<void> {
  logger.debug('Recalculating prompt metrics after deleting ERROR results');

  const startTime = Date.now();
  let batchNumber = 0;
  let totalProcessed = 0;

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
      namedScoreWeights?: Record<string, number>;
      cost: number;
    }
  >();

  // Initialize metrics for each prompt
  for (const [promptIdx] of evalRecord.prompts.entries()) {
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
      namedScoreWeights: {},
      cost: 0,
    });
  }

  // Stream results in batches to avoid OOM with large evaluations
  let currentResultId: string | undefined;
  try {
    for await (const batch of evalRecord.fetchResultsBatched(RECALCULATE_BATCH_SIZE)) {
      batchNumber++;
      logger.debug(`Processing batch ${batchNumber} with ${batch.length} results`);

      for (const result of batch) {
        currentResultId = result.id;
        const metrics = promptMetricsMap.get(result.promptIdx);
        if (!metrics) {
          logger.debug(`Skipping result with invalid promptIdx: ${result.promptIdx}`, {
            resultId: result.id,
            evalId: evalRecord.id,
          });
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
        metrics.score += result.score ?? 0;
        metrics.totalLatencyMs += result.latencyMs || 0;
        metrics.cost += result.cost || 0;

        for (const [key, value] of Object.entries(result.namedScores || {})) {
          accumulateNamedMetric(metrics, {
            metricName: key,
            metricValue: value,
            gradingResult: result.gradingResult,
            testVars: result.testCase?.vars || {},
          });
        }

        // Update assertion counts
        if (result.gradingResult?.componentResults) {
          metrics.assertPassCount += result.gradingResult.componentResults.filter(
            (r) => r.pass,
          ).length;
          metrics.assertFailCount += result.gradingResult.componentResults.filter(
            (r) => !r.pass,
          ).length;
        }

        // Update token usage
        if (result.response?.tokenUsage) {
          accumulateResponseTokenUsage(metrics.tokenUsage, {
            tokenUsage: result.response.tokenUsage,
          });
        }

        // Update assertion token usage
        if (result.gradingResult?.tokensUsed) {
          if (!metrics.tokenUsage.assertions) {
            metrics.tokenUsage.assertions = createEmptyAssertions();
          }
          accumulateAssertionTokenUsage(
            metrics.tokenUsage.assertions,
            result.gradingResult.tokensUsed,
          );
        }
      }

      totalProcessed += batch.length;
    }
  } catch (error) {
    logger.error('Error during batched metrics recalculation', {
      phase: 'calculation',
      batchNumber,
      totalProcessed,
      currentResultId,
      evalId: evalRecord.id,
      error,
    });
    throw error;
  }

  // Update prompt metrics with recalculated values
  for (const [promptIdx, newMetrics] of promptMetricsMap.entries()) {
    if (promptIdx < evalRecord.prompts.length) {
      evalRecord.prompts[promptIdx].metrics = newMetrics;
    }
  }

  // Save the updated prompt metrics
  if (evalRecord.persisted) {
    try {
      await evalRecord.addPrompts(evalRecord.prompts);
    } catch (error) {
      logger.error('Error saving recalculated prompt metrics', {
        phase: 'save',
        evalId: evalRecord.id,
        promptCount: evalRecord.prompts.length,
        error,
      });
      throw error;
    }
  }

  const durationMs = Date.now() - startTime;
  logger.debug('Prompt metrics recalculation completed', {
    totalBatches: batchNumber,
    totalResults: totalProcessed,
    durationMs,
  });
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
    const configs = await resolveConfigs(
      {},
      normalizePersistedConfigForResume(
        originalEval.config,
        await originalEval.getProvidersFromResults(),
      ),
    );
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
  const evaluateOptions: InternalEvaluateOptions = {
    maxConcurrency: effectiveDelay && effectiveDelay > 0 ? 1 : effectiveMaxConcurrency,
    delay: effectiveDelay,
    eventSource: 'cli',
    showProgressBar: !cmdObj.verbose, // Show progress bar unless verbose mode
  };

  try {
    // Run the retry evaluation - this will only run ERROR test cases due to retry mode
    const retriedEval = await evaluate(testSuite, originalEval, evaluateOptions);
    const jsonlOutputPaths = getJsonlOutputPaths(originalEval.config.outputPath);

    if (retriedEval.resultPersistenceFailed) {
      await restoreJsonlOutputsAfterPersistenceFailure(jsonlOutputPaths, retriedEval);
      throw new Error('Retry results failed to persist. Existing ERROR rows were preserved.');
    }

    let errorRowsDeleted = false;
    try {
      await deleteErrorResults(errorResultIds);
      errorRowsDeleted = true;
      await recalculatePromptMetrics(retriedEval);
    } catch (cleanupError) {
      // Cleanup failure is non-fatal - retry itself succeeded
      logger.warn('Post-retry cleanup had issues. Retry results are saved.', {
        error: cleanupError,
      });
    }

    if (errorRowsDeleted) {
      if (jsonlOutputPaths.length > 0) {
        try {
          await writeMultipleOutputs(jsonlOutputPaths, retriedEval, null);
        } catch (outputError) {
          logger.warn(
            'Retry succeeded and the database is up to date, but rewriting JSONL output failed.',
            {
              error: outputError,
              outputPaths: jsonlOutputPaths,
            },
          );
        }
      }
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
