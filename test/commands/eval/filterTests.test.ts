import {TestCase, TestSuite} from "../../../src/types";

import {filterTests} from '../../../src/commands/eval/filterTests';

describe('filterTests', () => {
  const testNoDescription = {};
  const testHuey = {
    description: 'Huey',
  };
  const testDewey = {
    description: 'Dewey',
  };
  const testLouie = {
    description: 'Louie',
  };
  const tests = [testHuey, testNoDescription, testDewey, testLouie];

  it('should run all tests when no args', () => {
    const result = filterTests(tests, {});

    expect(result).toStrictEqual(tests);
  });

  it('handles no tests', () => {
    const result = filterTests(undefined, {});

    expect(result).toBe(undefined);
  });

  describe('firstN', () => {
    it('should only run Huey and Dewey', () => {
      const result = filterTests(tests, { firstN: '2' });

      expect(result).toStrictEqual(tests.slice(0, 2));
    });

    it('throws an exception when firstN is not a number', () => {
      expect(() => filterTests(tests, { firstN: 'NOPE' }))
        .toThrow(new Error('firstN must be a number, got: NOPE'));
    });
  });

  describe('pattern', () => {
    it('should only return tests whose description ends in "ey"', () => {
      const result = filterTests(tests, { pattern: 'ey$' });

      expect(result).toStrictEqual([testHuey, testDewey]);
    });

    it('can combine firstN and pattern', () => {
      const result = filterTests(tests, { firstN: '1', pattern: 'ey$' });

      expect(result).toStrictEqual([testHuey]);
    });

    it('does not mutate when when has args', () => {
      const result = filterTests(tests, { firstN: '1', pattern: 'ey$' });

      expect(result).not.toBe(tests);
    });
  });
});
