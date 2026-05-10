import { describe, expect, it } from 'vitest';
import {
  buildBalancedAttackPlan,
  selectCoverageAwareCandidates,
  selectSemanticBandAwareCandidates,
  selectSemanticWarmStartFamilies,
} from '../../../src/redteam/generation/selection';

import type { AttackCandidate, AttackFamily } from '../../../src/redteam/generation/types';

const families: readonly AttackFamily[] = [
  {
    id: 'alpha',
    label: 'Alpha',
    description: 'alpha',
    instructions: 'alpha',
  },
  {
    id: 'beta',
    label: 'Beta',
    description: 'beta',
    instructions: 'beta',
  },
  {
    id: 'gamma',
    label: 'Gamma',
    description: 'gamma',
    instructions: 'gamma',
  },
];

function makeCandidate(
  prompt: string,
  familyId: string,
  predicates: Record<string, boolean>,
): AttackCandidate {
  return {
    prompt,
    pluginId: 'demo',
    familyId,
    familyLabel: familyId,
    generationPhase: 'initial',
    signature: {
      predicates,
    },
  };
}

describe('buildBalancedAttackPlan', () => {
  it('spreads requested attacks across families before repeating them', () => {
    const plan = buildBalancedAttackPlan(families, 5);

    expect(plan.families.map((family) => [family.id, family.count])).toEqual([
      ['alpha', 2],
      ['beta', 2],
      ['gamma', 1],
    ]);
  });
});

describe('selectCoverageAwareCandidates', () => {
  it('preserves distinct coverage cells before filling the remaining budget', () => {
    const selected = selectCoverageAwareCandidates(
      [
        makeCandidate('repeat me', 'alpha', { rare: false }),
        makeCandidate('repeat me', 'alpha', { rare: false }),
        makeCandidate('ordinary alpha', 'alpha', { rare: false }),
        makeCandidate('rare beta', 'beta', { rare: true }),
        makeCandidate('ordinary gamma', 'gamma', { rare: false }),
      ],
      3,
    );

    expect(selected.map((candidate) => candidate.familyId).sort()).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(selected.map((candidate) => candidate.prompt)).toContain('rare beta');
  });

  it('preserves family coverage before spending extra budget on finer signature cells', () => {
    const selected = selectCoverageAwareCandidates(
      [
        makeCandidate('alpha base', 'alpha', { alphaBase: true }),
        makeCandidate('alpha rare', 'alpha', { alphaRare: true }),
        makeCandidate('beta base', 'beta', { betaBase: true }),
      ],
      2,
    );

    expect(new Set(selected.map((candidate) => candidate.familyId))).toEqual(
      new Set(['alpha', 'beta']),
    );
  });
});

describe('selectSemanticBandAwareCandidates', () => {
  it('preserves weighted semantic bands before falling back to novelty', () => {
    const selected = selectSemanticBandAwareCandidates(
      [
        makeCandidate('direct disclosure', 'direct', {
          requestsOperatingInstructions: true,
          requestsSystemPrompt: true,
        }),
        makeCandidate('policy audit', 'policy', {
          asksForRefusalPolicy: true,
        }),
        makeCandidate('routing review', 'routing', {
          asksForClassificationRules: true,
          asksForRoutingRules: true,
        }),
        makeCandidate('authority pretext', 'authority', {
          asksForAuthorityChecks: true,
          invokesLegalAuthority: true,
          requestsVerbatimText: true,
        }),
        makeCandidate('format conversion', 'format', {
          requestsOperatingInstructions: true,
        }),
      ],
      4,
      {
        bands: {
          'core-disclosure': ['requestsOperatingInstructions', 'requestsSystemPrompt'],
          'protected-control-plane': [
            'asksForAuthorityChecks',
            'asksForClassificationRules',
            'asksForRefusalPolicy',
            'asksForRoutingRules',
            'invokesLegalAuthority',
            'requestsVerbatimText',
          ],
        },
        weights: {
          'core-disclosure': 100,
          'protected-control-plane': 10,
        },
      },
    );

    expect(selected.map((candidate) => candidate.familyId)).toEqual([
      'direct',
      'authority',
      'routing',
      'policy',
    ]);
  });
});

describe('selectSemanticWarmStartFamilies', () => {
  it('derives an order-insensitive warm start from declared predicate coverage', () => {
    const warmStartFamilies = selectSemanticWarmStartFamilies(
      [
        {
          id: 'late-self',
          label: 'Late self',
          description: 'late self',
          instructions: 'late self',
          requiredPredicates: ['requestsPrescriptionDetails', 'requestsRefillDates'],
        },
        {
          id: 'family',
          label: 'Family',
          description: 'family',
          instructions: 'family',
          requiredPredicates: ['claimsFamilyRelationship', 'claimsIdentity'],
        },
        {
          id: 'coworker',
          label: 'Coworker',
          description: 'coworker',
          instructions: 'coworker',
          requiredPredicates: ['claimsCoworkerRelationship', 'claimsOperationalNeed'],
        },
      ].reverse(),
      3,
      {
        bands: {
          'sensitive-field': ['requestsPrescriptionDetails', 'requestsRefillDates'],
          relationship: ['claimsFamilyRelationship', 'claimsCoworkerRelationship'],
          'authorization-story': ['claimsIdentity', 'claimsOperationalNeed'],
        },
        weights: {
          'authorization-story': 100,
          relationship: 100,
          'sensitive-field': 100,
        },
      },
    );

    expect(warmStartFamilies.map((family) => family.id)).toEqual([
      'coworker',
      'family',
      'late-self',
    ]);
  });
});
