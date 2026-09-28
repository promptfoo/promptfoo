import logger from '../logger';
import { ResultFailureReason } from '../types/index';
import { getNamedMetricContribution, type NamedMetricAccumulator } from '../util/namedMetrics';
import {
  createDefaultPromptMetrics,
  getAssertionCounts,
  recomputeDerivedMetrics,
} from '../util/promptMetrics';
import {
  accumulateResultTokenUsage,
  cloneTokenUsageBreakdown,
  hasGradingTokenUsage,
} from '../util/tokenUsageUtils';

import type Eval from '../models/eval';

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

  const promptMetrics = evalRecord.prompts.map(() => ({
    metrics: createDefaultPromptMetrics(),
    unknownAssertionCounts: false,
    unknownGradingUsage: false,
    unknownNamedMetrics: new Map<string, Set<keyof NamedMetricAccumulator>>(),
  }));

  // Stream results in batches to avoid OOM with large evaluations
  let currentResultId: string | undefined;
  try {
    for await (const batch of evalRecord.fetchResultsBatched(RECALCULATE_BATCH_SIZE)) {
      batchNumber++;
      logger.debug(`Processing batch ${batchNumber} with ${batch.length} results`);

      for (const result of batch) {
        currentResultId = result.id;
        const state = promptMetrics[result.promptIdx];
        if (!state) {
          logger.debug(`Skipping result with invalid promptIdx: ${result.promptIdx}`, {
            resultId: result.id,
            evalId: evalRecord.id,
          });
          continue;
        }
        const { metrics } = state;

        if (result.success) {
          metrics.testPassCount++;
        } else if (result.failureReason === ResultFailureReason.ERROR) {
          metrics.testErrorCount++;
        } else {
          metrics.testFailCount++;
        }

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
          const contribution = getNamedMetricContribution({
            metricName: key,
            metricValue: value,
            gradingResult: result.gradingResult,
            metadata: result.metadata,
          });
          for (const bucket of Object.keys(contribution) as (keyof NamedMetricAccumulator)[]) {
            const delta = contribution[bucket];
            if (delta === undefined) {
              const unknown = state.unknownNamedMetrics.get(key) ?? new Set();
              unknown.add(bucket);
              state.unknownNamedMetrics.set(key, unknown);
            } else {
              metrics[bucket] ||= {};
              metrics[bucket][key] = (metrics[bucket][key] ?? 0) + delta;
            }
          }
        }

        const knownUngraded =
          result.gradingResult == null && result.metadata?.__promptfoo?.originallyUngraded === true;
        const counts = getAssertionCounts(result.gradingResult);
        if (counts) {
          metrics.assertPassCount += counts.pass;
          metrics.assertFailCount += counts.fail;
        } else if (!knownUngraded) {
          state.unknownAssertionCounts = true;
        }

        state.unknownGradingUsage ||= !knownUngraded && !hasGradingTokenUsage(result.gradingResult);
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

  for (const [promptIdx, state] of promptMetrics.entries()) {
    const { metrics: newMetrics } = state;
    const previous = evalRecord.prompts[promptIdx].metrics;
    const previousCount =
      (previous?.testPassCount ?? 0) +
      (previous?.testFailCount ?? 0) +
      (previous?.testErrorCount ?? 0);
    const savedCount =
      newMetrics.testPassCount + newMetrics.testFailCount + newMetrics.testErrorCount;
    // Failed inserts can leave accounted work only in the header.
    if (previous && Number.isFinite(previousCount) && previousCount > savedCount) {
      await recomputeDerivedMetrics(previous, derivedMetrics, previousCount);
      continue;
    }
    // Stripped and historical rows cannot replace retained totals with guessed contributions.
    if (state.unknownAssertionCounts) {
      newMetrics.assertPassCount = previous?.assertPassCount ?? 0;
      newMetrics.assertFailCount = previous?.assertFailCount ?? 0;
    }
    if (state.unknownGradingUsage) {
      newMetrics.tokenUsage.assertions = previous?.tokenUsage?.assertions;
      const incurredAssertions = previous?.tokenUsage?.incurredTokenUsage?.assertions;
      if (incurredAssertions || newMetrics.tokenUsage.incurredTokenUsage) {
        newMetrics.tokenUsage.incurredTokenUsage ||= cloneTokenUsageBreakdown(
          newMetrics.tokenUsage,
        );
        newMetrics.tokenUsage.incurredTokenUsage.assertions = incurredAssertions;
      }
    }
    for (const [name, buckets] of state.unknownNamedMetrics) {
      for (const bucket of buckets) {
        const value = previous?.[bucket]?.[name];
        if (bucket === 'namedScoresCount' && !previous?.namedScoresCount) {
          // A missing legacy map keeps row-level metric discovery available.
          delete (newMetrics as NamedMetricAccumulator).namedScoresCount;
        } else if (value === undefined) {
          delete newMetrics[bucket]?.[name];
        } else {
          newMetrics[bucket] ||= {};
          newMetrics[bucket][name] = value;
        }
      }
    }
    for (const metric of derivedMetrics ?? []) {
      const previousValue = previous?.namedScores?.[metric.name];
      if (typeof metric.value !== 'string' && previousValue !== undefined) {
        newMetrics.namedScores[metric.name] = previousValue;
      }
    }
    await recomputeDerivedMetrics(
      newMetrics,
      derivedMetrics,
      newMetrics.testPassCount + newMetrics.testFailCount + newMetrics.testErrorCount,
    );
    evalRecord.prompts[promptIdx].metrics = newMetrics;
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
