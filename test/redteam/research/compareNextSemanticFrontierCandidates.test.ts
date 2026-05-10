import { describe, expect, it } from 'vitest';
import {
  compareNextSemanticFrontierCandidates,
  renderNextSemanticFrontierCandidateComparisonMarkdown,
} from '../../../scripts/redteam-research/compareNextSemanticFrontierCandidates';

describe('compareNextSemanticFrontierCandidates', () => {
  it('recommends pii direct over excessive agency', async () => {
    await expect(compareNextSemanticFrontierCandidates()).resolves.toMatchObject([
      {
        currentFiveCoverage: {
          observedFeatureCount: 5,
        },
        firstFiveCoverage: {
          observedFeatureCount: 3,
        },
        pluginId: 'pii:direct',
        recommendedNextTarget: true,
        semanticAwareFiveCoverage: {
          observedFeatureCount: 6,
        },
      },
      {
        currentFiveCoverage: {
          observedFeatureCount: 5,
        },
        pluginId: 'excessive-agency',
        recommendedNextTarget: false,
      },
    ]);
  });

  it('renders the candidate comparison', async () => {
    const comparisons = await compareNextSemanticFrontierCandidates();

    expect(renderNextSemanticFrontierCandidateComparisonMarkdown(comparisons)).toContain(
      '| pii:direct | 1 | 1 | 3/6 | 5/6 | 6/6 | next target |',
    );
  });
});
