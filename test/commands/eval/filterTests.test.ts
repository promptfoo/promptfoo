import { filterTests } from '../../../src/commands/eval/filterTests';
import type { TestSuite } from '../../../src/types';

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

    expect(result).toEqual([]);
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

  describe('sample', () => {
    it('should return the requested number of random tests', async () => {
      const result = await filterTests(testSuite, { sample: 2 });

      expect(result).toHaveLength(2);
      // Each result should be one of the original tests
      result?.forEach((test) => {
        expect(tests).toContain(test);
      });
    });

    it('accepts sample as string', async () => {
      const result = await filterTests(testSuite, { sample: '2' });

      expect(result).toHaveLength(2);
    });

    it('throws an exception when sample is not a number', async () => {
      await expect(() => filterTests(testSuite, { sample: 'NOPE' })).rejects.toEqual(
        new Error('sample must be a number, got: NOPE'),
      );
    });

    it('returns all tests when sample size exceeds test count', async () => {
      const result = await filterTests(testSuite, { sample: 10 });

      expect(result).toHaveLength(tests.length);
      result?.forEach((test) => {
        expect(tests).toContain(test);
      });
    });

    it('can combine with pattern filter', async () => {
      const result = await filterTests(testSuite, { sample: 1, pattern: 'ey$' });

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result?.[0].description).toMatch(/ey$/);
    });
  });

  describe('metadata', () => {
    const testWithMetadata1 = {
      description: 'Test with metadata 1',
      metadata: {
        strategyId: 'goat',
        pluginId: 'test-plugin',
      },
    };
    const testWithMetadata2 = {
      description: 'Test with metadata 2',
      metadata: {
        strategyId: 'sheep',
        pluginId: 'test-plugin',
      },
    };
    const testWithoutMetadata = {
      description: 'Test without metadata',
    };

    const testSuiteWithMetadata = {
      tests: [testWithMetadata1, testWithMetadata2, testWithoutMetadata],
    } as TestSuite;

    it('should filter tests by metadata key=value', async () => {
      const result = await filterTests(testSuiteWithMetadata, { metadata: 'strategyId=goat' });

      expect(result).toHaveLength(1);
      expect(result).toStrictEqual([testWithMetadata1]);
    });

    it('should return empty array when no tests match metadata', async () => {
      const result = await filterTests(testSuiteWithMetadata, { metadata: 'strategyId=invalid' });

      expect(result).toHaveLength(0);
      expect(result).toStrictEqual([]);
    });

    it('should return empty array when filtering for non-existent metadata key', async () => {
      const result = await filterTests(testSuiteWithMetadata, { metadata: 'nonexistent=value' });

      expect(result).toHaveLength(0);
      expect(result).toStrictEqual([]);
    });

    it('can combine metadata filter with other filters', async () => {
      const result = await filterTests(testSuiteWithMetadata, {
        metadata: 'pluginId=test-plugin',
        firstN: 1,
      });

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result?.[0]).toBe(testWithMetadata1);
    });

    it('throws error for invalid metadata format', async () => {
      await expect(() =>
        filterTests(testSuiteWithMetadata, { metadata: 'invalid-format' }),
      ).rejects.toThrow('--filter-metadata must be specified in key=value format');
    });
  });
});
