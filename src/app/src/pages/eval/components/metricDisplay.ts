import nunjucks from 'nunjucks';
import type { Assertion, EvaluateTable, UnifiedConfig } from '@promptfoo/types';

export type MetricDisplayKind = 'percentage' | 'value';

export function isValueMetricAssertion(assertion: { type: string; threshold?: number }): boolean {
  if (assertion.threshold !== undefined || assertion.type.startsWith('not-')) {
    return false;
  }
  return assertion.type === 'cost' || assertion.type === 'latency';
}

function resolveMetricTemplate(
  metric: string | undefined,
  vars: Record<string, unknown>,
): string | undefined {
  if (!metric) {
    return metric;
  }

  try {
    const rendered = nunjucks.renderString(metric, vars);
    return rendered || undefined;
  } catch {
    return metric;
  }
}

function addMetricKind(
  metricKinds: Record<string, MetricDisplayKind>,
  metric: string | undefined,
  kind: MetricDisplayKind,
) {
  if (!metric) {
    return;
  }

  if (metricKinds[metric] === 'value' || kind === 'value') {
    metricKinds[metric] = 'value';
    return;
  }

  metricKinds[metric] = 'percentage';
}

function getTestVars(test: unknown): Record<string, unknown> {
  if (typeof test !== 'object' || !test) {
    return {};
  }

  const testObject = test as Record<string, unknown>;
  if (!('vars' in testObject)) {
    return {};
  }

  const vars = testObject.vars;
  if (typeof vars !== 'object' || !vars || Array.isArray(vars)) {
    return {};
  }

  return vars as Record<string, unknown>;
}

function collectMetricKinds(
  assertions: Assertion[] | undefined,
  vars: Record<string, unknown>,
  metricKinds: Record<string, MetricDisplayKind>,
) {
  if (!assertions) {
    return;
  }

  assertions.forEach((assertion) => {
    if ('assert' in assertion && Array.isArray(assertion.assert)) {
      collectMetricKinds(assertion.assert, vars, metricKinds);
    }

    const renderedMetric = resolveMetricTemplate(assertion.metric, vars);
    const kind = isValueMetricAssertion(assertion) ? 'value' : 'percentage';

    addMetricKind(metricKinds, renderedMetric, kind);
  });
}

function collectMetricKindsFromConfig(
  config: Partial<UnifiedConfig>,
  metricKinds: Record<string, MetricDisplayKind>,
) {
  const defaultAssert =
    typeof config.defaultTest === 'object'
      ? (config.defaultTest?.assert as Assertion[] | undefined)
      : undefined;

  const tests = Array.isArray(config.tests)
    ? config.tests.filter((test): test is object => typeof test === 'object' && test !== null)
    : [];

  if (tests.length === 0) {
    collectMetricKinds(defaultAssert, {}, metricKinds);
    return;
  }

  for (const test of tests) {
    const vars = getTestVars(test);
    collectMetricKinds(defaultAssert, vars, metricKinds);
    if ('assert' in test) {
      collectMetricKinds(test.assert as Assertion[] | undefined, vars, metricKinds);
    }
  }
}

export function getMetricDisplayKinds(
  table: EvaluateTable | null,
  config?: Partial<UnifiedConfig> | null,
): Record<string, MetricDisplayKind> {
  if (!table) {
    return {};
  }

  const metricKinds: Record<string, MetricDisplayKind> = {};

  // Walk config assertions first (always the full set, not affected by pagination)
  if (config) {
    collectMetricKindsFromConfig(config, metricKinds);
  }

  // Also walk table body rows (covers runtime-resolved templates)
  table.body.forEach((row) => {
    collectMetricKinds(
      row.test?.assert as Assertion[] | undefined,
      (row.test?.vars ?? {}) as Record<string, unknown>,
      metricKinds,
    );
  });

  return metricKinds;
}

export function getMetricDisplayKind(
  metric: string,
  metricKinds: Record<string, MetricDisplayKind>,
  counts: Array<number | undefined>,
): MetricDisplayKind {
  const configuredKind = metricKinds[metric];
  if (configuredKind) {
    return configuredKind;
  }

  return counts.some((count) => typeof count === 'number' && count > 0) ? 'percentage' : 'value';
}

export function getMetricAverage(kind: MetricDisplayKind, score: number, count: number): number {
  if (kind === 'percentage') {
    return count > 0 ? (score / count) * 100 : 0;
  }

  return count > 0 ? score / count : score;
}
