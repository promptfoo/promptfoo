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
  attributes?: Record<string, string>,
): AttackCandidate {
  return {
    prompt,
    pluginId: 'demo',
    familyId,
    familyLabel: familyId,
    generationPhase: 'initial',
    signature: {
      predicates,
      ...(attributes ? { attributes } : {}),
    },
  };
}

function makeWarmFamily(id: string, requiredPredicates: string[]): AttackFamily {
  return {
    id,
    label: id,
    description: id,
    instructions: id,
    requiredPredicates,
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

  it('drops families that receive no share of a small budget', () => {
    const plan = buildBalancedAttackPlan(families, 2);

    expect(plan.families.map((family) => [family.id, family.count])).toEqual([
      ['alpha', 1],
      ['beta', 1],
    ]);
  });

  it('returns an empty plan when the requested count is not positive', () => {
    expect(buildBalancedAttackPlan(families, 0)).toEqual({ requestedCount: 0, families: [] });
    expect(buildBalancedAttackPlan(families, -3)).toEqual({ requestedCount: -3, families: [] });
  });

  it('returns an empty plan when there are no families to draw from', () => {
    expect(buildBalancedAttackPlan([], 5)).toEqual({ requestedCount: 5, families: [] });
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

  it('returns nothing when the requested count is not positive', () => {
    expect(
      selectCoverageAwareCandidates([makeCandidate('unused', 'alpha', { a: true })], 0),
    ).toEqual([]);
  });

  it('stops selecting once the requested budget is met across families', () => {
    const selected = selectCoverageAwareCandidates(
      [
        makeCandidate('alpha item', 'alpha', { a: true }),
        makeCandidate('beta item', 'beta', { b: true }),
        makeCandidate('gamma item', 'gamma', { c: true }),
      ],
      2,
    );

    expect(selected).toHaveLength(2);
    expect(new Set(selected.map((candidate) => candidate.familyId))).toEqual(
      new Set(['alpha', 'beta']),
    );
  });

  it('fills the remaining budget with the most novel candidates from an exhausted cell', () => {
    const selected = selectCoverageAwareCandidates(
      [
        makeCandidate('solo four', 'solo', { shared: true }),
        makeCandidate('solo one', 'solo', { shared: true }),
        makeCandidate('solo three', 'solo', { shared: true }),
        makeCandidate('solo two', 'solo', { shared: true }),
      ],
      3,
    );

    // One family + one signature cell forces the family loop, then the cell loop, then the
    // novelty-ranked remainder loop to each contribute a distinct prompt.
    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((candidate) => candidate.prompt)).size).toBe(3);
  });

  it('advances to the next coverage cell when the first cell is already selected', () => {
    const selected = selectCoverageAwareCandidates(
      [
        makeCandidate('solo apple', 'solo', { a: true }),
        makeCandidate('solo banana', 'solo', { b: true }, { locale: 'us', tone: 'urgent' }),
        makeCandidate('solo cherry', 'solo', { c: true }),
      ],
      3,
    );

    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((candidate) => candidate.prompt))).toEqual(
      new Set(['solo apple', 'solo banana', 'solo cherry']),
    );
  });

  it('deduplicates candidates that normalize to the same prompt before selecting', () => {
    const selected = selectCoverageAwareCandidates(
      [
        makeCandidate('Repeat  ME', 'alpha', { a: true }),
        makeCandidate('repeat me', 'alpha', { a: true }),
      ],
      5,
    );

    expect(selected).toHaveLength(1);
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

  it('returns nothing when the requested count is not positive', () => {
    expect(
      selectSemanticBandAwareCandidates([makeCandidate('unused', 'x', { p: true })], 0, {
        bands: { core: ['p'] },
        weights: { core: 1 },
      }),
    ).toEqual([]);
  });

  it('breaks equal band gain ties by family coverage and then prompt novelty', () => {
    const config = {
      bands: { core: ['p'] },
      weights: { core: 10 },
    };

    const selected = selectSemanticBandAwareCandidates(
      [
        makeCandidate('apple banana cherry', 'x', { p: true }),
        makeCandidate('apple banana date', 'x', { p: true }),
        makeCandidate('xigua yam zucchini', 'x', { p: true }),
      ],
      3,
      config,
    );

    // First pick is alphabetical (all gains and novelty tie). Once band gain is spent and the
    // family is already covered, ties fall to novelty: the token-disjoint prompt is preferred
    // over the near-duplicate of the first selection.
    expect(selected.map((candidate) => candidate.prompt)).toEqual([
      'apple banana cherry',
      'xigua yam zucchini',
      'apple banana date',
    ]);
  });

  it('treats token-free prompts as fully similar when scoring novelty', () => {
    // With three punctuation-only prompts the novelty comparator runs on a non-empty
    // remainder, so an empty-vs-empty token comparison is scored as fully similar
    // (novelty 0) and selection falls back to a stable alphabetical order.
    const selected = selectSemanticBandAwareCandidates(
      [makeCandidate('!!!', 'x', {}), makeCandidate('???', 'x', {}), makeCandidate('###', 'x', {})],
      3,
      { bands: {}, weights: {} },
    );

    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((candidate) => candidate.prompt))).toEqual(
      new Set(['!!!', '???', '###']),
    );
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

  it('returns no warm-start families when the requested count is not positive', () => {
    expect(selectSemanticWarmStartFamilies(families, 0, { bands: {}, weights: {} })).toEqual([]);
  });

  it('prioritizes families that unlock the most weighted band coverage first', () => {
    const warm = selectSemanticWarmStartFamilies(
      [
        makeWarmFamily('poor', ['p4']),
        makeWarmFamily('rich', ['p1', 'p2', 'p3']),
        makeWarmFamily('mid', ['p5', 'p6']),
      ],
      3,
      {
        bands: { only: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] },
        weights: { only: 1 },
      },
    );

    expect(warm.map((family) => family.id)).toEqual(['rich', 'mid', 'poor']);
  });

  it('breaks equal band gain ties by preferring families with more required predicates', () => {
    const warm = selectSemanticWarmStartFamilies(
      [makeWarmFamily('lean', ['inBand']), makeWarmFamily('broad', ['inBandToo', 'outOfBand'])],
      2,
      {
        bands: { only: ['inBand', 'inBandToo'] },
        weights: { only: 1 },
      },
    );

    expect(warm.map((family) => family.id)).toEqual(['broad', 'lean']);
  });

  it('stops once the requested number of warm-start families is reached', () => {
    const warm = selectSemanticWarmStartFamilies(
      [makeWarmFamily('a', ['x']), makeWarmFamily('b', ['y']), makeWarmFamily('c', ['z'])],
      1,
      { bands: { only: ['x', 'y', 'z'] }, weights: { only: 1 } },
    );

    expect(warm).toHaveLength(1);
  });
});
