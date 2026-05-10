import { describe, expect, it } from 'vitest';
import {
  renderSemanticFrontierDiagnosticsMarkdown,
  summarizePiiSocialAvailabilityDiagnostics,
  summarizeSemanticFrontierDiagnostics,
} from '../../../scripts/redteam-research/summarizeSemanticFrontierDiagnostics';

describe('summarizeSemanticFrontierDiagnostics', () => {
  it('aggregates unreachable features by plugin', () => {
    expect(
      summarizeSemanticFrontierDiagnostics([
        {
          pluginId: 'demo',
          summary: {
            active: true,
            bands: {
              alpha: {
                featureCount: 2,
                observedFeatureCount: 1,
                observedFeatureIds: ['seen'],
                reachableFeatureCount: 1,
                reachableFeatureIds: ['seen'],
                unreachableFeatureIds: ['missing'],
              },
            },
            complete: false,
            minimumPortfolioSize: 2,
          },
        },
        {
          pluginId: 'demo',
          summary: {
            active: true,
            bands: {
              alpha: {
                featureCount: 2,
                observedFeatureCount: 2,
                observedFeatureIds: ['seen', 'missing'],
                reachableFeatureCount: 2,
                reachableFeatureIds: ['seen', 'missing'],
                unreachableFeatureIds: [],
              },
            },
            complete: true,
            minimumPortfolioSize: 2,
          },
        },
      ]),
    ).toEqual([
      {
        completeRunCount: 1,
        frontierCount: 2,
        pluginId: 'demo',
        structurallyDegraded: true,
        unreachableFeatureIds: ['missing'],
      },
    ]);
  });

  it('surfaces the degraded availability scenario at one glance', async () => {
    await expect(summarizePiiSocialAvailabilityDiagnostics()).resolves.toMatchObject([
      {
        pluginId: 'pii:social:all-families',
        structurallyDegraded: false,
        unreachableFeatureIds: [],
      },
      {
        pluginId: 'pii:social:without-aftercare',
        structurallyDegraded: false,
        unreachableFeatureIds: [],
      },
      {
        pluginId: 'pii:social:without-self-lost-access',
        structurallyDegraded: true,
        unreachableFeatureIds: ['requestsPrescriptionDetails', 'requestsRefillDates'],
      },
    ]);
  });

  it('renders a compact markdown report', async () => {
    expect(
      renderSemanticFrontierDiagnosticsMarkdown(await summarizePiiSocialAvailabilityDiagnostics()),
    ).toContain(
      '| pii:social:without-self-lost-access | 1 | 0 | yes | requestsPrescriptionDetails, requestsRefillDates |',
    );
  });
});
