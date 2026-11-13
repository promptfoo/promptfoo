import { ResultFailureReason } from '../../types/results';
import { createEmptyTokenUsage } from '../tokenUsageUtils';

import type { EvaluateResult, PromptMetrics } from '../../types/index';

export function createDefaultPromptMetrics(): PromptMetrics {
  return {
    score: 0,
    testPassCount: 0,
    testFailCount: 0,
    testErrorCount: 0,
    testCacheHitCount: 0,
    assertPassCount: 0,
    assertFailCount: 0,
    totalLatencyMs: 0,
    tokenUsage: createEmptyTokenUsage(),
    namedScores: {},
    namedScoresCount: {},
    namedScoreWeights: {},
    cost: 0,
  };
}

export function updatePromptResultCounts(
  metrics: PromptMetrics,
  row: Pick<EvaluateResult, 'success' | 'failureReason' | 'response'>,
) {
  metrics.testPassCount += row.success ? 1 : 0;
  if (!row.success) {
    if (row.failureReason === ResultFailureReason.ERROR) {
      metrics.testErrorCount += 1;
    } else {
      metrics.testFailCount += 1;
    }
  }
  if (row.response?.cached) {
    metrics.testCacheHitCount = (metrics.testCacheHitCount ?? 0) + 1;
  }
}
