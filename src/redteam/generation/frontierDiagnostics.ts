import type { SemanticFrontierSummary } from './portfolio';

type SemanticFrontierTestCase = {
  metadata?: Record<string, unknown>;
  vars?: unknown;
};

export type SemanticFrontierDiagnostic = {
  completeFrontierCount: number;
  frontierCount: number;
  pluginId: string;
  structurallyDegraded: boolean;
  unreachableFeatureIds: string[];
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSemanticFrontierBandSummary(
  value: unknown,
): value is SemanticFrontierSummary['bands'][string] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const band = value as Partial<SemanticFrontierSummary['bands'][string]>;
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

export function summarizeSemanticFrontierDiagnosticsFromTests(
  testCases: readonly SemanticFrontierTestCase[],
): SemanticFrontierDiagnostic[] {
  const frontiersByPlugin = new Map<string, Map<string, SemanticFrontierSummary>>();

  for (const testCase of testCases) {
    const pluginId = testCase.metadata?.pluginId;
    const semanticFrontier = testCase.metadata?.semanticFrontier;

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
