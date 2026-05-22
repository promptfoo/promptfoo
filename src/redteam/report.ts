import chalk from 'chalk';
import Table from 'cli-table3';
import { riskCategorySeverityMap, Severity } from './constants';
import { makeInlinePolicyIdSync } from './plugins/policy/utils';
import { getShortPluginId } from './util';

/**
 * Determines the severity level for a plugin based on its configuration or ID.
 * @param pluginId - The plugin identifier.
 * @param pluginConfig - Optional plugin configuration that may include severity.
 * @returns The severity level for the plugin.
 */
export function getPluginSeverity(pluginId: string, pluginConfig?: Record<string, any>): Severity {
  if (pluginConfig?.severity) {
    return pluginConfig.severity;
  }

  const shortId = getShortPluginId(pluginId);
  return shortId in riskCategorySeverityMap
    ? riskCategorySeverityMap[shortId as keyof typeof riskCategorySeverityMap]
    : Severity.Low;
}

const POLICY_PREVIEW_MAX_LENGTH = 20;

function truncateForPreview(text: string): string {
  const normalized = text.trim().replace(/\n+/g, ' ');
  return normalized.length > POLICY_PREVIEW_MAX_LENGTH
    ? normalized.slice(0, POLICY_PREVIEW_MAX_LENGTH) + '...'
    : normalized;
}

/**
 * Generates a unique base display ID for a plugin instance.
 * For policy plugins, includes a stable policy identifier to differentiate multiple instances.
 * @param plugin - The plugin configuration.
 * @returns A unique base display ID for the plugin.
 */
export function getPluginDisplayId(plugin: { id: string; config?: Record<string, any> }): string {
  if (plugin.id !== 'policy') {
    return plugin.id;
  }

  const policyConfig = plugin.config?.policy;

  if (typeof policyConfig === 'object' && policyConfig !== null && policyConfig.id) {
    const shortId = String(policyConfig.id).replace(/-/g, '').slice(0, 12);
    if (policyConfig.name) {
      return `policy [${shortId}]: ${String(policyConfig.name)}`;
    }
    const preview = policyConfig.text ? truncateForPreview(String(policyConfig.text)) : '';
    return preview ? `policy [${shortId}]: ${preview}` : `policy [${shortId}]`;
  }

  if (typeof policyConfig === 'string') {
    const hash = makeInlinePolicyIdSync(policyConfig);
    const preview = truncateForPreview(policyConfig);
    return `policy [${hash}]: ${preview}`;
  }

  return 'policy';
}

/**
 * Determines the status of test generation based on requested and generated counts.
 * @param requested - The number of requested tests.
 * @param generated - The number of generated tests.
 * @returns A colored string indicating the status.
 */
export function getStatus(requested: number, generated: number): string {
  if (requested === 0 && generated === 0) {
    return chalk.gray('Skipped');
  }
  if (generated === 0) {
    return chalk.red('Failed');
  }
  if (generated < requested) {
    return chalk.yellow('Partial');
  }
  return chalk.green('Success');
}

/**
 * Generates a formatted report of plugin and strategy results.
 * @param pluginResults - Results from plugin test generation.
 * @param strategyResults - Results from strategy test generation.
 * @returns A formatted string containing the report table.
 */
export function generateReport(
  pluginResults: Record<string, { requested: number; generated: number }>,
  strategyResults: Record<string, { requested: number; generated: number }>,
): string {
  const table = new Table({
    head: ['#', 'Type', 'ID', 'Requested', 'Generated', 'Status'].map((h) =>
      chalk.dim(chalk.white(h)),
    ),
    colWidths: [5, 10, 40, 12, 12, 14],
  });

  let rowIndex = 1;

  Object.entries(pluginResults)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, { requested, generated }]) => {
      table.push([rowIndex++, 'Plugin', id, requested, generated, getStatus(requested, generated)]);
    });

  Object.entries(strategyResults)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, { requested, generated }]) => {
      table.push([
        rowIndex++,
        'Strategy',
        id,
        requested,
        generated,
        getStatus(requested, generated),
      ]);
    });

  return `\nTest Generation Report:\n${table.toString()}`;
}
