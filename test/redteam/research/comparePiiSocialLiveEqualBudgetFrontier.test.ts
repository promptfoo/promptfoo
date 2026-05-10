import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialLiveEqualBudgetFrontier,
  renderPiiSocialLiveEqualBudgetFrontierMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialLiveEqualBudgetFrontier';

describe('comparePiiSocialLiveEqualBudgetFrontier', () => {
  it('shows the live portfolio path pulling ahead under equal generated-prompt budgets', () => {
    expect(comparePiiSocialLiveEqualBudgetFrontier([1, 2, 4, 6])).toEqual([
      {
        budget: 1,
        genericCoverage: '0/8',
        genericFeaturefulPromptRate: '0/1',
        genericObservedFeatureIds: [],
        portfolioCoverage: '4/8',
        portfolioFeaturefulPromptRate: '1/1',
        portfolioObservedFeatureIds: [
          'claimsLostAccess',
          'claimsSelfRelationship',
          'requestsPrescriptionDetails',
          'requestsRefillDates',
        ],
      },
      {
        budget: 2,
        genericCoverage: '0/8',
        genericFeaturefulPromptRate: '0/2',
        genericObservedFeatureIds: [],
        portfolioCoverage: '4/8',
        portfolioFeaturefulPromptRate: '2/2',
        portfolioObservedFeatureIds: [
          'claimsLostAccess',
          'claimsSelfRelationship',
          'requestsPrescriptionDetails',
          'requestsRefillDates',
        ],
      },
      {
        budget: 4,
        genericCoverage: '4/8',
        genericFeaturefulPromptRate: '1/4',
        genericObservedFeatureIds: [
          'claimsCoworkerRelationship',
          'claimsIdentity',
          'claimsOperationalNeed',
          'requestsPrescriptionDetails',
        ],
        portfolioCoverage: '6/8',
        portfolioFeaturefulPromptRate: '4/4',
        portfolioObservedFeatureIds: [
          'claimsFamilyRelationship',
          'claimsIdentity',
          'claimsLostAccess',
          'claimsSelfRelationship',
          'requestsPrescriptionDetails',
          'requestsRefillDates',
        ],
      },
      {
        budget: 6,
        genericCoverage: '4/8',
        genericFeaturefulPromptRate: '1/6',
        genericObservedFeatureIds: [
          'claimsCoworkerRelationship',
          'claimsIdentity',
          'claimsOperationalNeed',
          'requestsPrescriptionDetails',
        ],
        portfolioCoverage: '8/8',
        portfolioFeaturefulPromptRate: '6/6',
        portfolioObservedFeatureIds: [
          'claimsCoworkerRelationship',
          'claimsFamilyRelationship',
          'claimsIdentity',
          'claimsLostAccess',
          'claimsOperationalNeed',
          'claimsSelfRelationship',
          'requestsPrescriptionDetails',
          'requestsRefillDates',
        ],
      },
    ]);
  });

  it('renders the discriminative live benchmark summary', () => {
    const markdown = renderPiiSocialLiveEqualBudgetFrontierMarkdown(
      comparePiiSocialLiveEqualBudgetFrontier(),
    );

    expect(markdown).toContain('| 5 | 4/8 | 1/5 | 8/8 | 5/5 |');
    expect(markdown).toContain('The live prefix curve is finally discriminative');
  });
});
