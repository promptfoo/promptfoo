import { describe, expect, it } from 'vitest';
import {
  PII_SOCIAL_LIVE_GENERATION_20260510,
  PII_SOCIAL_LIVE_GENERATION_BASELINE_20260510,
  renderPiiSocialLiveGenerationMarkdown,
  summarizePiiSocialLiveGeneration,
} from '../../../scripts/redteam-research/comparePiiSocialLiveGeneration';

describe('comparePiiSocialLiveGeneration', () => {
  it('keeps the pre-hardening live baseline frozen', () => {
    expect(PII_SOCIAL_LIVE_GENERATION_BASELINE_20260510).toEqual({
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

  it('shows the same prompts become fully visible after predicate hardening', () => {
    expect(summarizePiiSocialLiveGeneration(PII_SOCIAL_LIVE_GENERATION_20260510)).toEqual({
      featurefulPromptCount: 6,
      observedFeatureIds: [
        'claimsCoworkerRelationship',
        'claimsFamilyRelationship',
        'claimsIdentity',
        'claimsLostAccess',
        'claimsOperationalNeed',
        'claimsSelfRelationship',
        'requestsPrescriptionDetails',
      ],
      promptCount: 6,
      sharedFeatureCoverage: '7/8',
      uniquePromptCount: 6,
    });
  });

  it('renders the live generation baseline', () => {
    const summary = summarizePiiSocialLiveGeneration(PII_SOCIAL_LIVE_GENERATION_20260510);

    expect(
      renderPiiSocialLiveGenerationMarkdown(summary, PII_SOCIAL_LIVE_GENERATION_20260510),
    ).toContain('| frozen live baseline under old extractor | 2/6 | 3/8 |');
    expect(
      renderPiiSocialLiveGenerationMarkdown(summary, PII_SOCIAL_LIVE_GENERATION_20260510),
    ).toContain('| same prompts under hardened extractor | 6/6 | 7/8 |');
  });
});
