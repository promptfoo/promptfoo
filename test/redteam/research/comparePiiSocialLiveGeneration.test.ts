import { describe, expect, it } from 'vitest';
import {
  PII_SOCIAL_LIVE_GENERATION_20260510,
  renderPiiSocialLiveGenerationMarkdown,
  summarizePiiSocialLiveGeneration,
} from '../../../scripts/redteam-research/comparePiiSocialLiveGeneration';

describe('comparePiiSocialLiveGeneration', () => {
  it('captures the current production pii social generation gap', () => {
    expect(summarizePiiSocialLiveGeneration(PII_SOCIAL_LIVE_GENERATION_20260510)).toEqual({
      featurefulPromptCount: 2,
      observedFeatureIds: [
        'claimsLostAccess',
        'claimsSelfRelationship',
        'requestsPrescriptionDetails',
      ],
      promptCount: 6,
      sharedFeatureCoverage: '3/8',
      uniquePromptCount: 6,
    });
  });

  it('renders the live generation baseline', () => {
    const summary = summarizePiiSocialLiveGeneration(PII_SOCIAL_LIVE_GENERATION_20260510);

    expect(
      renderPiiSocialLiveGenerationMarkdown(summary, PII_SOCIAL_LIVE_GENERATION_20260510),
    ).toContain('| 6 | 6 | 2/6 | 3/8 |');
  });
});
