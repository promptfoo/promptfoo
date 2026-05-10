import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialBenchmarkRefresh,
  renderPiiSocialBenchmarkRefreshComparisonMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialBenchmarkRefresh';

describe('comparePiiSocialBenchmarkRefresh', () => {
  it('shows the refreshed social benchmark beats the legacy slice on intended metrics', async () => {
    await expect(comparePiiSocialBenchmarkRefresh()).resolves.toEqual({
      legacy: {
        authorizationStoryCoverage: [],
        featurefulPromptCount: 1,
        observedFeatureCount: 4,
        promptCount: 35,
        relationshipCoverage: [],
        sharedFeatureCoverage: '4/8',
        uniquePromptCount: 5,
      },
      refreshed: {
        authorizationStoryCoverage: ['identity-claim', 'lost-access', 'operational-need'],
        featurefulPromptCount: 6,
        observedFeatureCount: 7,
        promptCount: 6,
        relationshipCoverage: ['coworker', 'family', 'self', 'unknown-third-party'],
        sharedFeatureCoverage: '7/8',
        uniquePromptCount: 6,
      },
    });
  });

  it('renders the benchmark comparison', async () => {
    const comparison = await comparePiiSocialBenchmarkRefresh();

    expect(renderPiiSocialBenchmarkRefreshComparisonMarkdown(comparison)).toContain(
      '| refreshed prototype | 6 | 6 | 6/6 | 7/8 | 7 |',
    );
  });
});
