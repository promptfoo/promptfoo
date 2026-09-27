import { createEmptyTokenUsage } from './tokenUsageUtils';

import type { DerivedMetric, GradingResult, PromptMetrics } from '../types/index';

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
