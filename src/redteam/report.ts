import chalk from 'chalk';
import Table from 'cli-table3';
import { riskCategorySeverityMap, Severity } from './constants';
import { makeInlinePolicyIdSync } from './plugins/policy/utils';
import { getShortPluginId } from './util';

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

// Policy identifiers are shortened for display only. Report rows must not use labels as keys.
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

export interface PluginReportResult {
  id: string;
  requested: number;
  generated: number;
}

export function generateReport(
  pluginResults: PluginReportResult[],
  strategyResults: Record<string, { requested: number; generated: number }>,
): string {
  const table = new Table({
    head: ['#', 'Type', 'ID', 'Requested', 'Generated', 'Status'].map((h) =>
      chalk.dim(chalk.white(h)),
    ),
    colWidths: [5, 10, 40, 12, 12, 14],
  });

  let rowIndex = 1;

  [...pluginResults]
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach(({ id, requested, generated }) => {
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
