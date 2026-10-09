import cliState from '../cliState';
import logger from '../logger';
import { ResultFailureReason } from '../types/index';
import { accumulateNamedMetric } from '../util/namedMetrics';
import {
  accumulateGradingTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';

import type Eval from '../models/eval';
import type { TokenUsage } from '../types/index';

// Batch size of 1000 balances memory usage vs. database query overhead for large evals (40K+ results)
const RECALCULATE_BATCH_SIZE = 1000;

/**
 * Recalculates prompt metrics from saved results.
 * Uses streaming batched iteration to avoid OOM with large evaluations (40K+ results).
 */
export async function recalculatePromptMetrics(
  evalRecord: Eval,
  { preserveDerivedMetrics = false }: { preserveDerivedMetrics?: boolean } = {},
): Promise<void> {
  logger.debug('Recalculating prompt metrics from saved results');
  const derivedMetricNames = preserveDerivedMetrics
    ? (cliState.config?.derivedMetrics ?? evalRecord.config.derivedMetrics ?? []).map(
        (metric) => metric.name,
      )
    : [];

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
      incurredCost?: number;
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
    for await (const batch of evalRecord.fetchResultsBatched(RECALCULATE_BATCH_SIZE, {
      projection: 'metrics',
    })) {
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

        // Match live accounting and checkpoint subtraction: responses without usage still
        // count as one request, while an explicit numRequests: 0 remains zero.
        accumulateResponseTokenUsage(metrics.tokenUsage, result.response);

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
      // Derived values may depend on functions and prior steps. Preserve only configured
      // derived entries; ordinary named assertion metrics above remain row-authoritative.
      const previousNamedScores = evalRecord.prompts[promptIdx].metrics?.namedScores;
      for (const name of derivedMetricNames) {
        if (
          previousNamedScores &&
          Object.prototype.hasOwnProperty.call(previousNamedScores, name)
        ) {
          newMetrics.namedScores[name] = previousNamedScores[name];
        }
      }
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
