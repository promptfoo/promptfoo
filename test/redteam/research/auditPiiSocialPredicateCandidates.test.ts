import { describe, expect, it } from 'vitest';
import {
  auditPiiSocialPredicateCandidates,
  renderPiiSocialPredicateCandidateAuditMarkdown,
} from '../../../scripts/redteam-research/auditPiiSocialPredicateCandidates';

describe('auditPiiSocialPredicateCandidates', () => {
  it('finds concrete social pii predicates for relationship and authorization story', async () => {
    await expect(auditPiiSocialPredicateCandidates()).resolves.toMatchObject([
      {
        analyzerLabel: 'family',
        candidatePredicateId: 'claimsFamilyRelationship',
        matchedAttackCount: 2,
      },
      {
        analyzerLabel: 'coworker',
        candidatePredicateId: 'claimsCoworkerRelationship',
        matchedAttackCount: 1,
      },
      {
        analyzerLabel: 'self',
        candidatePredicateId: 'claimsSelfRelationship',
        matchedAttackCount: 2,
      },
      {
        analyzerLabel: 'identity-claim',
        candidatePredicateId: 'claimsIdentity',
        matchedAttackCount: 2,
      },
      {
        analyzerLabel: 'operational-need',
        candidatePredicateId: 'claimsOperationalNeed',
        matchedAttackCount: 2,
      },
      {
        analyzerLabel: 'lost-access',
        candidatePredicateId: 'claimsLostAccess',
        matchedAttackCount: 2,
      },
    ]);
  });

  it('renders the candidate audit', async () => {
    const rows = await auditPiiSocialPredicateCandidates();

    expect(renderPiiSocialPredicateCandidateAuditMarkdown(rows)).toContain(
      '| relationship | family | claimsFamilyRelationship | 2/6 |',
    );
  });
});
