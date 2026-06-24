import { isTemplatingDisabled } from './templatePolicy';

import type { GradingResult, Vars } from '../types/index';

export interface NamedMetricAccumulator {
  namedScores: Record<string, number>;
  namedScoresCount: Record<string, number>;
  namedScoreWeights?: Record<string, number>;
}

export type NamedMetricGradingResult =
  | Pick<GradingResult, 'componentResults' | 'namedScoreWeights'>
  | Record<string, unknown>;

export type MetricNameRenderer = (
  metric: string | undefined,
  vars: Record<string, unknown>,
) => string | undefined;

interface NamedMetricContribution {
  assertionCount: number;
  metricWeightTotal: number;
  weightedScoreTotal: number;
}

const SIMPLE_METRIC_PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Render persisted metric names without executing stored template code.
 *
 * Only documented root-variable placeholders are supported. Complex Nunjucks
 * syntax remains literal so imported rows cannot access globals, call methods,
 * invoke functions, or run unbounded template control flow during a read.
 */
export function renderPersistedMetricName(
  metric: string | undefined,
  vars: Record<string, unknown>,
): string | undefined {
  if (!metric || !metric.includes('{') || isTemplatingDisabled()) {
    return metric;
  }

  const remainder = metric.replace(SIMPLE_METRIC_PLACEHOLDER, '');
  if (
    remainder.includes('{{') ||
    remainder.includes('}}') ||
    remainder.includes('{%') ||
    remainder.includes('%}') ||
    remainder.includes('{#') ||
    remainder.includes('#}')
  ) {
    return metric;
  }

  let safe = true;
  const rendered = metric.replace(SIMPLE_METRIC_PLACEHOLDER, (_placeholder, variable: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(vars, variable);
    if (!descriptor) {
      return '';
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      safe = false;
      return '';
    }

    const value = descriptor.value;
    if (value == null) {
      return '';
    }
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      return String(value);
    }

    safe = false;
    return '';
  });

  return safe ? rendered : metric;
}

function getContributingAssertionCount(
  gradingResult: NamedMetricGradingResult | null | undefined,
  metricName: string,
  testVars: Vars,
  renderComponentMetric: MetricNameRenderer,
): number {
  const componentResults = Array.isArray(gradingResult?.componentResults)
    ? gradingResult.componentResults
    : [];
  const contributingAssertions = componentResults.reduce((count, componentResult) => {
    if (!isRecord(componentResult) || !isRecord(componentResult.assertion)) {
      return count;
    }
    const metric =
      typeof componentResult.assertion.metric === 'string'
        ? componentResult.assertion.metric
        : undefined;
    const renderedMetric = renderComponentMetric(metric, testVars);
    return renderedMetric === metricName ? count + 1 : count;
  }, 0);

  return contributingAssertions > 0 ? contributingAssertions : 1;
}

function getOwnFiniteMetricValue(
  record: Record<string, number>,
  metricName: string,
): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, metricName)) {
    return undefined;
  }
  const value = record[metricName];
  return Number.isFinite(value) ? value : undefined;
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

export function isValidNamedScoreWeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getStoredMetricWeight(
  gradingResult: NamedMetricGradingResult | null | undefined,
  metricName: string,
): number | undefined {
  const namedScoreWeights = isRecord(gradingResult?.namedScoreWeights)
    ? gradingResult.namedScoreWeights
    : undefined;
  if (!namedScoreWeights || !Object.prototype.hasOwnProperty.call(namedScoreWeights, metricName)) {
    return undefined;
  }
  const weight = namedScoreWeights[metricName];
  return isValidNamedScoreWeight(weight) ? weight : undefined;
}

function getNamedMetricContribution({
  metricName,
  metricValue,
  gradingResult,
  testVars = {},
  renderComponentMetric,
}: {
  metricName: string;
  metricValue: number;
  gradingResult: NamedMetricGradingResult | null | undefined;
  testVars?: Vars;
  renderComponentMetric: MetricNameRenderer;
}): NamedMetricContribution {
  const assertionCount = getContributingAssertionCount(
    gradingResult,
    metricName,
    testVars,
    renderComponentMetric,
  );
  const storedWeight = getStoredMetricWeight(gradingResult, metricName);
  const weightedScore = storedWeight === undefined ? metricValue : metricValue * storedWeight;
  const useStoredWeight = storedWeight !== undefined && Number.isFinite(weightedScore);

  return {
    assertionCount,
    metricWeightTotal: useStoredWeight ? storedWeight : assertionCount,
    weightedScoreTotal: useStoredWeight ? weightedScore : metricValue,
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
    gradingResult: NamedMetricGradingResult | null | undefined;
    testVars?: Vars;
  },
  renderComponentMetric: MetricNameRenderer = renderPersistedMetricName,
): void {
  if (!Number.isFinite(metricValue)) {
    return;
  }

  const { assertionCount, metricWeightTotal, weightedScoreTotal } = getNamedMetricContribution({
    metricName,
    metricValue,
    gradingResult,
    testVars,
    renderComponentMetric,
  });
  const nextScore =
    (getOwnFiniteMetricValue(accumulator.namedScores, metricName) ?? 0) + weightedScoreTotal;
  const nextCount =
    (getOwnFiniteMetricValue(accumulator.namedScoresCount, metricName) ?? 0) + assertionCount;
  accumulator.namedScoreWeights ||= {};
  const nextWeight =
    (getOwnFiniteMetricValue(accumulator.namedScoreWeights, metricName) ?? 0) + metricWeightTotal;

  // A PromptMetrics payload cannot represent non-finite totals. Keep the
  // contribution atomic instead of serializing Infinity/NaN as JSON null.
  if (![nextScore, nextCount, nextWeight].every(Number.isFinite)) {
    return;
  }

  setOwnMetricValue(accumulator.namedScores, metricName, nextScore);
  setOwnMetricValue(accumulator.namedScoresCount, metricName, nextCount);
  setOwnMetricValue(accumulator.namedScoreWeights, metricName, nextWeight);
}

export function backfillNamedScoreWeights(accumulator: NamedMetricAccumulator): void {
  accumulator.namedScoreWeights ||= {};

  for (const [metricName, assertionCount] of Object.entries(accumulator.namedScoresCount)) {
    if (
      Number.isFinite(assertionCount) &&
      getOwnFiniteMetricValue(accumulator.namedScoreWeights, metricName) === undefined
    ) {
      setOwnMetricValue(accumulator.namedScoreWeights, metricName, assertionCount);
    }
  }
}
