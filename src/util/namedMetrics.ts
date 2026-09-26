import { getEnvBool } from '../envars';

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

const SIMPLE_METRIC_PLACEHOLDER =
  /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\}\}/g;
const FORBIDDEN_METRIC_PATH_SEGMENTS = new Set(['env', '__proto__', 'prototype', 'constructor']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveOwnPrimitivePath(
  vars: Record<string, unknown>,
  path: string,
): { safe: boolean; value: string } {
  const segments = path.split('.');
  if (segments.some((segment) => FORBIDDEN_METRIC_PATH_SEGMENTS.has(segment))) {
    return { safe: false, value: '' };
  }

  let current: unknown = vars;
  for (const segment of segments) {
    if (current == null) {
      return { safe: true, value: '' };
    }
    if (!isRecord(current)) {
      return { safe: false, value: '' };
    }

    const descriptor = Object.getOwnPropertyDescriptor(current, segment);
    if (!descriptor) {
      return { safe: true, value: '' };
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      return { safe: false, value: '' };
    }
    current = descriptor.value;
  }

  if (current == null) {
    return { safe: true, value: '' };
  }
  if (['string', 'number', 'boolean'].includes(typeof current)) {
    return { safe: true, value: String(current) };
  }
  return { safe: false, value: '' };
}

/**
 * Render persisted metric names without executing stored template code.
 *
 * Only root and dotted own-data primitive placeholders are supported. Complex
 * Nunjucks syntax remains literal so imported rows cannot access globals, call
 * methods, invoke functions, or run unbounded template control flow during a
 * read.
 */
export function renderPersistedMetricName(
  metric: string | undefined,
  vars: Record<string, unknown>,
): string | undefined {
  if (!metric || !metric.includes('{') || getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
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
  const rendered = metric.replace(SIMPLE_METRIC_PLACEHOLDER, (_placeholder, path: string) => {
    const resolved = resolveOwnPrimitivePath(vars, path);
    safe &&= resolved.safe;
    return resolved.value;
  });

  return safe ? rendered : metric;
}

function getContributingAssertionCounts(
  namedScores: Record<string, unknown>,
  gradingResult: NamedMetricGradingResult | null | undefined,
  testVars: Vars,
  renderComponentMetric: MetricNameRenderer,
): Map<string, number> | undefined {
  const counts = new Map<string, number>();
  let hasUnresolvedMetric = false;
  const componentResults = Array.isArray(gradingResult?.componentResults)
    ? gradingResult.componentResults
    : [];
  for (const componentResult of componentResults) {
    if (!isRecord(componentResult) || !isRecord(componentResult.assertion)) {
      continue;
    }
    const metric =
      typeof componentResult.assertion.metric === 'string'
        ? componentResult.assertion.metric
        : undefined;
    const renderedMetric = renderComponentMetric(metric, testVars);
    if (
      renderComponentMetric === renderPersistedMetricName &&
      renderedMetric !== undefined &&
      renderedMetric === metric &&
      /\{[{%#]/.test(renderedMetric) &&
      !Object.prototype.hasOwnProperty.call(namedScores, renderedMetric)
    ) {
      // This component could contribute to any rendered metric, including one
      // already matched by another component. Partial counts are not denominators.
      hasUnresolvedMetric = true;
    }
    if (renderedMetric !== undefined) {
      counts.set(renderedMetric, (counts.get(renderedMetric) ?? 0) + 1);
    }
  }
  return hasUnresolvedMetric ? undefined : counts;
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
  value: number | undefined,
): void {
  if (value === undefined) {
    delete record[metricName];
    return;
  }
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

/** Accumulate one result's metrics, rendering each component's name only once. */
export function accumulateNamedMetrics(
  accumulator: NamedMetricAccumulator,
  {
    namedScores,
    gradingResult,
    testVars = {},
  }: {
    namedScores: Record<string, unknown>;
    gradingResult: NamedMetricGradingResult | null | undefined;
    testVars?: Vars;
  },
  renderComponentMetric: MetricNameRenderer = renderPersistedMetricName,
): void {
  const scores = Object.entries(namedScores).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  );
  if (scores.length === 0) {
    return;
  }
  const assertionCounts = getContributingAssertionCounts(
    namedScores,
    gradingResult,
    testVars,
    renderComponentMetric,
  );
  for (const [metricName, metricValue] of scores) {
    const assertionCount = assertionCounts ? (assertionCounts.get(metricName) ?? 1) : undefined;
    const storedWeight = getStoredMetricWeight(gradingResult, metricName);
    const weightedScore = storedWeight === undefined ? metricValue : metricValue * storedWeight;
    const useStoredWeight = storedWeight !== undefined && Number.isFinite(weightedScore);
    const previousScore = getOwnFiniteMetricValue(accumulator.namedScores, metricName);
    const previousCount = getOwnFiniteMetricValue(accumulator.namedScoresCount, metricName);
    const nextScore = (previousScore ?? 0) + (useStoredWeight ? weightedScore : metricValue);
    // Missing denominator keys are sticky after the first contribution. A later
    // known row cannot make an earlier unknown contribution measurable again.
    const nextCount =
      assertionCount !== undefined && (previousScore === undefined || previousCount !== undefined)
        ? (previousCount ?? 0) + assertionCount
        : undefined;
    accumulator.namedScoreWeights ||= {};
    const previousWeight =
      getOwnFiniteMetricValue(accumulator.namedScoreWeights, metricName) ?? previousCount;
    const weight = useStoredWeight ? storedWeight : assertionCount;
    const nextWeight =
      weight !== undefined && (previousScore === undefined || previousWeight !== undefined)
        ? (previousWeight ?? 0) + weight
        : undefined;

    // Keep each contribution atomic instead of serializing non-finite totals as JSON null.
    if (
      ![nextScore, nextCount, nextWeight].every(
        (value) => value === undefined || Number.isFinite(value),
      )
    ) {
      continue;
    }
    setOwnMetricValue(accumulator.namedScores, metricName, nextScore);
    setOwnMetricValue(accumulator.namedScoresCount, metricName, nextCount);
    setOwnMetricValue(accumulator.namedScoreWeights, metricName, nextWeight);
  }
}

/**
 * Prompt metrics whose named metric totals an evaluation carried over from a previous run.
 *
 * Retry can only keep the live evaluator's named metric totals when `evaluate()` seeded the
 * prompt from the stored metrics, because a read-side recalculation rebuilds those totals from
 * persisted rows and deliberately refuses to execute stored metric name templates. Object
 * identity used to answer that question, but seeded metrics are `structuredClone`d per column,
 * so the clone is registered here instead. A WeakSet keeps the marker out of the
 * `CompletedPrompt` payload that gets persisted and shared.
 */
const namedMetricsSeededFromPreviousRun = new WeakSet<object>();

/** Records that `metrics` was seeded from a previous run's totals. Returns the same object. */
export function markNamedMetricsSeededFromPreviousRun<T extends object>(metrics: T): T {
  namedMetricsSeededFromPreviousRun.add(metrics);
  return metrics;
}

/** True when `metrics` was seeded from a previous run's totals by the current process. */
export function wereNamedMetricsSeededFromPreviousRun(metrics: unknown): boolean {
  return (
    typeof metrics === 'object' &&
    metrics !== null &&
    namedMetricsSeededFromPreviousRun.has(metrics)
  );
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
