import logger from '../logger';
import { ResultFailureReason } from '../types/index';
import { accumulateNamedMetric } from '../util/namedMetrics';
import {
  createDefaultPromptMetrics,
  getAssertionCounts,
  recomputeDerivedMetrics,
} from '../util/promptMetrics';
import { accumulateResultTokenUsage } from '../util/tokenUsageUtils';

import type Eval from '../models/eval';
import type { PromptMetrics } from '../types/index';

// Batch size of 1000 balances memory usage vs. database query overhead for large evals (40K+ results)
const RECALCULATE_BATCH_SIZE = 1000;

/**
 * Recalculates prompt metrics from saved results.
 * Uses streaming batched iteration to avoid OOM with large evaluations (40K+ results).
 */
export async function recalculatePromptMetrics(evalRecord: Eval): Promise<void> {
  logger.debug('Recalculating prompt metrics from saved results');

  const startTime = Date.now();
  let batchNumber = 0;
  let totalProcessed = 0;
  const derivedMetrics = Array.isArray(evalRecord.config?.derivedMetrics)
    ? evalRecord.config.derivedMetrics
    : undefined;

  // Create a map to track metrics by promptIdx
  const promptMetricsMap = new Map<number, PromptMetrics>();

  // Initialize metrics for each prompt
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
          });
        }

        // Update assertion counts
        const counts = getAssertionCounts(result.gradingResult);
        if (counts) {
          metrics.assertPassCount += counts.pass;
          metrics.assertFailCount += counts.fail;
        }

        accumulateResultTokenUsage(metrics.tokenUsage, result);
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
      for (const metric of derivedMetrics ?? []) {
        const previous = evalRecord.prompts[promptIdx].metrics?.namedScores?.[metric.name];
        if (typeof metric.value !== 'string' && previous !== undefined) {
          newMetrics.namedScores[metric.name] = previous;
        }
      }
      await recomputeDerivedMetrics(
        newMetrics,
        derivedMetrics,
        newMetrics.testPassCount + newMetrics.testFailCount + newMetrics.testErrorCount,
      );
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
