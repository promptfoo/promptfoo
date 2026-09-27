import type { GradingResult } from '../types/index';

export interface NamedMetricAccumulator {
  namedScores: Record<string, number>;
  namedScoresCount?: Record<string, number>;
  namedScoreWeights?: Record<string, number>;
}

type NamedMetricContribution = Record<keyof NamedMetricAccumulator, number | undefined>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getContributingAssertionCount(
  gradingResult: GradingResult | null | undefined,
  metricName: string,
): number | undefined {
  const countsKnown = gradingResult?.metadata?.namedMetricCountsKnown === true;
  if (!Array.isArray(gradingResult?.componentResults)) {
    return countsKnown ? 1 : undefined;
  }
  let count = 0;
  for (const component of gradingResult.componentResults) {
    // Comparisons run after named metrics have been credited.
    if (
      component?.assertion?.type === 'select-best' ||
      component?.assertion?.type === 'max-score'
    ) {
      continue;
    }
    const renderedMetric = component?.metadata?.renderedMetric;
    const metric =
      typeof renderedMetric === 'string' ? renderedMetric : component?.assertion?.metric;
    if (metric === metricName) {
      count++;
    } else if (
      !countsKnown &&
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

export function getNamedMetricContribution(
  {
    metricName,
    metricValue,
    gradingResult,
  }: {
    metricName: string;
    metricValue: number;
    gradingResult: GradingResult | null | undefined;
  },
  fallbackAssertionCount?: number,
): NamedMetricContribution {
  const assertionCount =
    getContributingAssertionCount(gradingResult, metricName) ?? fallbackAssertionCount;
  const namedScoreWeights = gradingResult?.namedScoreWeights;
  const hasNamedScoreWeight = Object.prototype.hasOwnProperty.call(
    namedScoreWeights ?? {},
    metricName,
  );
  const namedScoreWeight = namedScoreWeights?.[metricName];
  const metricWeightTotal = isFiniteNumber(namedScoreWeight) ? namedScoreWeight : assertionCount;

  return {
    namedScoresCount: assertionCount,
    namedScoreWeights: metricWeightTotal,
    namedScores: hasNamedScoreWeight
      ? metricWeightTotal === undefined
        ? undefined
        : metricValue * metricWeightTotal
      : Array.isArray(gradingResult?.componentResults) || assertionCount !== undefined
        ? metricValue
        : undefined,
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
  const contribution = getNamedMetricContribution(
    {
      metricName,
      metricValue,
      gradingResult,
    },
    1,
  );
  for (const bucket of Object.keys(contribution) as (keyof NamedMetricAccumulator)[]) {
    accumulator[bucket] ||= {};
    accumulator[bucket][metricName] =
      (accumulator[bucket][metricName] ?? 0) + contribution[bucket]!;
  }
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
  const contribution = getNamedMetricContribution({
    metricName,
    metricValue,
    gradingResult,
  });

  for (const bucket of Object.keys(contribution) as (keyof NamedMetricAccumulator)[]) {
    const delta = contribution[bucket];
    const current = accumulator[bucket]?.[metricName];
    if (delta !== undefined && isFiniteNumber(current)) {
      accumulator[bucket]![metricName] = current - delta;
    }
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
