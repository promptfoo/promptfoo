type SemanticFrontierTestCase = {
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

type SemanticFrontierSummary = {
  active: boolean;
  complete: boolean;
  minimumPortfolioSize: number;
  bands: Record<string, { unreachableFeatureIds: string[] }>;
};

export type SemanticFrontierDiagnostic = {
  completeFrontierCount: number;
  frontierCount: number;
  pluginId: string;
  structurallyDegraded: boolean;
  unreachableFeatureIds: string[];
};

function isSemanticFrontierSummary(value: unknown): value is SemanticFrontierSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const summary = value as Partial<SemanticFrontierSummary>;
  const bands = summary.bands;
  return (
    typeof summary.active === 'boolean' &&
    typeof summary.complete === 'boolean' &&
    typeof summary.minimumPortfolioSize === 'number' &&
    Boolean(bands) &&
    typeof bands === 'object' &&
    !Array.isArray(bands) &&
    Object.values(bands).every((band) => {
      if (!band || typeof band !== 'object') {
        return false;
      }

      const unreachableFeatureIds = (band as { unreachableFeatureIds?: unknown })
        .unreachableFeatureIds;
      return (
        Array.isArray(unreachableFeatureIds) &&
        unreachableFeatureIds.every((featureId) => typeof featureId === 'string')
      );
    })
  );
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
    pluginFrontiers.set(
      `${String(testCase.metadata?.contextId ?? '')}:${JSON.stringify(semanticFrontier)}`,
      semanticFrontier,
    );
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
