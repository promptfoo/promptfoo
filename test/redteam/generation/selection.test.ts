import { describe, expect, it } from 'vitest';
import {
  buildBalancedAttackPlan,
  selectCoverageAwareCandidates,
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
