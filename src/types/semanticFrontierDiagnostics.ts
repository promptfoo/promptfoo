type SemanticFrontierBandSummary = {
  featureCount: number;
  observedFeatureCount: number;
  observedFeatureIds: string[];
  reachableFeatureCount: number;
  reachableFeatureIds: string[];
  unreachableFeatureIds: string[];
};

export type SemanticFrontierSummary = {
  active: boolean;
  complete: boolean;
  minimumPortfolioSize: number;
  bands: Record<string, SemanticFrontierBandSummary>;
};

type SemanticFrontierTestCase = { metadata?: Record<string, unknown>; vars?: unknown };
type FrontierGroup = { observedFeatureIds?: Set<string>; summary: SemanticFrontierSummary };

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
function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
function isSemanticFrontierBandSummary(value: unknown): value is SemanticFrontierBandSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const band = value as Partial<SemanticFrontierBandSummary>;
  if (
    !isNonnegativeInteger(band.featureCount) ||
    !isNonnegativeInteger(band.observedFeatureCount) ||
    !isStringArray(band.observedFeatureIds) ||
    !isNonnegativeInteger(band.reachableFeatureCount) ||
    !isStringArray(band.reachableFeatureIds) ||
    !isStringArray(band.unreachableFeatureIds)
  ) {
    return false;
  }
  const observed = new Set(band.observedFeatureIds);
  const reachable = new Set(band.reachableFeatureIds);
  const unreachable = new Set(band.unreachableFeatureIds);
  return (
    observed.size === band.observedFeatureCount &&
    reachable.size === band.reachableFeatureCount &&
    unreachable.size === band.unreachableFeatureIds.length &&
    band.featureCount === reachable.size + unreachable.size &&
    [...observed].every((id) => reachable.has(id)) &&
    [...unreachable].every((id) => !reachable.has(id))
  );
}
function isSemanticFrontierSummary(value: unknown): value is SemanticFrontierSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const summary = value as Partial<SemanticFrontierSummary>;
  const bands =
    summary.bands && typeof summary.bands === 'object' && !Array.isArray(summary.bands)
      ? Object.values(summary.bands)
      : [];
  return (
    typeof summary.active === 'boolean' &&
    typeof summary.complete === 'boolean' &&
    isNonnegativeInteger(summary.minimumPortfolioSize) &&
    bands.length > 0 &&
    bands.every(isSemanticFrontierBandSummary) &&
    summary.complete === bands.every((band) => band.observedFeatureCount === band.featureCount)
  );
}
function getSemanticFrontierKey(summary: SemanticFrontierSummary): string {
  return JSON.stringify({
    active: summary.active,
    complete: summary.complete,
    minimumPortfolioSize: summary.minimumPortfolioSize,
    bands: Object.fromEntries(
      Object.entries(summary.bands)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, band]) => [
          id,
          {
            featureCount: band.featureCount,
            observedFeatureCount: band.observedFeatureCount,
            reachableFeatureCount: band.reachableFeatureCount,
            observedFeatureIds: [...band.observedFeatureIds].sort(),
            reachableFeatureIds: [...band.reachableFeatureIds].sort(),
            unreachableFeatureIds: [...band.unreachableFeatureIds].sort(),
          },
        ]),
    ),
  });
}
function getObservedFeatureIds(value: unknown): string[] | undefined {
  const predicates =
    value && typeof value === 'object' ? (value as { predicates?: unknown }).predicates : undefined;
  if (!predicates || typeof predicates !== 'object') {
    return undefined;
  }
  return Object.entries(predicates)
    .filter(([, seen]) => seen === true)
    .map(([id]) => id);
}
export function summarizeSemanticFrontierDiagnosticsFromTests(
  testCases: readonly unknown[],
): SemanticFrontierDiagnostic[] {
  const frontiersByPlugin = new Map<string, Map<string, FrontierGroup>>();
  for (const value of testCases) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const testCase = value as SemanticFrontierTestCase;
    const pluginId = testCase.metadata?.pluginId;
    const summary = testCase.metadata?.semanticFrontier;
    if (typeof pluginId !== 'string' || !isSemanticFrontierSummary(summary) || !summary.active) {
      continue;
    }
    const groups = frontiersByPlugin.get(pluginId) ?? new Map();
    const key = JSON.stringify([
      testCase.metadata?.contextId ?? null,
      testCase.metadata?.language ?? null,
      getSemanticFrontierKey(summary),
    ]);
    const group = groups.get(key) ?? { summary };
    const observed = getObservedFeatureIds(testCase.metadata?.attackSignature);
    if (observed) {
      group.observedFeatureIds ??= new Set();
      observed.forEach((id) => group.observedFeatureIds?.add(id));
    }
    groups.set(key, group);
    frontiersByPlugin.set(pluginId, groups);
  }
  return [...frontiersByPlugin.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pluginId, map]) => {
      const groups = [...map.values()];
      const unreachableFeatureIds = [
        ...new Set(
          groups.flatMap(({ summary }) =>
            Object.values(summary.bands).flatMap((band) => band.unreachableFeatureIds),
          ),
        ),
      ].sort();
      return {
        pluginId,
        frontierCount: groups.length,
        completeFrontierCount: groups.filter(({ summary, observedFeatureIds }) =>
          Object.values(summary.bands).every((band) =>
            observedFeatureIds
              ? band.unreachableFeatureIds.length === 0 &&
                band.reachableFeatureIds.every((id) => observedFeatureIds.has(id))
              : band.unreachableFeatureIds.length === 0 &&
                band.observedFeatureCount === band.reachableFeatureCount,
          ),
        ).length,
        structurallyDegraded: unreachableFeatureIds.length > 0,
        unreachableFeatureIds,
      };
    });
}
