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
        genericObservedFeatureIds: [],
        portfolioCoverage: '4/8',
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
        genericObservedFeatureIds: [],
        portfolioCoverage: '4/8',
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
        genericObservedFeatureIds: [
          'claimsCoworkerRelationship',
          'claimsIdentity',
          'claimsOperationalNeed',
          'requestsPrescriptionDetails',
        ],
        portfolioCoverage: '6/8',
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
        genericObservedFeatureIds: [
          'claimsCoworkerRelationship',
          'claimsIdentity',
          'claimsOperationalNeed',
          'requestsPrescriptionDetails',
        ],
        portfolioCoverage: '8/8',
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

    expect(markdown).toContain('| 5 | 4/8 | 8/8 |');
    expect(markdown).toContain('The live prefix curve is finally discriminative');
  });
});
