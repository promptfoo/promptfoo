import logger from '../logger';
import Eval from '../models/eval';
import { ResultFailureReason } from '../types/index';
import { accumulateNamedMetric } from '../util/namedMetrics';
import {
  accumulateAssertionTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';

import type { TokenUsage } from '../types/index';

// Batch size of 1000 balances memory usage vs. database query overhead for large evals (40K+ results).
const RECALCULATE_BATCH_SIZE = 1000;

/**
 * Recalculate prompt metrics based on current results in the database.
 * Intended for post-hoc updates and retry cleanup that change persisted grading results.
 */
export async function recalculatePromptMetrics(evalRecord: Eval): Promise<void> {
  logger.debug('Recalculating prompt metrics');

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

        // Update named scores
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
