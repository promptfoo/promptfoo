import type { GradingResult } from '../types/index';

export interface NamedMetricAccumulator {
  namedScores: Record<string, number>;
  namedScoresCount?: Record<string, number>;
  namedScoreWeights?: Record<string, number>;
}

interface NamedMetricContribution {
  assertionCount: number;
  metricWeightTotal: number;
  weightedScoreTotal: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getContributingAssertionCount(
  gradingResult: GradingResult | null | undefined,
  metricName: string,
): number | undefined {
  if (!Array.isArray(gradingResult?.componentResults)) {
    return undefined;
  }
  let count = 0;
  for (const component of gradingResult.componentResults) {
    const renderedMetric = component?.metadata?.renderedMetric;
    const metric =
      typeof renderedMetric === 'string' ? renderedMetric : component?.assertion?.metric;
    if (metric === metricName) {
      count++;
    } else if (
      typeof renderedMetric !== 'string' &&
      typeof metric === 'string' &&
      /\{[{%#]/.test(metric)
    ) {
      // Older reports retain templates without their original rendering context.
      return undefined;
    }
  }
  return count || 1;
}

export function hasNamedMetricContribution(
  gradingResult: GradingResult | null | undefined,
  metricName: string,
): boolean {
  return getContributingAssertionCount(gradingResult, metricName) !== undefined;
}

function getNamedMetricContribution({
  metricName,
  metricValue,
  gradingResult,
}: {
  metricName: string;
  metricValue: number;
  gradingResult: GradingResult | null | undefined;
}): NamedMetricContribution {
  const assertionCount = getContributingAssertionCount(gradingResult, metricName) ?? 1;
  const namedScoreWeights = gradingResult?.namedScoreWeights;
  const hasNamedScoreWeight = Object.prototype.hasOwnProperty.call(
    namedScoreWeights ?? {},
    metricName,
  );
  const namedScoreWeight = namedScoreWeights?.[metricName];
  const metricWeightTotal = hasNamedScoreWeight
    ? isFiniteNumber(namedScoreWeight)
      ? namedScoreWeight
      : assertionCount
    : assertionCount;

  return {
    assertionCount,
    metricWeightTotal,
    weightedScoreTotal: hasNamedScoreWeight ? metricValue * metricWeightTotal : metricValue,
  };
}

export function accumulateNamedMetric(
  accumulator: NamedMetricAccumulator,
  {
    metricName,
    metricValue,
    gradingResult,
  }: {
    metricName: string;
    metricValue: number;
    gradingResult: GradingResult | null | undefined;
  },
): void {
  const { assertionCount, metricWeightTotal, weightedScoreTotal } = getNamedMetricContribution({
    metricName,
    metricValue,
    gradingResult,
  });

  accumulator.namedScores[metricName] =
    (accumulator.namedScores[metricName] ?? 0) + weightedScoreTotal;
  accumulator.namedScoresCount ||= {};
  accumulator.namedScoresCount[metricName] =
    (accumulator.namedScoresCount[metricName] ?? 0) + assertionCount;

  accumulator.namedScoreWeights ||= {};
  accumulator.namedScoreWeights[metricName] =
    (accumulator.namedScoreWeights[metricName] ?? 0) + metricWeightTotal;
}

/** Remove a row contribution while preserving absent legacy count and weight maps. */
export function subtractNamedMetric(
  accumulator: NamedMetricAccumulator,
  {
    metricName,
    metricValue,
    gradingResult,
  }: {
    metricName: string;
    metricValue: number;
    gradingResult: GradingResult | null | undefined;
  },
): void {
  accumulator.namedScores ||= {};
  const { assertionCount, metricWeightTotal, weightedScoreTotal } = getNamedMetricContribution({
    metricName,
    metricValue,
    gradingResult,
  });

  accumulator.namedScores[metricName] =
    (accumulator.namedScores[metricName] ?? weightedScoreTotal) - weightedScoreTotal;
  if (accumulator.namedScoresCount) {
    accumulator.namedScoresCount[metricName] =
      (accumulator.namedScoresCount[metricName] ?? assertionCount) - assertionCount;
  }
  if (accumulator.namedScoreWeights) {
    accumulator.namedScoreWeights[metricName] =
      (accumulator.namedScoreWeights[metricName] ?? metricWeightTotal) - metricWeightTotal;
  }

  const score = accumulator.namedScores[metricName] ?? 0;
  const count = accumulator.namedScoresCount?.[metricName] ?? 0;
  const weight = accumulator.namedScoreWeights?.[metricName] ?? 0;
  if (Math.abs(score) < Number.EPSILON && count === 0 && Math.abs(weight) < Number.EPSILON) {
    delete accumulator.namedScores[metricName];
    delete accumulator.namedScoresCount?.[metricName];
    delete accumulator.namedScoreWeights?.[metricName];
  }
}

export function backfillNamedScoreWeights(accumulator: NamedMetricAccumulator): void {
  accumulator.namedScoreWeights ||= {};

  for (const [metricName, assertionCount] of Object.entries(accumulator.namedScoresCount ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(accumulator.namedScoreWeights, metricName)) {
      accumulator.namedScoreWeights[metricName] = assertionCount;
    }
  }
}
