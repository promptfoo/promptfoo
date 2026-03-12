import type { Assertion, EvaluateTable } from '@promptfoo/types';

export type MetricDisplayKind = 'percentage' | 'value';

function resolveMetricTemplate(
  metric: string | undefined,
  vars: Record<string, unknown>,
): string | undefined {
  if (!metric) {
    return metric;
  }

  return metric.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => {
    const value = key
      .split('.')
      .reduce<unknown>(
        (current, part) =>
          current && typeof current === 'object'
            ? (current as Record<string, unknown>)[part]
            : undefined,
        vars,
      );

    return value === undefined || value === null ? match : String(value);
  });
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
    const kind =
      (assertion.type === 'cost' || assertion.type === 'latency') &&
      assertion.threshold === undefined
        ? 'value'
        : 'percentage';

    addMetricKind(metricKinds, renderedMetric, kind);
  });
}

export function getMetricDisplayKinds(
  table: EvaluateTable | null,
): Record<string, MetricDisplayKind> {
  if (!table) {
    return {};
  }

  const metricKinds: Record<string, MetricDisplayKind> = {};

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
