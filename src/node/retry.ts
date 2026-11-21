import { isDeepStrictEqual } from 'node:util';

import chalk from 'chalk';
import { and, eq, inArray, sql } from 'drizzle-orm';
import cliState from '../cliState';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { evaluate } from '../evaluator';
import { getResultIndexKey } from '../evaluator/resultIndex';
import {
  sanitizeForDbWithSecrets,
  sanitizeProvider,
  serializeResultProviderRefs,
} from '../evaluator/resultProcessing';
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
import { createDefaultPromptMetrics, updatePromptResultCounts } from '../util/eval/promptMetrics';
import { accumulateNamedMetric } from '../util/namedMetrics';
import { writeMultipleOutputs } from '../util/output';
import { getOutputFileFormat } from '../util/outputFormats';
import { shouldShareResults } from '../util/sharing';
import { accumulateGradingTokenUsage, accumulateResponseTokenUsage } from '../util/tokenUsageUtils';

import type { AtomicTestCase, EvaluateResult, PromptMetrics, RunEvalOptions } from '../types/index';
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

// Match the same public test representation that EvalResult writes, including
// older rows without the empty containers supplied by the current evaluator.
function retryTestIdentity(testCase: AtomicTestCase) {
  const saved = sanitizeForDbWithSecrets(serializeResultProviderRefs({ testCase }).testCase);
  return { vars: {}, assert: [], options: {}, metadata: {}, ...saved };
}

export function trackRetryResults(evalId: string, errorIds: string[], usingSavedConfig = true) {
  const captured = new Set(errorIds);
  const replaced = new Set<string>();
  const providerIdentity = (provider: Parameters<typeof sanitizeProvider>[0]) => {
    const { id, label, config = {} } = sanitizeProvider(provider);
    // Config loading injects a working directory that older rows did not store.
    const { basePath: _basePath, ...settings } = config;
    return { id, label: label || id, settings };
  };
  const identity = (test: AtomicTestCase, provider: Parameters<typeof sanitizeProvider>[0]) => ({
    test: retryTestIdentity(test),
    provider: providerIdentity(provider),
  });
  const cells = new Map<string, { ids: string[]; identity: ReturnType<typeof identity> }>();
  const mismatch = () =>
    new ConfigResolutionError(
      'Cannot retry because a saved test or provider changed position or content. Existing ERROR results were preserved. Start a new evaluation.',
    );
  return {
    async prepare(steps: RunEvalOptions[], hasExtensions = false) {
      const db = await getDb();
      const r = evalResultsTable;
      // A paused retry can leave both the original error and a completed row.
      // Load only cells with errors, including their possible replacements.
      const rows = await db
        .select({
          sequence: sql<number>`rowid`,
          id: r.id,
          testIdx: r.testIdx,
          promptIdx: r.promptIdx,
          test: r.testCase,
          provider: r.provider,
          failureReason: r.failureReason,
          error: r.error,
          latencyMs: r.latencyMs,
        })
        .from(r)
        .where(
          and(
            eq(r.evalId, evalId),
            sql`(${r.testIdx}, ${r.promptIdx}) IN (
          SELECT ${r.testIdx}, ${r.promptIdx} FROM ${r}
          WHERE ${r.evalId} = ${evalId} AND ${r.failureReason} = ${ResultFailureReason.ERROR}
        )`,
          ),
        )
        .all();
      const byCell: Record<string, typeof rows> = {};
      for (const row of rows) {
        (byCell[getResultIndexKey(row)] ??= []).push(row);
      }
      return steps.filter((step) => {
        const key = getResultIndexKey(step);
        const group = byCell[key];
        const errors = group?.filter((row) => captured.has(row.id));
        if (!errors?.length) {
          return false;
        }

        const savedIdentity = (row: (typeof rows)[number]) => {
          // Step timeouts omit test.provider. Only the saved configuration
          // can supply the missing override. Never infer it from --config.
          const restoreOverride =
            usingSavedConfig &&
            step.test.provider &&
            !row.test.provider &&
            row.latencyMs &&
            row.error?.startsWith(`Evaluation timed out after ${row.latencyMs}ms: `);
          return identity(
            restoreOverride ? { ...row.test, provider: step.test.provider } : row.test,
            row.provider,
          );
        };
        const expected = savedIdentity(errors[0]);
        if (
          errors.slice(1).some((row) => !isDeepStrictEqual(expected, savedIdentity(row))) ||
          !isDeepStrictEqual(expected.provider, providerIdentity(step.provider)) ||
          (!hasExtensions && !isDeepStrictEqual(expected.test, retryTestIdentity(step.test)))
        ) {
          throw mismatch();
        }

        const ids = errors.map((row) => row.id);
        if (
          group.some(
            (row) =>
              row.failureReason !== ResultFailureReason.ERROR &&
              errors.every((old) => row.sequence > old.sequence) &&
              isDeepStrictEqual(expected, identity(row.test, row.provider)),
          )
        ) {
          for (const id of ids) {
            replaced.add(id);
          }
          return false;
        }
        cells.set(key, { ids, identity: expected });
        return true;
      });
    },
    validate(step: RunEvalOptions) {
      const cell = cells.get(getResultIndexKey(step));
      if (!isDeepStrictEqual(cell?.identity, identity(step.test, step.provider))) {
        throw mismatch();
      }
    },
    saved(row: Pick<EvaluateResult, 'provider' | 'testCase' | 'testIdx' | 'promptIdx'>) {
      const cell = cells.get(getResultIndexKey(row));
      // An extension can change a test after planning. Never delete an original
      // error solely because another row was written at its indices.
      if (cell && isDeepStrictEqual(cell.identity, identity(row.testCase, row.provider))) {
        for (const id of cell.ids) {
          replaced.add(id);
        }
      }
    },
    replacedIds() {
      const kept = captured.size - replaced.size;
      if (kept) {
        logger.warn(
          `Kept ${kept} ERROR ${kept === 1 ? 'result' : 'results'} without a matching persisted replacement.`,
        );
      }
      return [...replaced];
    },
  };
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
  const staleErrors = and(
    eq(evalResultsTable.failureReason, ResultFailureReason.ERROR),
    inArray(evalResultsTable.id, resultIds),
  );
  const affectedEvals = await db
    .selectDistinct({ evalId: evalResultsTable.evalId })
    .from(evalResultsTable)
    .where(staleErrors)
    .all();

  // Use batch delete with inArray for better performance
  await db.delete(evalResultsTable).where(staleErrors).run();

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
  const promptMetricsMap = new Map<number, PromptMetrics>();
  for (const [promptIdx] of evalRecord.prompts.entries()) {
    promptMetricsMap.set(promptIdx, createDefaultPromptMetrics());
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

        updatePromptResultCounts(metrics, result);

        // Update scores and other metrics
        metrics.score += result.score ?? 0;
        metrics.totalLatencyMs += result.latencyMs || 0;
        const incurredCost =
          result.response?.incurredCost ?? (result.response?.cached ? 0 : undefined);
        if (incurredCost !== undefined || metrics.incurredCost !== undefined) {
          metrics.incurredCost =
            (metrics.incurredCost ?? metrics.cost) + (incurredCost ?? result.cost ?? 0);
        }
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
          accumulateResponseTokenUsage(metrics.tokenUsage, result.response);
        }

        // Update assertion token usage
        if (result.gradingResult?.tokensUsed) {
          accumulateGradingTokenUsage(metrics.tokenUsage, result.gradingResult.tokensUsed, {
            cached: result.gradingResult.metadata?.cachedResponse,
          });
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
  const resolvedConfig = await resolveRetryConfigs(originalEval, cmdObj);
  return cliState.withConfig(
    resolvedConfig.config,
    () =>
      cliState.withEnv(resolvedConfig.testSuite.env, () =>
        retryWithConfig(originalEval, errorResultIds, cmdObj, resolvedConfig),
      ),
    resolvedConfig.selectedProviderConfigs,
  );
}

async function retryWithConfig(
  originalEval: Eval,
  errorResultIds: string[],
  cmdObj: RetryCommandOptions,
  { testSuite, commandLineOptions, config }: Awaited<ReturnType<typeof resolveRetryConfigs>>,
) {
  const evalId = originalEval.id;

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
  cliState._retryErrorResultIds = errorResultIds;

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
  const retryResults = trackRetryResults(evalId, errorResultIds, !cmdObj.config);
  const evaluateOptions: InternalEvaluateOptions = {
    retryResults,
    maxConcurrency: effectiveDelay && effectiveDelay > 0 ? 1 : effectiveMaxConcurrency,
    delay: effectiveDelay,
    eventSource: 'cli',
    restorePromptColumns: !cmdObj.config,
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
      await deleteErrorResults(retryResults.replacedIds());
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
    delete cliState._retryErrorResultIds;
    cliState.maxConcurrency = undefined;
  }
}
