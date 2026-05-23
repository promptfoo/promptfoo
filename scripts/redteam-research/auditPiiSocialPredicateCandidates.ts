import { pathToFileURL } from 'node:url';

import { buildPiiPortfolio, loadPiiContext } from './piiResearchShared';
import { renderMarkdownTable } from './reportRenderingShared';

type CandidatePredicate = {
  dimension: 'authorization-story' | 'relationship';
  id: string;
  pattern: RegExp;
};

export type PiiSocialPredicateCandidateAuditRow = {
  analyzerLabel: string;
  candidatePredicateId: string;
  dimension: CandidatePredicate['dimension'];
  matchedAttackCount: number;
  totalAttackCount: number;
};

const CANDIDATE_PREDICATES: readonly CandidatePredicate[] = [
  {
    dimension: 'relationship',
    id: 'claimsFamilyRelationship',
    pattern: /\b(spouse|son)\b/i,
  },
  {
    dimension: 'relationship',
    id: 'claimsCoworkerRelationship',
    pattern: /\bcovering nurse\b/i,
  },
  {
    dimension: 'relationship',
    id: 'claimsSelfRelationship',
    pattern: /\b(i lost|i forgot)\b/i,
  },
  {
    dimension: 'authorization-story',
    id: 'claimsIdentity',
    pattern: /\b(spouse|son)\b/i,
  },
  {
    dimension: 'authorization-story',
    id: 'claimsOperationalNeed',
    pattern: /\b(covering nurse|urgent claim)\b/i,
  },
  {
    dimension: 'authorization-story',
    id: 'claimsLostAccess',
    pattern: /\b(i lost|i forgot)\b/i,
  },
];

export async function auditPiiSocialPredicateCandidates(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<PiiSocialPredicateCandidateAuditRow[]> {
  const { entities } = await loadPiiContext(inputPath);
  const attacks = buildPiiPortfolio(entities, 'pii:social');

  return CANDIDATE_PREDICATES.map((candidate) => {
    const matchingAttacks = attacks.filter((attack) => candidate.pattern.test(attack.prompt));
    const analyzerLabel =
      candidate.dimension === 'relationship'
        ? (matchingAttacks[0]?.relationship ?? 'unmatched')
        : (matchingAttacks[0]?.authorizationStory ?? 'unmatched');

    return {
      analyzerLabel,
      candidatePredicateId: candidate.id,
      dimension: candidate.dimension,
      matchedAttackCount: matchingAttacks.length,
      totalAttackCount: attacks.length,
    };
  });
}

export function renderPiiSocialPredicateCandidateAuditMarkdown(
  rows: readonly PiiSocialPredicateCandidateAuditRow[],
): string {
  return [
    '# PII Social Predicate Candidate Audit',
    '',
    ...renderMarkdownTable(
      ['Dimension', 'Analyzer label', 'Candidate predicate', 'Matched attacks'],
      rows.map((row) => ({
        cells: [
          row.dimension,
          row.analyzerLabel,
          row.candidatePredicateId,
          `${row.matchedAttackCount}/${row.totalAttackCount}`,
        ],
      })),
    ),
    '',
    '## Reading',
    '',
    'The social-PII portfolio already contains several low-drift literal signals that can become shared atomic predicates: family claims, coworker claims, self-claims, identity claims, operational-need claims, and lost-access claims. These are better next candidates than broad tactic labels because they are grounded in explicit text rather than an umbrella interpretation.',
  ].join('\n');
}

async function main() {
  console.log(
    renderPiiSocialPredicateCandidateAuditMarkdown(await auditPiiSocialPredicateCandidates()),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
