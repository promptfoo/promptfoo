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

  it('deduplicates equivalent frontier metadata regardless of key or feature ordering', () => {
    const summary = createSummary(true);
    const reorderedSummary: SemanticFrontierSummary = {
      bands: {
        relationship: {
          unreachableFeatureIds: [],
          reachableFeatureIds: ['claimsSelfRelationship', 'claimsFamilyRelationship'],
          reachableFeatureCount: 2,
          observedFeatureIds: ['claimsSelfRelationship', 'claimsFamilyRelationship'],
          observedFeatureCount: 2,
          featureCount: 2,
        },
      },
      minimumPortfolioSize: 3,
      complete: true,
      active: true,
    };

    expect(
      summarizeSemanticFrontierDiagnosticsFromTests([
        {
          metadata: { pluginId: 'pii:social', semanticFrontier: summary },
          vars: { prompt: 'first test' },
        },
        {
          metadata: { pluginId: 'pii:social', semanticFrontier: reorderedSummary },
          vars: { prompt: 'second test' },
        },
      ]),
    ).toEqual([
      {
        completeFrontierCount: 1,
        frontierCount: 1,
        pluginId: 'pii:social',
        structurallyDegraded: false,
        unreachableFeatureIds: [],
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

  it('ignores malformed persisted frontier metadata instead of throwing during report rendering', () => {
    expect(
      summarizeSemanticFrontierDiagnosticsFromTests([
        {
          metadata: {
            pluginId: 'pii:social',
            semanticFrontier: {
              ...createSummary(false),
              bands: { relationship: null },
            },
          },
          vars: { prompt: 'persisted malformed metadata' },
        },
      ]),
    ).toEqual([]);
  });
});
