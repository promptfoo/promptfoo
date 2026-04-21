import { describe, expect, it } from 'vitest';
import { getAssertionBaseType, isAssertionInverse } from '../../src/assertions/index';

describe('isAssertionInverse', () => {
  it('returns true if the assertion is inverse', () => {
    const assertion = {
      type: 'not-equals' as const,
    };
    expect(isAssertionInverse(assertion)).toBe(true);
  });

  it('returns false if the assertion is not inverse', () => {
    const assertion = {
      type: 'equals' as const,
    };
    expect(isAssertionInverse(assertion)).toBe(false);
  });
});

describe('getAssertionBaseType', () => {
  it('returns the base type of the non-inverse assertion', () => {
    const assertion = {
      type: 'equals' as const,
    };
    expect(getAssertionBaseType(assertion)).toBe('equals');
  });

  it('returns the base type of the inverse assertion', () => {
    const assertion = {
      type: 'not-equals' as const,
    };
    expect(getAssertionBaseType(assertion)).toBe('equals');
  });
});
