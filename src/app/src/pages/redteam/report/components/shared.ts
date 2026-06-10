import {
  type categoryAliases,
  categoryAliasesReverse,
  displayNameOverrides,
} from '@promptfoo/redteam/constants';
import {
  deserializePolicyIdFromMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import type { EvaluateResult, GradingResult } from '@promptfoo/types';

// TODO(ian): Need a much easier way to get the pluginId (and strategyId) from a result

/**
 * Represents a test with metadata used in red team report components.
 * This interface aligns with the structure expected by getStrategyIdFromTest and getPluginIdFromResult.
 */
export interface TestWithMetadata {
  prompt: string;
  output: string;
  gradingResult?: GradingResult;
  result?: EvaluateResult;
  metadata?: {
    strategyId?: string;
    [key: string]: unknown;
  };
}

export type SemanticFrontierDiagnostic = {
  completeFrontierCount: number;
  frontierCount: number;
  pluginId: string;
  structurallyDegraded: boolean;
  unreachableFeatureIds: string[];
};

type SemanticFrontierBandSummary = {
  featureCount: number;
  observedFeatureCount: number;
  observedFeatureIds: string[];
  reachableFeatureCount: number;
  reachableFeatureIds: string[];
  unreachableFeatureIds: string[];
};

type SemanticFrontierSummary = {
  active: boolean;
  complete: boolean;
  minimumPortfolioSize: number;
  bands: Record<string, SemanticFrontierBandSummary>;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSemanticFrontierBandSummary(value: unknown): value is SemanticFrontierBandSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const band = value as Partial<SemanticFrontierBandSummary>;
  return (
    typeof band.featureCount === 'number' &&
    typeof band.observedFeatureCount === 'number' &&
    isStringArray(band.observedFeatureIds) &&
    typeof band.reachableFeatureCount === 'number' &&
    isStringArray(band.reachableFeatureIds) &&
    isStringArray(band.unreachableFeatureIds)
  );
}

function isSemanticFrontierSummary(value: unknown): value is SemanticFrontierSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const summary = value as Partial<SemanticFrontierSummary>;
  return (
    typeof summary.active === 'boolean' &&
    typeof summary.complete === 'boolean' &&
    typeof summary.minimumPortfolioSize === 'number' &&
    Boolean(summary.bands) &&
    typeof summary.bands === 'object' &&
    !Array.isArray(summary.bands) &&
    Object.values(summary.bands).every(isSemanticFrontierBandSummary)
  );
}

function getSemanticFrontierKey(summary: SemanticFrontierSummary): string {
  const bands = Object.fromEntries(
    Object.entries(summary.bands)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bandId, band]) => [
        bandId,
        {
          featureCount: band.featureCount,
          observedFeatureCount: band.observedFeatureCount,
          observedFeatureIds: [...band.observedFeatureIds].sort(),
          reachableFeatureCount: band.reachableFeatureCount,
          reachableFeatureIds: [...band.reachableFeatureIds].sort(),
          unreachableFeatureIds: [...band.unreachableFeatureIds].sort(),
        },
      ]),
  );

  return JSON.stringify({
    active: summary.active,
    bands,
    complete: summary.complete,
    minimumPortfolioSize: summary.minimumPortfolioSize,
  });
}

export function getStrategyIdFromTest(test: TestWithMetadata): string {
  // Check metadata directly on test
  if (test.metadata?.strategyId) {
    return test.metadata.strategyId as string;
  }

  // Check metadata from test.result.testCase
  if (test.result?.testCase?.metadata?.strategyId) {
    return test.result.testCase.metadata.strategyId as string;
  }

  // Default fallback
  return 'basic';
}

export function getPluginIdFromResult(result: EvaluateResult): string | null {
  if (
    result.metadata?.pluginId &&
    // Policy plugins are handled separately
    result.metadata.pluginId !== 'policy'
  ) {
    return result.metadata.pluginId as string;
  }

  const harmCategory = result.vars?.harmCategory || result.metadata?.harmCategory;
  if (harmCategory) {
    return categoryAliasesReverse[harmCategory as keyof typeof categoryAliases];
  }

  const metricNames =
    result.gradingResult?.componentResults?.map((result) => result.assertion?.metric) || [];

  for (const metric of metricNames) {
    if (!metric) {
      continue;
    }

    // Parse and return the policy ID from the policy metric
    if (isPolicyMetric(metric)) {
      return deserializePolicyIdFromMetric(metric);
    }

    const metricParts = metric.split('/');
    const baseName = metricParts[0];

    if (baseName && categoryAliasesReverse[baseName as keyof typeof categoryAliases]) {
      return categoryAliasesReverse[baseName as keyof typeof categoryAliases];
    }
  }

  return null;
}

export function summarizeSemanticFrontierDiagnosticsFromResults(
  results: readonly EvaluateResult[],
): SemanticFrontierDiagnostic[] {
  const frontiersByPlugin = new Map<string, Map<string, SemanticFrontierSummary>>();

  for (const result of results) {
    const pluginId = result.testCase.metadata?.pluginId;
    const semanticFrontier = result.testCase.metadata?.semanticFrontier;
    if (
      typeof pluginId !== 'string' ||
      !isSemanticFrontierSummary(semanticFrontier) ||
      !semanticFrontier.active
    ) {
      continue;
    }

    const pluginFrontiers = frontiersByPlugin.get(pluginId) ?? new Map();
    pluginFrontiers.set(getSemanticFrontierKey(semanticFrontier), semanticFrontier);
    frontiersByPlugin.set(pluginId, pluginFrontiers);
  }

  return [...frontiersByPlugin.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pluginId, frontierMap]) => {
      const summaries = [...frontierMap.values()];
      const unreachableFeatureIds = [
        ...new Set(
          summaries.flatMap((summary) =>
            Object.values(summary.bands).flatMap((band) => band.unreachableFeatureIds),
          ),
        ),
      ].sort();

      return {
        completeFrontierCount: summaries.filter((summary) => summary.complete).length,
        frontierCount: summaries.length,
        pluginId,
        structurallyDegraded: unreachableFeatureIds.length > 0,
        unreachableFeatureIds,
      };
    });
}

export function getPluginDisplayName(pluginId: string): string {
  return displayNameOverrides[pluginId as keyof typeof displayNameOverrides] || pluginId;
}

export const getPassRateStyles = (passRate: number): { bg: string; text: string } => {
  if (passRate >= 0.9) {
    return {
      bg: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  if (passRate >= 0.7) {
    return {
      bg: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
    };
  }
  if (passRate >= 0.5) {
    return {
      bg: 'bg-orange-500',
      text: 'text-orange-600 dark:text-orange-400',
    };
  }
  return {
    bg: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
  };
};
