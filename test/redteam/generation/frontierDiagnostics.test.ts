import { describe, expect, it } from 'vitest';
import { summarizeSemanticFrontierDiagnosticsFromTests } from '../../../src/redteam/generation/frontierDiagnostics';

import type { SemanticFrontierSummary } from '../../../src/redteam/generation/portfolio';
import type { TestCase } from '../../../src/types/index';

function createSummary(
  complete: boolean,
  unreachableFeatureIds: string[] = [],
): SemanticFrontierSummary {
  return {
    active: true,
    complete,
    minimumPortfolioSize: 3,
    bands: {
      relationship: {
        featureCount: 2,
        observedFeatureCount: complete ? 2 : 1,
        observedFeatureIds: complete ? ['claimsFamilyRelationship', 'claimsSelfRelationship'] : [],
        reachableFeatureCount: 2 - unreachableFeatureIds.length,
        reachableFeatureIds: ['claimsFamilyRelationship', 'claimsSelfRelationship'].filter(
          (feature) => !unreachableFeatureIds.includes(feature),
        ),
        unreachableFeatureIds,
      },
    },
  };
}

describe('summarizeSemanticFrontierDiagnosticsFromTests', () => {
  it('deduplicates repeated per-test frontier metadata and reports structural degradation', () => {
    const healthySummary = createSummary(true);
    const degradedSummary = createSummary(false, ['claimsSelfRelationship']);
    const tests: TestCase[] = [
      {
        metadata: { pluginId: 'pii:social', semanticFrontier: healthySummary },
        vars: { prompt: 'healthy one' },
      },
      {
        metadata: { pluginId: 'pii:social', semanticFrontier: healthySummary },
        vars: { prompt: 'healthy two' },
      },
      {
        metadata: { pluginId: 'pii:social', semanticFrontier: degradedSummary },
        vars: { prompt: 'degraded' },
      },
      {
        metadata: { pluginId: 'plain-plugin' },
        vars: { prompt: 'no frontier' },
      },
    ];

    expect(summarizeSemanticFrontierDiagnosticsFromTests(tests)).toEqual([
      {
        completeFrontierCount: 1,
        frontierCount: 2,
        pluginId: 'pii:social',
        structurallyDegraded: true,
        unreachableFeatureIds: ['claimsSelfRelationship'],
      },
    ]);
  });

  it('omits inactive frontiers from operator diagnostics', () => {
    const inactiveSummary = { ...createSummary(false), active: false };

    expect(
      summarizeSemanticFrontierDiagnosticsFromTests([
        {
          metadata: { pluginId: 'prompt-extraction', semanticFrontier: inactiveSummary },
          vars: { prompt: 'small non-frontier batch' },
        },
      ]),
    ).toEqual([]);
  });
});
