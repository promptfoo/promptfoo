import { describe, expect, it } from 'vitest';
import { handleCharacterCount } from '../../src/assertions/wordCount';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AssertionValue, AtomicTestCase } from '../../src/types/index';

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

const defaultParams = {
  baseType: 'character-count' as const,
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'test output' },
  },
  output: 'test output',
  providerResponse: { output: 'test output' },
  test: {} as AtomicTestCase,
};

function makeParams(value: AssertionValue, outputString: string, inverse = false): AssertionParams {
  return {
    ...defaultParams,
    assertion: { type: inverse ? 'not-character-count' : 'character-count', value },
    renderedValue: value,
    outputString,
    inverse,
  };
}

describe('handleCharacterCount', () => {
  describe('Unicode code point counting', () => {
    it.each([
      ['plain ASCII', 'hello', 5],
      ['astral emoji', 'A😀B', 3],
      ['combining marks', 'e\u0301', 2],
      ['zero-width joiner sequences', '👨‍👩‍👧‍👦', 7],
      ['empty output', '', 0],
    ])('counts %s by Unicode code point', (_name, output, expected) => {
      expect(handleCharacterCount(makeParams(expected, output))).toMatchObject({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });
  });

  describe('exact and bounded counts', () => {
    it('accepts numeric strings for exact counts', () => {
      expect(handleCharacterCount(makeParams('3', 'abc')).pass).toBe(true);
    });

    it.each([
      [{ min: 3, max: 5 }, 'abcd'],
      [{ min: 4 }, 'abcd'],
      [{ max: 4 }, 'abcd'],
    ])('accepts an output inside the %j bounds', (value, output) => {
      expect(handleCharacterCount(makeParams(value, output)).pass).toBe(true);
    });

    it('returns a descriptive reason when the count is outside a range', () => {
      expect(handleCharacterCount(makeParams({ min: 5, max: 10 }, 'abc'))).toMatchObject({
        pass: false,
        score: 0,
        reason: 'Character count 3 is not between 5 and 10',
      });
    });
  });

  describe('inverse mode', () => {
    it('passes when an exact count does not match', () => {
      expect(handleCharacterCount(makeParams(4, 'abc', true)).pass).toBe(true);
    });

    it('fails when the count falls inside the excluded range', () => {
      expect(handleCharacterCount(makeParams({ min: 2, max: 4 }, 'abc', true))).toMatchObject({
        pass: false,
        score: 0,
        reason: 'Expected character count to not be between 2 and 4, but got 3',
      });
    });
  });

  describe('invalid configuration', () => {
    it.each([-1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
      'rejects invalid exact count %s',
      (value) => {
        expect(() => handleCharacterCount(makeParams(value, 'abc'))).toThrow(
          '"character-count" assertion count must be a non-negative finite number',
        );
      },
    );

    it.each([
      { min: -1 },
      { max: -1 },
      { min: Number.POSITIVE_INFINITY },
      { max: Number.NEGATIVE_INFINITY },
      { min: Number.NaN },
    ])('rejects invalid bounds %j', (value) => {
      expect(() => handleCharacterCount(makeParams(value, 'abc'))).toThrow(
        '"character-count" assertion min/max must be non-negative finite numbers',
      );
    });

    it('rejects a range whose minimum exceeds its maximum', () => {
      expect(() => handleCharacterCount(makeParams({ min: 5, max: 4 }, 'abc'))).toThrow(
        '"character-count" assertion: min (5) must be less than or equal to max (4)',
      );
    });

    it('rejects objects without a minimum or maximum', () => {
      expect(() => handleCharacterCount(makeParams({}, 'abc'))).toThrow(
        '"character-count" assertion object must have "min" and/or "max" properties',
      );
    });
  });
});
