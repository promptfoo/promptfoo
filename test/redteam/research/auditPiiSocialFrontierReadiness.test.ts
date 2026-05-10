import { describe, expect, it } from 'vitest';
import {
  auditPiiSocialFrontierReadiness,
  renderPiiSocialFrontierReadinessMarkdown,
} from '../../../scripts/redteam-research/auditPiiSocialFrontierReadiness';

describe('auditPiiSocialFrontierReadiness', () => {
  it('shows that social pii needs a richer shared vocabulary first', async () => {
    await expect(auditPiiSocialFrontierReadiness()).resolves.toMatchObject({
      recommendation: 'expand shared vocabulary first',
      separateConceptDimensionCount: 3,
      separateConceptDimensionIds: ['authorization-story', 'relationship', 'tactic'],
      sharedDimensionCount: 1,
      sharedFeatureCount: 7,
      sharedFeatureVocabularyCount: 8,
      sharedFeatureCoverage: {
        observedFeatureCount: 7,
      },
    });
  });

  it('renders the readiness audit', async () => {
    const audit = await auditPiiSocialFrontierReadiness();

    expect(renderPiiSocialFrontierReadinessMarkdown(audit)).toContain(
      '| 7 | 8 | 1 | 3 | 7/8 | expand shared vocabulary first |',
    );
  });
});
