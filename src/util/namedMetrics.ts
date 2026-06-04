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
  const componentResults = Array.isArray(gradingResult?.componentResults)
    ? gradingResult.componentResults
    : [];
  const contributingAssertions = componentResults.reduce((count, componentResult) => {
    if (!componentResult || typeof componentResult !== 'object') {
      return count;
    }
    const renderedMetric = renderMetricName(componentResult.assertion?.metric, testVars);
    return renderedMetric === metricName ? count + 1 : count;
  }, 0);

  return contributingAssertions > 0 ? contributingAssertions : 1;
}

function getOwnMetricValue(record: Record<string, number>, metricName: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(record, metricName) ? record[metricName] : undefined;
}

function setOwnMetricValue(
  record: Record<string, number>,
  metricName: string,
  value: number,
): void {
  Object.defineProperty(record, metricName, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
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

  setOwnMetricValue(
    accumulator.namedScores,
    metricName,
    (getOwnMetricValue(accumulator.namedScores, metricName) ?? 0) + weightedScoreTotal,
  );
  setOwnMetricValue(
    accumulator.namedScoresCount,
    metricName,
    (getOwnMetricValue(accumulator.namedScoresCount, metricName) ?? 0) + assertionCount,
  );

  accumulator.namedScoreWeights ||= {};
  setOwnMetricValue(
    accumulator.namedScoreWeights,
    metricName,
    (getOwnMetricValue(accumulator.namedScoreWeights, metricName) ?? 0) + metricWeightTotal,
  );
}

export function backfillNamedScoreWeights(accumulator: NamedMetricAccumulator): void {
  accumulator.namedScoreWeights ||= {};

  for (const [metricName, assertionCount] of Object.entries(accumulator.namedScoresCount)) {
    if (!Object.prototype.hasOwnProperty.call(accumulator.namedScoreWeights, metricName)) {
      setOwnMetricValue(accumulator.namedScoreWeights, metricName, assertionCount);
    }
  }
}
