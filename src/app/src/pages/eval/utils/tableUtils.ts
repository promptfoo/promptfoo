/**
 * Utility functions for table data processing.
 * Extracted from the old monolithic store to improve maintainability.
 */

import { Severity } from '@promptfoo/redteam/constants';
import {
  isPolicyMetric,
  isValidPolicyObject,
  makeInlinePolicyId,
} from '@promptfoo/redteam/plugins/policy/utils';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import type { PolicyObject } from '@promptfoo/redteam/types';
import type {
  EvaluateTable,
  RedteamPluginObject,
  UnifiedConfig,
} from '@promptfoo/types';
import type { ResultsFilter } from '../types';

/**
 * Computes the number of highlighted results in the table.
 * Highlighted results have a grading comment starting with '!highlight'.
 */
export function computeHighlightCount(table: EvaluateTable | null): number {
  if (!table) {
    return 0;
  }
  return table.body.reduce((count, row) => {
    return (
      count +
      row.outputs.filter((o) => o?.gradingResult?.comment?.trim().startsWith('!highlight')).length
    );
  }, 0);
}

/**
 * Extracts all unique named metrics from the table, excluding policy metrics.
 * Policy metrics are handled separately by the policy filter.
 */
export function computeAvailableMetrics(table: EvaluateTable | null): string[] {
  if (!table || !table.head?.prompts) {
    return [];
  }

  const metrics = new Set<string>();
  table.head.prompts.forEach((prompt) => {
    if (prompt.metrics?.namedScores) {
      Object.keys(prompt.metrics.namedScores).forEach((metric) => {
        // Exclude policy metrics as they are handled by the separate policy filter
        if (!isPolicyMetric(metric)) {
          metrics.add(metric);
        }
      });
    }
  });

  return Array.from(metrics).sort();
}

/**
 * Extracts unique policy IDs from redteam plugins.
 */
export function buildPolicyOptions(plugins?: RedteamPluginObject[]): string[] {
  const policyIds = new Set<string>();
  plugins?.forEach((plugin) => {
    if (typeof plugin !== 'string' && plugin.id === 'policy') {
      const policy = plugin?.config?.policy;
      if (policy) {
        if (isValidPolicyObject(policy)) {
          policyIds.add(policy.id);
        } else {
          policyIds.add(makeInlinePolicyId(policy));
        }
      }
    }
  });

  return Array.from(policyIds).sort();
}

export type PolicyIdToNameMap = Record<PolicyObject['id'], PolicyObject['name']>;

/**
 * Creates a mapping of policy IDs to their names for display purposes.
 * Used by the filter form to show policy names in the dropdown.
 */
export function extractPolicyIdToNameMap(plugins: RedteamPluginObject[]): PolicyIdToNameMap {
  const policyMap: PolicyIdToNameMap = {};

  plugins.forEach((plugin) => {
    if (typeof plugin !== 'string' && plugin.id === 'policy') {
      const policy = plugin?.config?.policy;
      if (policy && isValidPolicyObject(policy)) {
        policyMap[policy.id] = policy.name;
      }
    }
  });

  return policyMap;
}

/**
 * Extracts unique strategy IDs from redteam strategies.
 * Always includes 'basic' as a default strategy.
 */
export function extractUniqueStrategyIds(strategies?: Array<string | { id: string }> | null): string[] {
  const strategyIds =
    strategies?.map((strategy) => (typeof strategy === 'string' ? strategy : strategy.id)) ?? [];

  return Array.from(new Set([...strategyIds, 'basic']));
}

/**
 * Computes available severity levels from redteam plugins.
 * Returns them in order of criticality (Critical, High, Medium, Low).
 */
export function computeAvailableSeverities(
  plugins?: Array<string | { id: string; severity?: string }> | null,
): string[] {
  if (!plugins || plugins.length === 0) {
    return [];
  }

  // Get the risk category severity map with any overrides from plugins
  const severityMap = getRiskCategorySeverityMap(
    plugins.map((plugin) => (typeof plugin === 'string' ? { id: plugin } : plugin)) as any,
  );

  // Extract unique severities from the map
  const severities = new Set<string>();
  Object.values(severityMap).forEach((severity) => {
    if (severity) {
      severities.add(severity);
    }
  });

  // Return sorted array of severity values (in order of criticality)
  const severityOrder = [Severity.Critical, Severity.High, Severity.Medium, Severity.Low];
  return severityOrder.filter((sev) => severities.has(sev));
}

/**
 * Builds filter options for redteam-specific filters (plugin, strategy, severity, policy).
 * Returns an empty object for non-redteam evaluations.
 *
 * @param config - The eval config
 * @param table - The eval table (needed to extract policy options from metrics)
 */
export function buildRedteamFilterOptions(
  config?: Partial<UnifiedConfig> | null,
  table?: EvaluateTable | null,
): { plugin: string[]; strategy: string[]; severity: string[]; policy: string[] } | {} {
  const isRedteam = Boolean(config?.redteam);

  // For non-redteam evaluations, don't provide redteam-specific filter options.
  // Note: This is separate from metadata filtering - if users have metadata fields
  // named "plugin", "strategy", or "severity", they can still filter on them using
  // the metadata filter type (which uses field/value pairs).
  if (!isRedteam) {
    return {};
  }

  return {
    // Deduplicate plugins (handles custom plugins)
    plugin: Array.from(
      new Set(
        config?.redteam?.plugins?.map((plugin) =>
          typeof plugin === 'string' ? plugin : plugin.id,
        ) ?? [],
      ),
    ),
    strategy: extractUniqueStrategyIds(config?.redteam?.strategies),
    severity: computeAvailableSeverities(config?.redteam?.plugins),
    policy: buildPolicyOptions(config?.redteam?.plugins),
  };
}

/**
 * Determines if a filter is considered "applied" based on its type and values.
 * A filter is applied when it has the minimum required fields populated.
 */
export function isFilterApplied(filter: Partial<ResultsFilter> | ResultsFilter): boolean {
  if (filter.type === 'metadata') {
    // For metadata filters with exists operator, only field is required
    if (filter.operator === 'exists') {
      return Boolean(filter.field);
    }
    // For other metadata operators, both field and value are required
    return Boolean(filter.value && filter.field);
  }
  // For non-metadata filters, value is required
  return Boolean(filter.value);
}
