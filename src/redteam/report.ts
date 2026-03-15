import chalk from 'chalk';
import Table from 'cli-table3';
import { riskCategorySeverityMap, Severity } from './constants';
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

/**
 * Generates a unique base display ID for a plugin instance.
 * For policy plugins, includes an index number and truncated policy text to differentiate multiple instances.
 * @param plugin - The plugin configuration.
 * @param index - Optional index number for plugins with the same base ID (e.g., multiple policy plugins).
 * @returns A unique base display ID for the plugin.
 */
export function getPluginBaseDisplayId(
  plugin: { id: string; config?: Record<string, any> },
  index?: number,
): string {
  if (plugin.id === 'policy') {
    const policyText =
      typeof plugin.config?.policy === 'string'
        ? plugin.config.policy.trim().replace(/\n+/g, ' ')
        : '';
    const truncated =
      policyText.length > 40 ? policyText.slice(0, 40) + '...' : policyText || 'custom';
    // Include index to ensure uniqueness even if policy text snippets are identical
    return index !== undefined ? `policy #${index}: "${truncated}"` : `policy: "${truncated}"`;
  }
  return plugin.id;
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
 * Extracts sorting key from a plugin/strategy display ID.
 * Handles formats like "(Hmong) policy #1: ...", "policy #12: ...", "jailbreak:meta (Hmong)"
 * @param id - The display ID to parse.
 * @returns A tuple of [policyNumber, language, baseId] for sorting.
 */
export function extractSortKey(id: string): [number, string, string] {
  // Extract language prefix like "(Hmong) " or suffix like " (Hmong)"
  const langPrefixMatch = id.match(/^\(([^)]+)\)\s*/);
  const langSuffixMatch = id.match(/\s+\(([^)]+)\)$/);
  const language = langPrefixMatch?.[1] || langSuffixMatch?.[1] || '';

  // Remove language from ID for base comparison
  let baseId = id;
  if (langPrefixMatch) {
    baseId = id.slice(langPrefixMatch[0].length);
  }
  if (langSuffixMatch) {
    baseId = baseId.slice(0, -langSuffixMatch[0].length);
  }

  // Extract policy number if present (e.g., "policy #12: ...")
  const policyMatch = baseId.match(/policy\s*#(\d+)/);
  const policyNum = policyMatch ? parseInt(policyMatch[1], 10) : 0;

  return [policyNum, language, baseId];
}

/**
 * Sorts plugin/strategy IDs: by policy number (numeric), then by base ID, then by language.
 * @param a - First ID to compare.
 * @param b - Second ID to compare.
 * @returns Comparison result for sorting.
 */
export function sortReportIds(a: string, b: string): number {
  const [aNum, aLang, aBase] = extractSortKey(a);
  const [bNum, bLang, bBase] = extractSortKey(b);

  // First sort by policy number (0 means no policy number, goes last among policies)
  if (aNum !== bNum) {
    if (aNum === 0) {
      return 1;
    }
    if (bNum === 0) {
      return -1;
    }
    return aNum - bNum;
  }

  // Then sort by base ID (for non-policy plugins)
  const baseCompare = aBase.localeCompare(bBase);
  if (baseCompare !== 0) {
    return baseCompare;
  }

  // Finally sort by language
  return aLang.localeCompare(bLang);
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
    .sort((a, b) => sortReportIds(a[0], b[0]))
    .forEach(([id, { requested, generated }]) => {
      table.push([rowIndex++, 'Plugin', id, requested, generated, getStatus(requested, generated)]);
    });

  Object.entries(strategyResults)
    .sort((a, b) => sortReportIds(a[0], b[0]))
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
