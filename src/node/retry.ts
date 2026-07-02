import chalk from 'chalk';
import { and, eq, inArray, sql } from 'drizzle-orm';
import cliState from '../cliState';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { evaluate } from '../evaluator';
import logger from '../logger';
import Eval from '../models/eval';
import { notifyEvaluationChanged } from '../models/evalMutation';
import { createShareableUrl, isSharingEnabled } from '../share';
import { ResultFailureReason } from '../types/index';
import { ConfigResolutionError, resolveConfigs } from '../util/config/load';
import {
  filterProviders,
  getPersistedProviderFilterOptions,
  getProviderFilterRegexError,
} from '../util/eval/filterProviders';
import { accumulateNamedMetric } from '../util/namedMetrics';
import { filterFiniteScores } from '../util/numeric';
import { writeMultipleOutputs } from '../util/output';
import { getOutputFileFormat } from '../util/outputFormats';
import { shouldShareResults } from '../util/sharing';
import {
  accumulateAssertionTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';

import type { PromptMetrics, TestSuite, TokenUsage } from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';

export interface RetryCommandOptions {
  config?: string;
  verbose?: boolean;
  maxConcurrency?: number;
  delay?: number;
  share?: boolean;
}

interface RecalculatePromptMetricsOptions {
  /**
   * Preserve the live evaluator's named metric totals when the deleted ERROR rows had no named
   * scores. This keeps configured Nunjucks rendering without executing templates from persisted
   * component results during the post-retry read.
   */
  preserveNamedMetrics?: boolean;
}

interface DeletedErrorResultsSummary {
  allRequestedDeleted: boolean;
  hadNamedScores: boolean;
}

function isFiniteMetricRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

function isCompleteFiniteNamedMetrics(metrics: PromptMetrics | undefined): boolean {
  const namedScores = metrics?.namedScores;
  const namedScoresCount = metrics?.namedScoresCount;
  const namedScoreWeights = metrics?.namedScoreWeights;
  if (
    !isFiniteMetricRecord(namedScores) ||
    !isFiniteMetricRecord(namedScoresCount) ||
    !isFiniteMetricRecord(namedScoreWeights)
  ) {
    return false;
  }

  const metricNames = Object.keys(namedScores);
  return [namedScoresCount, namedScoreWeights].every(
    (record) =>
      Object.keys(record).length === metricNames.length &&
      metricNames.every((metricName) => Object.prototype.hasOwnProperty.call(record, metricName)),
  );
}

/** Capture prompt metric identity before retry so preservation is used only when evaluate() reused it. */
export function createNamedMetricsPreservationGuard(evalRecord: Eval) {
  const originalHasDerivedMetrics = Boolean(evalRecord.config.derivedMetrics?.length);
  const snapshots = evalRecord.prompts.map(({ metrics }) => ({
    complete: isCompleteFiniteNamedMetrics(metrics),
    metrics,
  }));

  return (retriedEval: Eval, derivedMetrics: TestSuite['derivedMetrics']): boolean =>
    !originalHasDerivedMetrics &&
    !derivedMetrics?.length &&
    snapshots.length === retriedEval.prompts.length &&
    snapshots.every(
      (snapshot, index) =>
        snapshot.complete && snapshot.metrics === retriedEval.prompts[index]?.metrics,
    );
}

function getJsonlOutputPaths(outputPath: string | string[] | undefined): string[] {
  return (Array.isArray(outputPath) ? outputPath : [outputPath]).filter(
    (path): path is string => typeof path === 'string' && getOutputFileFormat(path) === 'jsonl',
  );
}

function assertRetryProviderFilterMatched(
  providerFilter: string | undefined,
  providerCount: number,
  configPath?: string,
): void {
  if (!providerFilter || providerCount > 0) {
    return;
  }

  const configDescription = configPath ? `retry config "${configPath}"` : 'saved evaluation config';
  throw new ConfigResolutionError(
    `Stored provider filter "${providerFilter}" matched no providers in the ${configDescription}. Existing ERROR results were preserved.`,
  );
}

async function resolveRetryConfigs(
  originalEval: Eval,
  cmdObj: RetryCommandOptions,
): Promise<Awaited<ReturnType<typeof resolveConfigs>>> {
  const providerFilterOptions = getPersistedProviderFilterOptions(
    originalEval.runtimeOptions?.providerFilter,
  );
  const providerFilter = providerFilterOptions.filterProviders;

  // Validate the stored pattern up front so a regex failure is attributed to the filter,
  // while unrelated resolution errors (missing prompt files, provider load failures)
  // propagate unchanged with their original class and stack.
  const regexError = providerFilter ? getProviderFilterRegexError(providerFilter) : undefined;
  if (providerFilter && regexError) {
    const configDescription = cmdObj.config
      ? `retry config "${cmdObj.config}"`
      : 'saved evaluation config';
    throw new ConfigResolutionError(
      `Could not resolve the ${configDescription} using stored provider filter "${providerFilter}": ${regexError}. Existing ERROR results were preserved.`,
    );
  }

  const configs = cmdObj.config
    ? await resolveConfigs({ config: [cmdObj.config], ...providerFilterOptions }, {})
    : await resolveConfigs(providerFilterOptions, originalEval.config);

  // The original run filtered twice: raw configs in resolveConfigs, then instantiated
  // providers by live id()/label in doEval. Replay both stages so the retried provider
  // set matches the original even when an instantiated id or label diverges from its
  // raw config reference.
  configs.testSuite.providers = filterProviders(configs.testSuite.providers, providerFilter);

  assertRetryProviderFilterMatched(
    providerFilter,
    configs.testSuite.providers.length,
    cmdObj.config,
  );
  return configs;
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
export function deleteErrorResults(resultIds: string[]): Promise<void>;
export function deleteErrorResults(
  resultIds: string[],
  options: { reportNamedScores: true },
): Promise<DeletedErrorResultsSummary>;
export async function deleteErrorResults(
  resultIds: string[],
  options?: { reportNamedScores: true },
): Promise<unknown> {
  if (resultIds.length === 0) {
    return options?.reportNamedScores
      ? { allRequestedDeleted: true, hadNamedScores: false }
      : undefined;
  }

  const db = await getDb();
  const deletedResults = await db
    .delete(evalResultsTable)
    .where(inArray(evalResultsTable.id, resultIds))
    .returning({
      evalId: evalResultsTable.evalId,
      hasNamedScores: sql<number>`CASE
        WHEN ${evalResultsTable.namedScores} IS NOT NULL
          AND ${evalResultsTable.namedScores} <> '{}'
        THEN 1 ELSE 0 END`,
    });

  for (const evalId of new Set(deletedResults.map(({ evalId }) => evalId))) {
    notifyEvaluationChanged(evalId);
  }

  logger.debug(`Deleted ${resultIds.length} error results from database`);
  return options?.reportNamedScores
    ? {
        allRequestedDeleted: deletedResults.length === resultIds.length,
        hadNamedScores: deletedResults.some(({ hasNamedScores }) => Boolean(hasNamedScores)),
      }
    : undefined;
}

// Batch size of 1000 balances memory usage vs. database query overhead for large evals (40K+ results)
const RECALCULATE_BATCH_SIZE = 1000;

/**
 * Recalculates prompt metrics based on current results after ERROR results have been deleted.
 * Uses streaming batched iteration to avoid OOM with large evaluations (40K+ results).
 */
export async function recalculatePromptMetrics(
  evalRecord: Eval,
  options: RecalculatePromptMetricsOptions = {},
): Promise<void> {
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
    const existingMetrics = evalRecord.prompts[promptIdx].metrics;
    promptMetricsMap.set(promptIdx, {
      score: 0,
      testPassCount: 0,
      testFailCount: 0,
      testErrorCount: 0,
      assertPassCount: 0,
      assertFailCount: 0,
      totalLatencyMs: 0,
      tokenUsage: createEmptyTokenUsage(),
      namedScores: options.preserveNamedMetrics
        ? filterFiniteScores(existingMetrics?.namedScores ?? {})
        : {},
      namedScoresCount: options.preserveNamedMetrics
        ? filterFiniteScores(existingMetrics?.namedScoresCount ?? {})
        : {},
      namedScoreWeights: options.preserveNamedMetrics
        ? filterFiniteScores(existingMetrics?.namedScoreWeights ?? {})
        : {},
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

        if (!options.preserveNamedMetrics) {
          for (const [key, value] of Object.entries(result.namedScores || {})) {
            accumulateNamedMetric(metrics, {
              metricName: key,
              metricValue: value,
              gradingResult: result.gradingResult,
              testVars: result.testCase?.vars || {},
            });
          }
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
  const { testSuite, commandLineOptions, config } = await resolveRetryConfigs(originalEval, cmdObj);

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
  const canPreserveNamedMetrics = createNamedMetricsPreservationGuard(originalEval);

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
      const deletion = await deleteErrorResults(errorResultIds, {
        reportNamedScores: true,
      });
      errorRowsDeleted = true;
      await recalculatePromptMetrics(retriedEval, {
        preserveNamedMetrics:
          deletion.allRequestedDeleted &&
          !deletion.hadNamedScores &&
          canPreserveNamedMetrics(retriedEval, testSuite.derivedMetrics),
      });
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
