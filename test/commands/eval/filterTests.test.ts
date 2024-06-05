import { TestCase, TestSuite } from '../../../src/types';

import { filterTests } from '../../../src/commands/eval/filterTests';

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
  const testSuite = {
    tests,
  } as TestSuite;

  it('should run all tests when no args', async () => {
    const result = await filterTests(testSuite, {});

    expect(result).toStrictEqual(tests);
  });

  it('handles no tests', async () => {
    const result = await filterTests({} as TestSuite, {});

    expect(result).toBe(undefined);
  });

  describe('firstN', () => {
    it('should only run Huey and Dewey', async () => {
      const result = await filterTests(testSuite, { firstN: '2' });

      expect(result).toStrictEqual(tests.slice(0, 2));
    });

    it('throws an exception when firstN is not a number', async () => {
      await expect(() => filterTests(testSuite, { firstN: 'NOPE' })).rejects.toEqual(
        new Error('firstN must be a number, got: NOPE'),
      );
    });
  });

  describe('pattern', () => {
    it('should only return tests whose description ends in "ey"', async () => {
      const result = await filterTests(testSuite, { pattern: 'ey$' });

      expect(result).toStrictEqual([testHuey, testDewey]);
    });

    it('can combine firstN and pattern', async () => {
      const result = await filterTests(testSuite, { firstN: '1', pattern: 'ey$' });

      expect(result).toStrictEqual([testHuey]);
    });

    it('does not mutate when when has args', async () => {
      const result = await filterTests(testSuite, { firstN: '1', pattern: 'ey$' });

      expect(result).not.toBe(tests);
    });
  });
});
