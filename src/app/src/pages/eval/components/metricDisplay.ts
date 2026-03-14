import nunjucks from 'nunjucks';
import type { Assertion, EvaluateTable, UnifiedConfig } from '@promptfoo/types';

export type MetricDisplayKind = 'percentage' | 'value';

function getAssertionMetricBaseType(type: string): string {
  return type.startsWith('not-') ? type.slice(4) : type;
}

export function isValueMetricAssertion(assertion: { type: string; threshold?: number }): boolean {
  if (assertion.type.startsWith('not-')) {
    return false;
  }
  const baseType = getAssertionMetricBaseType(assertion.type);
  return (baseType === 'cost' || baseType === 'latency') && assertion.threshold === undefined;
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

  let appliedDefaultAssertWithTestVars = false;

  if (Array.isArray(config.tests)) {
    for (const test of config.tests) {
      if (typeof test !== 'object' || test === null) {
        continue;
      }

      const vars = (test.vars ?? {}) as Record<string, unknown>;

      if (defaultAssert) {
        collectMetricKinds(defaultAssert, vars, metricKinds);
        appliedDefaultAssertWithTestVars = true;
      }

      if ('assert' in test) {
        collectMetricKinds(test.assert as Assertion[] | undefined, vars, metricKinds);
      }
    }
  }

  if (!appliedDefaultAssertWithTestVars) {
    collectMetricKinds(defaultAssert, {}, metricKinds);
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
  if (metricKinds[metric] === 'value') {
    return 'value';
  }

  return counts.some((count) => typeof count === 'number' && count > 0) ? 'percentage' : 'value';
}

export function getMetricAverage(kind: MetricDisplayKind, score: number, count: number): number {
  if (kind === 'percentage') {
    return count > 0 ? (score / count) * 100 : 0;
  }

  return count > 0 ? score / count : score;
}
