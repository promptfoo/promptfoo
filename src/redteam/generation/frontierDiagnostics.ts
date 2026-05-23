import type { TestCase } from '../../types/index';
import type { SemanticFrontierSummary } from './portfolio';

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
  return (
    typeof summary.active === 'boolean' &&
    typeof summary.complete === 'boolean' &&
    typeof summary.minimumPortfolioSize === 'number' &&
    Boolean(summary.bands) &&
    typeof summary.bands === 'object'
  );
}

export function summarizeSemanticFrontierDiagnosticsFromTests(
  testCases: readonly TestCase[],
): SemanticFrontierDiagnostic[] {
  const frontiersByPlugin = new Map<string, Map<string, SemanticFrontierSummary>>();

  for (const testCase of testCases) {
    const pluginId = testCase.metadata?.pluginId;
    const semanticFrontier = testCase.metadata?.semanticFrontier;

    if (typeof pluginId !== 'string' || !isSemanticFrontierSummary(semanticFrontier)) {
      continue;
    }

    const pluginFrontiers = frontiersByPlugin.get(pluginId) ?? new Map();
    pluginFrontiers.set(JSON.stringify(semanticFrontier), semanticFrontier);
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
