/**
 * Utility functions for metric name handling in assertions.
 * Separated to avoid circular dependencies between combinator.ts and index.ts.
 */

import logger from '../logger';
import { getNunjucksEngine } from '../util/templates';

const nunjucks = getNunjucksEngine();

/**
 * Renders a metric name template with test variables.
 * @param metric - The metric name, possibly containing Nunjucks template syntax
 * @param vars - The test variables to use for rendering
 * @returns The rendered metric name, or the original if rendering fails
 */
export function renderMetricName(
  metric: string | undefined,
  vars: Record<string, unknown>,
): string | undefined {
  if (!metric) {
    return metric;
  }
  try {
    const rendered = nunjucks.renderString(metric, vars);
    if (rendered === '' && metric !== '') {
      logger.debug(`Metric template "${metric}" rendered to empty string`);
    }
    return rendered;
  } catch (error) {
    logger.warn(
      `Failed to render metric template "${metric}": ${error instanceof Error ? error.message : error}`,
    );
    return metric;
  }
}
