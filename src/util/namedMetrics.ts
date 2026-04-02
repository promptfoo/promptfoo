import { renderMetricName } from '../assertions/index';

import type { GradingResult, Vars } from '../types/index';

export interface NamedMetricAccumulator {
  namedScores: Record<string, number>;
  namedScoresCount: Record<string, number>;
  namedScoreWeights?: Record<string, number>;
}

interface NamedMetricContribution {
  assertionCount: number;
  metricWeightTotal: number;
  weightedScoreTotal: number;
}

function getContributingAssertionCount(
  gradingResult: GradingResult | null | undefined,
  metricName: string,
  testVars: Vars,
): number {
  const contributingAssertions =
    gradingResult?.componentResults?.reduce((count, componentResult) => {
      const renderedMetric = renderMetricName(componentResult.assertion?.metric, testVars);
      return renderedMetric === metricName ? count + 1 : count;
    }, 0) ?? 0;

  return contributingAssertions > 0 ? contributingAssertions : 1;
}

function getNamedMetricContribution({
  metricName,
  metricValue,
  gradingResult,
  testVars = {},
}: {
  metricName: string;
  metricValue: number;
  gradingResult: GradingResult | null | undefined;
  testVars?: Vars;
}): NamedMetricContribution {
  const assertionCount = getContributingAssertionCount(gradingResult, metricName, testVars);
  const namedScoreWeights = gradingResult?.namedScoreWeights;
  const hasNamedScoreWeight = Object.prototype.hasOwnProperty.call(
    namedScoreWeights ?? {},
    metricName,
  );
  const metricWeightTotal = hasNamedScoreWeight
    ? (namedScoreWeights?.[metricName] ?? 0)
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
    testVars,
  }: {
    metricName: string;
    metricValue: number;
    gradingResult: GradingResult | null | undefined;
    testVars?: Vars;
  },
): void {
  const { assertionCount, metricWeightTotal, weightedScoreTotal } = getNamedMetricContribution({
    metricName,
    metricValue,
    gradingResult,
    testVars,
  });

  accumulator.namedScores[metricName] =
    (accumulator.namedScores[metricName] ?? 0) + weightedScoreTotal;
  accumulator.namedScoresCount[metricName] =
    (accumulator.namedScoresCount[metricName] ?? 0) + assertionCount;

  accumulator.namedScoreWeights ||= {};
  accumulator.namedScoreWeights[metricName] =
    (accumulator.namedScoreWeights[metricName] ?? 0) + metricWeightTotal;
}

export function backfillNamedScoreWeights(accumulator: NamedMetricAccumulator): void {
  accumulator.namedScoreWeights ||= {};

  for (const [metricName, assertionCount] of Object.entries(accumulator.namedScoresCount)) {
    if (!Object.prototype.hasOwnProperty.call(accumulator.namedScoreWeights, metricName)) {
      accumulator.namedScoreWeights[metricName] = assertionCount;
    }
  }
}
