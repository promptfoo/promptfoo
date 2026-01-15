import { renderMetricName } from '../assertions/index';
import Eval from '../models/eval';
import { ResultFailureReason } from '../types/index';
import {
  accumulateAssertionTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';
import logger from '../logger';
import type { TokenUsage } from '../types/index';

/**
 * Recalculate prompt metrics based on current results in the database.
 * Intended for post-hoc updates that change grading results.
 */
export async function recalculatePromptMetrics(evalRecord: Eval): Promise<void> {
  logger.debug('Recalculating prompt metrics');

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
      metrics.assertFailCount += result.gradingResult.componentResults.filter((r) => !r.pass)
        .length;
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
