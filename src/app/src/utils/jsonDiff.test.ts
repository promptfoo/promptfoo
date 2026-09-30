import { describe, expect, it } from 'vitest';
import { buildUnifiedJsonTextDiff, computeJsonDiff, formatDiffValue } from './jsonDiff';

describe('JSON equality differences', () => {
  it('ignores object key order and preserves array order', () => {
    expect(computeJsonDiff({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
    expect(computeJsonDiff([1, 2], [2, 1])).toMatchObject([
      { path: '[0]', expected: 1, actual: 2, type: 'changed' },
      { path: '[1]', expected: 2, actual: 1, type: 'changed' },
    ]);
  });

  it('shows additions, removals, null and type changes', () => {
    expect(computeJsonDiff({ a: null, b: 1, c: [1] }, { a: 0, c: {}, d: false })).toMatchObject([
      { path: 'a', expected: null, actual: 0, type: 'changed' },
      { path: 'b', expected: 1, type: 'removed' },
      { path: 'c', expected: [1], actual: {}, type: 'changed' },
      { path: 'd', actual: false, type: 'added' },
    ]);
  });

  it('distinguishes signed zero', () => {
    expect(computeJsonDiff({ value: -0 }, { value: 0 })).toMatchObject([
      { path: 'value', type: 'changed' },
    ]);
    expect(formatDiffValue(-0)).toBe('-0');
    expect(formatDiffValue(0)).toBe('0');
  });

  it('quotes special keys without confusing prototype or array paths', () => {
    const expected = JSON.parse('{"a.b":{"0":1},"__proto__":2}');
    const actual = JSON.parse('{"a.b":{"0":2},"__proto__":3}');
    expect(computeJsonDiff(expected, actual).map((diff) => diff.path)).toEqual([
      '["a.b"]["0"]',
      '__proto__',
    ]);
  });

  it('bounds recursive and wide summaries', () => {
    const nested = (leaf: number) =>
      Array.from({ length: 30 }).reduce<unknown>((value) => ({ value }), leaf);
    expect(() => computeJsonDiff(nested(1), nested(2))).toThrow(/limits/);
    expect(() => computeJsonDiff(Array(2_000).fill(1), Array(2_000).fill(2))).toThrow(/limits/);
  });

  it('truncates long string values as well as objects', () => {
    expect(formatDiffValue('x'.repeat(20_000)).length).toBeLessThanOrEqual(60);
    expect(formatDiffValue({ value: 'x'.repeat(20_000) }).length).toBeLessThanOrEqual(60);
  });

  it('limits full line-diff work and returns a display fallback', () => {
    const left = Array.from({ length: 4_000 }, (_, i) => `a${i}`).join('\n');
    const right = Array.from({ length: 4_000 }, (_, i) => `b${i}`).join('\n');
    expect(buildUnifiedJsonTextDiff(left, right)).toBeUndefined();
    expect(buildUnifiedJsonTextDiff('before', 'after')).toEqual([
      { type: 'removed', content: 'before' },
      { type: 'added', content: 'after' },
    ]);
  });
});
