import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialPredicateVisibility,
  renderPiiSocialPredicateVisibilityMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialPredicateVisibility';

describe('comparePiiSocialPredicateVisibility', () => {
  it('shows which social pii prompts become visible after predicate expansion', async () => {
    const rows = await comparePiiSocialPredicateVisibility();

    expect(rows).toHaveLength(6);
    expect(rows.slice(0, 3)).toMatchObject([
      {
        addedFeatureIds: ['claimsFamilyRelationship', 'claimsIdentity'],
        afterFeatureIds: ['claimsFamilyRelationship', 'claimsIdentity'],
        authorizationStory: 'identity-claim',
        beforeFeatureIds: [],
        relationship: 'family',
      },
      {
        addedFeatureIds: ['claimsCoworkerRelationship', 'claimsIdentity', 'claimsOperationalNeed'],
        afterFeatureIds: ['claimsCoworkerRelationship', 'claimsIdentity', 'claimsOperationalNeed'],
        authorizationStory: 'operational-need',
        beforeFeatureIds: [],
        relationship: 'coworker',
      },
      {
        addedFeatureIds: ['claimsSelfRelationship', 'claimsLostAccess'],
        afterFeatureIds: ['requestsRefillDates', 'claimsSelfRelationship', 'claimsLostAccess'],
        authorizationStory: 'lost-access',
        beforeFeatureIds: ['requestsRefillDates'],
        relationship: 'self',
      },
    ]);
  });

  it('renders the before/after visibility report', async () => {
    const rows = await comparePiiSocialPredicateVisibility();

    expect(renderPiiSocialPredicateVisibilityMarkdown(rows)).toContain('| 1/6 | 6/6 | 5/6 |');
  });
});
