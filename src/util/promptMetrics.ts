import { ResultFailureReason } from '../types/index';
import { subtractNamedMetric } from './namedMetrics';
import {
  accumulateResultTokenUsage,
  createEmptyTokenUsage,
  subtractTokenUsage,
} from './tokenUsageUtils';

import type { evalResultsTable } from '../database/tables';
import type { DerivedMetric, GradingResult, PromptMetrics, TokenUsage } from '../types/index';

export function createDefaultPromptMetrics(): PromptMetrics {
  return {
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
  };
}

export function getAssertionCounts(
  grade: GradingResult | null | undefined,
): { pass: number; fail: number } | null {
  if (!grade || typeof grade !== 'object' || Array.isArray(grade)) {
    return null;
  }
  const components = grade.componentResults;
  if (Array.isArray(components)) {
    return {
      pass: components.filter((r) => r?.pass === true).length,
      fail: components.filter((r) => r?.pass === false).length,
    };
  }
  // Old componentless comparisons combine the provider outcome with the assertion verdict.
  return Object.prototype.hasOwnProperty.call(grade, 'componentResults') ||
    typeof grade.pass !== 'boolean' ||
    !['human', 'select-best', 'max-score'].includes(grade.assertion?.type ?? '') ||
    (grade.assertion?.type === 'select-best' && !grade.pass)
    ? null
    : { pass: grade.pass ? 1 : 0, fail: grade.pass ? 0 : 1 };
}

export async function recomputeDerivedMetrics(
  metrics: PromptMetrics,
  derivedMetrics: DerivedMetric[] | undefined,
  promptEvalCount: number,
): Promise<void> {
  if (!derivedMetrics?.length) {
    return;
  }
  const math = await import('mathjs');
  metrics.namedScores ||= {};
  const evalContext: Record<string, number> = {};
  for (const [name, value] of Object.entries(metrics.namedScores)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      evalContext[name] = value;
    }
  }
  evalContext.__count = promptEvalCount;
  for (const metric of derivedMetrics) {
    if (typeof metric.value !== 'string') {
      continue;
    }
    try {
      const value = math.evaluate(metric.value, evalContext);
      if (typeof value === 'number' && Number.isFinite(value)) {
        metrics.namedScores[metric.name] = value;
        evalContext[metric.name] = value;
      } else {
        delete metrics.namedScores[metric.name];
        delete evalContext[metric.name];
      }
    } catch {
      delete metrics.namedScores[metric.name];
      delete evalContext[metric.name];
    }
  }
}

function subtractTrackedMetric(current: number | undefined, delta: unknown): number {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    return current ?? 0;
  }
  return current === undefined ? 0 : current - delta;
}

export function subtractResultFromPromptMetrics(
  metrics: PromptMetrics,
  result: typeof evalResultsTable.$inferSelect,
  survivingAssertionCounts?: { pass: number; fail: number },
  survivingAssertionTokenUsage?: TokenUsage,
): void {
  if (result.success) {
    metrics.testPassCount = Math.max(0, subtractTrackedMetric(metrics.testPassCount, 1));
  } else if (result.failureReason === ResultFailureReason.ERROR) {
    metrics.testErrorCount = Math.max(0, subtractTrackedMetric(metrics.testErrorCount, 1));
  } else {
    metrics.testFailCount = Math.max(0, subtractTrackedMetric(metrics.testFailCount, 1));
  }

  const assertionCounts = getAssertionCounts(result.gradingResult);
  if (survivingAssertionCounts) {
    metrics.assertPassCount = survivingAssertionCounts.pass;
    metrics.assertFailCount = survivingAssertionCounts.fail;
  } else if (assertionCounts) {
    metrics.assertPassCount = Math.max(
      0,
      subtractTrackedMetric(metrics.assertPassCount, assertionCounts.pass),
    );
    metrics.assertFailCount = Math.max(
      0,
      subtractTrackedMetric(metrics.assertFailCount, assertionCounts.fail),
    );
  }

  metrics.score = subtractTrackedMetric(metrics.score, result.score);
  metrics.totalLatencyMs = subtractTrackedMetric(metrics.totalLatencyMs, result.latencyMs);
  metrics.cost = subtractTrackedMetric(metrics.cost, result.cost);
  if (metrics.incurredCost !== undefined) {
    metrics.incurredCost = subtractTrackedMetric(
      metrics.incurredCost,
      result.response?.incurredCost ?? (result.response?.cached ? 0 : result.cost),
    );
  }

  for (const [metricName, metricValue] of Object.entries(result.namedScores ?? {})) {
    if (typeof metricValue === 'number' && Number.isFinite(metricValue)) {
      subtractNamedMetric(metrics, {
        metricName,
        metricValue,
        gradingResult: result.gradingResult,
        metadata: result.metadata,
      });
    }
  }

  if (metrics.tokenUsage) {
    const delta: TokenUsage = metrics.tokenUsage.incurredTokenUsage
      ? { incurredTokenUsage: {} }
      : {};
    accumulateResultTokenUsage(delta, result);
    subtractTokenUsage(metrics.tokenUsage, delta);
    if (survivingAssertionTokenUsage) {
      // Rebuild only when every survivor retains its grading usage.
      metrics.tokenUsage.assertions = survivingAssertionTokenUsage.assertions;
      if (metrics.tokenUsage.incurredTokenUsage) {
        metrics.tokenUsage.incurredTokenUsage.assertions =
          survivingAssertionTokenUsage.incurredTokenUsage?.assertions;
      }
    }
  }
}
