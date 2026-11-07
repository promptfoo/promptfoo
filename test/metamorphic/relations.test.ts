import { describe, expect, it } from 'vitest';
import { resolveLimits, WorkBudget } from '../../src/metamorphic/limits';
import { parsePlan } from '../../src/metamorphic/plan';
import { evaluateRelation } from '../../src/metamorphic/relations';
import { selectValue } from '../../src/metamorphic/selectors';
import { captureJson } from '../../src/metamorphic/values';

import type { JsonValue, Observation, Relation, Selector } from '../../src/metamorphic/types';

const limits = resolveLimits();
const selector: Selector = { source: 'output', pointer: '', decode: 'none', normalize: [] };
function relation(kind: string, fields = {}): Relation {
  return parsePlan({
    version: 1,
    name: 'test',
    repetitions: 1,
    contexts: [{ id: 'c', providerId: 'echo', promptIdx: 0 }],
    families: [
      {
        id: 'f',
        variants: ['a', 'b'],
        relations: [
          {
            id: 'r',
            left: 'a',
            right: 'b',
            leftSelector: selector,
            rightSelector: selector,
            kind,
            ...fields,
          },
        ],
      },
    ],
  }).families[0].relations[0];
}
function check(kind: string, left: JsonValue, right: JsonValue, fields = {}) {
  return evaluateRelation(
    relation(kind, fields),
    { available: true, value: left },
    { available: true, value: right },
    new WorkBudget(limits.maxWork),
  );
}
function observation(value: JsonValue): Observation {
  return {
    contextId: 'c',
    familyId: 'f',
    variantId: 'a',
    repetition: 0,
    identity: { repeatIndexProvided: false, repeatGroupProvided: false, promptIdProvided: false },
    sourceStatus: 'passed',
    cache: 'unknown',
    output: { available: true, value },
    namedScores: { available: false, reason: 'named-scores-missing' },
  };
}
describe('deterministic relation mathematics', () => {
  it.each([
    ['equal', { a: 1, b: false }, { b: false, a: 1 }, 'pass'],
    ['equal', [1, 2], [2, 1], 'fail'],
    ['equal', 1, '1', 'fail'],
    ['equal', null, false, 'fail'],
    ['equal', -0, 0, 'pass'],
    ['not-equal', 1, 2, 'pass'],
    ['nondecreasing', 1, 2, 'pass'],
    ['nondecreasing', 2, 1, 'fail'],
    ['nonincreasing', 2, 1, 'pass'],
    ['nonincreasing', '2', 1, 'inconclusive'],
    ['set-equal', [1, 1, 2], [2, 1], 'pass'],
    ['subset', [1], [1, 2], 'pass'],
    ['superset', [1, 2], [1], 'pass'],
    ['disjoint', [1], ['1'], 'pass'],
    ['disjoint', [1], [1], 'fail'],
    ['prefix', [1, 2], [1, 2, 3], 'pass'],
    ['prefix', [1, 3], [1, 2, 3], 'fail'],
    ['subsequence', [1, 3], [1, 2, 3], 'pass'],
    ['subsequence', [1, 1], [1], 'fail'],
    ['subset', [], [], 'pass'],
    ['subsequence', [], [], 'pass'],
  ] as const)('%s on typed values', (kind, left, right, expected) => {
    expect(check(kind, left as JsonValue, right as JsonValue).verdict).toBe(expected);
  });
  it('applies affine direction and explicit tolerance', () => {
    expect(check('affine', 100, 212, { scale: 1.8, offset: 32 }).verdict).toBe('pass');
    expect(check('affine', 10, 10.05, { scale: 1, absoluteTolerance: 0.1 }).verdict).toBe('pass');
    expect(check('affine', 10, 11, { scale: 1, relativeTolerance: 0.01 }).verdict).toBe('fail');
  });
  it('never passes through nonfinite numeric intermediates', () => {
    expect(check('affine', 1e308, 1e308, { scale: 2 }).reason).toBe('numeric-overflow');
    expect(check('affine', 1, 1e308, { scale: 1, relativeTolerance: 1e308 }).reason).toBe(
      'numeric-overflow',
    );
    expect(check('affine', -1e308, 1e308, { scale: 1 }).reason).toBe('numeric-overflow');
  });
  it('records multiset and unique cardinalities for set checks', () => {
    expect(check('set-equal', [1, 1], [1]).cardinality).toEqual({
      left: 2,
      right: 1,
      leftUnique: 1,
      rightUnique: 1,
    });
  });
});
describe('selection and bounded capture', () => {
  it('traverses escaped own keys without prototype lookup', () => {
    const value = JSON.parse('{"a/b":{"~key":false},"__proto__":{"ok":0}}');
    const select = (pointer: string) =>
      selectValue(
        observation(value),
        { ...selector, pointer },
        limits,
        new WorkBudget(limits.maxWork),
      );
    expect(select('/a~1b/~0key')).toEqual({ available: true, value: false });
    expect(select('/__proto__/ok')).toEqual({ available: true, value: 0 });
    expect(select('/constructor')).toEqual({ available: false, reason: 'pointer-missing' });
  });
  it('distinguishes canonical array indices from properties and leading zeros', () => {
    for (const pointer of ['/01', '/-1', '/length', '/1e0']) {
      expect(
        selectValue(
          observation([1, 2]),
          { ...selector, pointer },
          limits,
          new WorkBudget(limits.maxWork),
        ).available,
      ).toBe(false);
    }
  });
  it('normalizes only the selected string in declared order', () => {
    expect(
      selectValue(
        observation('{"label":"  Ａ  B "}'),
        {
          ...selector,
          decode: 'json',
          pointer: '/label',
          normalize: ['nfkc', 'trim', 'collapse-whitespace', 'lowercase'],
        },
        limits,
        new WorkBudget(limits.maxWork),
      ),
    ).toEqual({ available: true, value: 'a b' });
  });
  it('never invokes getters, toJSON or accepts cycles/nonfinite data', () => {
    let invoked = false;
    const getter = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        invoked = true;
        return 'secret';
      },
    });
    for (const value of [
      getter,
      { value: NaN },
      {
        toJSON() {
          invoked = true;
          return null;
        },
      },
      new Date(),
    ]) {
      expect(() => captureJson(value, limits, new WorkBudget(limits.maxWork))).toThrow();
    }
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => captureJson(cycle, limits, new WorkBudget(limits.maxWork))).toThrow(/cycle/);
    expect(invoked).toBe(false);
  });
  it('enforces depth, string bytes and total work', () => {
    expect(() =>
      captureJson({ a: { b: 1 } }, { ...limits, maxDepth: 1 }, new WorkBudget(limits.maxWork)),
    ).toThrow(/depth/);
    expect(() =>
      captureJson('long', { ...limits, maxValueBytes: 2 }, new WorkBudget(limits.maxWork)),
    ).toThrow(/byte/);
    expect(() => captureJson('long', limits, new WorkBudget(2))).toThrow(/work budget/);
  });
});
