import { getEnvBool } from '../envars';

import type { NamedMetricAccumulator } from './namedMetrics';

type NamedMetricGradingResult = Record<string, unknown>;

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
  const root = segments[0];
  if (root === 'true' || root === 'false' || root === 'none' || root === 'null') {
    return {
      safe: segments.length === 1,
      value: root === 'true' || root === 'false' ? root : '',
    };
  }
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
 * Only boolean/null literals and root or dotted own-data primitives are supported. Complex
 * Nunjucks syntax remains literal so imported rows cannot access globals, call
 * methods, invoke functions, or run unbounded template control flow during a
 * read.
 */
export function renderPersistedMetricName(
  metric: string | undefined,
  vars: Record<string, unknown>,
  maxLength = Infinity,
): string | undefined {
  if (!metric || !metric.includes('{') || getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return metric;
  }

  let safe = true;
  let renderedLength = metric.length;
  const remainder = metric.replace(SIMPLE_METRIC_PLACEHOLDER, (placeholder, path: string) => {
    const resolved = resolveOwnPrimitivePath(vars, path);
    safe &&= resolved.safe;
    renderedLength += resolved.value.length - placeholder.length;
    return '';
  });
  if (
    !safe ||
    remainder.includes('{{') ||
    remainder.includes('}}') ||
    remainder.includes('{%') ||
    remainder.includes('%}') ||
    remainder.includes('{#') ||
    remainder.includes('#}')
  ) {
    return metric;
  }
  if (renderedLength > maxLength) {
    return undefined;
  }
  return metric.replace(
    SIMPLE_METRIC_PLACEHOLDER,
    (_placeholder, path: string) => resolveOwnPrimitivePath(vars, path).value,
  );
}

function getContributingAssertionCounts(
  namedScores: Record<string, unknown>,
  gradingResult: NamedMetricGradingResult | null | undefined,
  testVars: Record<string, unknown>,
): Map<string, number> | undefined {
  const counts = new Map<string, number>();
  const scoreNames = Object.keys(namedScores);
  const maxMetricNameLength = scoreNames.reduce(
    (longest, name) => Math.max(longest, name.length),
    0,
  );
  const metricNames = (
    Array.isArray(gradingResult?.componentResults) ? gradingResult.componentResults : []
  ).flatMap((component) => {
    if (
      !isRecord(component) ||
      !isRecord(component.assertion) ||
      component.assertion.type === 'select-best' ||
      component.assertion.type === 'max-score'
    ) {
      return [];
    }
    const metric = component.assertion.metric;
    return typeof metric === 'string' ? [metric] : [];
  });
  const renderedNames = new Map<string, string | undefined>();
  // Keep expansion work proportional to stored input, with room for short aliases.
  let remainingNameLength = Math.max(
    1024,
    scoreNames.reduce((total, name) => total + name.length, 0) +
      metricNames.reduce((total, name) => total + name.length, 0),
  );
  for (const metric of metricNames) {
    let renderedMetric = renderedNames.get(metric);
    if (!renderedNames.has(metric)) {
      renderedMetric = renderPersistedMetricName(metric, testVars, maxMetricNameLength);
      remainingNameLength -= renderedMetric?.length ?? 0;
      if (remainingNameLength < 0) {
        return undefined;
      }
      if (
        renderedMetric !== undefined &&
        !Object.prototype.hasOwnProperty.call(namedScores, renderedMetric)
      ) {
        // An unresolved template could contribute to an already matched name.
        // A partial count would give that score a misleading denominator.
        if (renderedMetric === metric && /\{[{%#]/.test(metric)) {
          return undefined;
        }
        renderedMetric = undefined;
      }
      renderedNames.set(metric, renderedMetric);
    }
    if (renderedMetric !== undefined) {
      counts.set(renderedMetric, (counts.get(renderedMetric) ?? 0) + 1);
    }
  }
  return counts;
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

function isValidNamedScoreWeight(value: unknown): value is number {
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
    testVars?: Record<string, unknown>;
  },
): void {
  const scores = Object.entries(namedScores).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  );
  if (scores.length === 0) {
    return;
  }
  const assertionCounts = getContributingAssertionCounts(namedScores, gradingResult, testVars);
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
