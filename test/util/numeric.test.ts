import { describe, expect, it } from 'vitest';
import { filterFiniteScores, isSafeCost, isSafeTokenCount } from '../../src/util/numeric';

describe('isSafeTokenCount', () => {
  it('accepts ordinary usage numbers', () => {
    expect(isSafeTokenCount(0)).toBe(true);
    expect(isSafeTokenCount(2)).toBe(true);
    expect(isSafeTokenCount(1_000_000)).toBe(true);
  });

  it('rejects non-numbers, negatives, and non-integers', () => {
    expect(isSafeTokenCount('42')).toBe(false);
    expect(isSafeTokenCount(null)).toBe(false);
    expect(isSafeTokenCount(undefined)).toBe(false);
    expect(isSafeTokenCount(-1)).toBe(false);
    expect(isSafeTokenCount(1.5)).toBe(false);
    expect(isSafeTokenCount(Number.NaN)).toBe(false);
  });

  it('rejects safe-integer garbage that would overflow later accumulation', () => {
    // Passes Number.isSafeInteger yet is not real usage; two such rows already
    // exceed the safe-integer range when aggregated.
    expect(isSafeTokenCount(Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(isSafeTokenCount(1_000_000_001)).toBe(false);
    expect(isSafeTokenCount(1_000_000_000)).toBe(true);
  });
});

describe('isSafeCost', () => {
  it('accepts fractional non-negative costs', () => {
    expect(isSafeCost(0)).toBe(true);
    expect(isSafeCost(0.00001234)).toBe(true);
  });

  it('rejects non-finite or negative costs', () => {
    expect(isSafeCost(-0.01)).toBe(false);
    expect(isSafeCost(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isSafeCost(Number.NaN)).toBe(false);
    expect(isSafeCost('0.01')).toBe(false);
  });
});

describe('filterFiniteScores', () => {
  it('keeps finite numbers and drops everything else', () => {
    expect(
      filterFiniteScores({
        keep: 0.5,
        zero: 0,
        string: '1',
        nan: Number.NaN,
        infinity: Number.POSITIVE_INFINITY,
        array: [1],
        object: { value: 1 },
        nullValue: null,
      }),
    ).toEqual({ keep: 0.5, zero: 0 });
  });
});
