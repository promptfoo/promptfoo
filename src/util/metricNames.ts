import { getNunjucksEngine } from './templates';

const nunjucks = getNunjucksEngine();

/**
 * Renders a metric name template for node-layer metric aggregation.
 *
 * Assertion execution exposes its own renderer from the core layer. Keeping
 * this implementation local avoids introducing a dependency cycle between
 * filtered metrics and assertion handlers.
 */
export function renderMetricName(
  metric: string | undefined,
  vars: Record<string, unknown>,
): string | undefined {
  if (!metric) {
    return metric;
  }

  try {
    return nunjucks.renderString(metric, vars);
  } catch {
    return metric;
  }
}
