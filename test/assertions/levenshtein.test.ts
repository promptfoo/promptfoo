import { describe, expect, it } from 'vitest';
import { handleLevenshtein } from '../../src/assertions/levenshtein';

import type { AssertionParams } from '../../src/types/index';

function createLevenshteinParams(
  outputString: string,
): Omit<AssertionParams, 'assertion' | 'renderedValue' | 'inverse'> {
  return {
    outputString,
    test: {},
    providerResponse: { output: outputString, tokenUsage: {} },
    baseType: 'contains',
    assertionValueContext: {
      prompt: '',
      vars: {},
      test: {},
      logProbs: undefined,
      provider: {} as any,
      providerResponse: { output: outputString, tokenUsage: {} },
    },
    output: outputString,
  };
}

describe('handleLevenshtein', () => {
  it('should pass when strings are identical', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein' },
      renderedValue: 'test',
      ...createLevenshteinParams('test'),
      inverse: false,
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when distance is within default threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein' },
      renderedValue: 'test',
      ...createLevenshteinParams('tast'), // Distance of 1
      inverse: false,
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should pass when distance is within custom threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', threshold: 2 },
      renderedValue: 'test',
      ...createLevenshteinParams('tost'), // Distance of 1
      inverse: false,
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should fail when distance exceeds threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', threshold: 1 },
      renderedValue: 'test',
      ...createLevenshteinParams('toast'), // Distance of 2
      inverse: false,
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe('Levenshtein distance 2 is greater than threshold 1');
  });

  it('should fail when distance exceeds default threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein' },
      renderedValue: 'test',
      ...createLevenshteinParams('completely different'), // Distance > 5
      inverse: false,
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it('should throw error when renderedValue is not a string', () => {
    expect(() =>
      handleLevenshtein({
        assertion: { type: 'levenshtein' },
        renderedValue: 123 as any,
        ...createLevenshteinParams('test'),
        inverse: false,
      }),
    ).toThrow('"levenshtein" assertion type must have a string value');
  });

  it('should handle empty strings', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein' },
      renderedValue: '',
      ...createLevenshteinParams(''),
      inverse: false,
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should handle long strings', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', threshold: 10 },
      renderedValue: 'this is a very long string to test',
      ...createLevenshteinParams('this is a vary long string to test'),
      inverse: false,
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  describe('inverse (not-levenshtein)', () => {
    it('should fail when distance is within threshold', () => {
      const result = handleLevenshtein({
        assertion: { type: 'levenshtein', threshold: 5 },
        renderedValue: 'test',
        ...createLevenshteinParams('tast'), // Distance of 1, within threshold
        inverse: true,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('Levenshtein distance 1 is less than or equal to threshold 5');
    });

    it('should pass when distance exceeds threshold', () => {
      const result = handleLevenshtein({
        assertion: { type: 'levenshtein', threshold: 2 },
        renderedValue: 'test',
        ...createLevenshteinParams('completely different'), // Distance well over threshold
        inverse: true,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toBe('Assertion passed');
    });

    it('should fail at the exact boundary (distance === threshold)', () => {
      const result = handleLevenshtein({
        assertion: { type: 'levenshtein', threshold: 2 },
        renderedValue: 'test',
        ...createLevenshteinParams('toast'), // Distance of exactly 2, equal to threshold
        inverse: true,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('Levenshtein distance 2 is less than or equal to threshold 2');
    });

    it('should honor inverse with the default threshold (no threshold specified)', () => {
      const result = handleLevenshtein({
        assertion: { type: 'levenshtein' }, // Default threshold of 5
        renderedValue: 'test',
        ...createLevenshteinParams('tast'), // Distance of 1, within default threshold
        inverse: true,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('Levenshtein distance 1 is less than or equal to threshold 5');
    });
  });
});
