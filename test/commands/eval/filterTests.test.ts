import { filterTests } from '../../../src/commands/eval/filterTests';
import Eval from '../../../src/models/eval';
import type { TestSuite, TestCase } from '../../../src/types';
import { ResultFailureReason } from '../../../src/types';

jest.mock('../../../src/models/eval', () => ({
  findById: jest.fn(),
}));

describe('filterTests', () => {
  const mockTestSuite: TestSuite = {
    prompts: [],
    providers: [],
    tests: [
      {
        description: 'test1',
        vars: { var1: 'test1' },
        assert: [],
        metadata: { type: 'unit' },
      },
      {
        description: 'test2',
        vars: { var1: 'test2' },
        assert: [],
        metadata: { type: 'integration' },
      },
      {
        description: 'test3',
        vars: { var1: 'test3' },
        assert: [],
        metadata: { type: 'unit' },
      },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    const mockEval = {
      id: 'eval-123',
      createdAt: new Date().getTime(),
      config: {},
      results: [],
      resultsCount: 0,
      prompts: [],
      persisted: true,
      toEvaluateSummary: jest.fn().mockResolvedValue({
        version: 2,
        timestamp: new Date().toISOString(),
        results: [
          {
            vars: { var1: 'test1' },
            success: false,
            failureReason: ResultFailureReason.ASSERT,
            testCase: mockTestSuite.tests![0],
          },
          {
            vars: { var1: 'test3' },
            success: false,
            failureReason: ResultFailureReason.ERROR,
            testCase: mockTestSuite.tests![2],
          },
        ],
        table: { head: { prompts: [], vars: [] }, body: [] },
        stats: {
          successes: 0,
          failures: 0,
          errors: 0,
          tokenUsage: {
            total: 0,
            prompt: 0,
            completion: 0,
            cached: 0,
            numRequests: 0,
            completionDetails: {
              reasoning: 0,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
            },
          },
        },
      }),
    };
    jest.mocked(Eval.findById).mockResolvedValue(mockEval as any);
  });

  it('should return all tests if no options provided', async () => {
    const result = await filterTests(mockTestSuite, {});
    expect(result).toEqual(mockTestSuite.tests);
  });

  it('should return empty array if testSuite has no tests', async () => {
    const result = await filterTests({ prompts: [], providers: [] }, {});
    expect(result).toEqual([]);
  });

  describe('metadata filter', () => {
    it('should filter tests by metadata key-value pair', async () => {
      const result = await filterTests(mockTestSuite, { metadata: 'type=unit' });
      expect(result).toHaveLength(2);
      expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test3']);
    });

    it('should throw error if metadata filter format is invalid', async () => {
      await expect(filterTests(mockTestSuite, { metadata: 'invalid' })).rejects.toThrow(
        '--filter-metadata must be specified in key=value format',
      );
    });

    it('should exclude tests without metadata', async () => {
      const testSuite = {
        ...mockTestSuite,
        tests: [...mockTestSuite.tests!, { description: 'no-metadata', vars: {}, assert: [] }],
      };
      const result = await filterTests(testSuite, { metadata: 'type=unit' });
      expect(result).toHaveLength(2);
      expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test3']);
    });
  });

  describe('failing filter', () => {
    it('should filter failing tests when failing option is provided', async () => {
      const result = await filterTests(mockTestSuite, { failing: 'eval-123' });
      expect(result).toHaveLength(2);
      expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test3']);
    });
  });

  describe('errors only filter', () => {
    it('should filter error tests when errorsOnly option is provided', async () => {
      const result = await filterTests(mockTestSuite, { errorsOnly: 'eval-123' });
      expect(result).toHaveLength(1);
      expect(result[0]?.vars?.var1).toBe('test3');
    });
  });

  describe('pattern filter', () => {
    it('should filter tests by description pattern', async () => {
      const result = await filterTests(mockTestSuite, { pattern: 'test[12]' });
      expect(result).toHaveLength(2);
      expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test2']);
    });

    it('should handle tests without description', async () => {
      const testSuite = {
        ...mockTestSuite,
        tests: [...mockTestSuite.tests!, { vars: {}, assert: [] }],
      };
      const result = await filterTests(testSuite, { pattern: 'test' });
      expect(result).toHaveLength(3);
    });
  });

  describe('firstN filter', () => {
    it('should take first N tests', async () => {
      const result = await filterTests(mockTestSuite, { firstN: 2 });
      expect(result).toHaveLength(2);
      expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test2']);
    });

    it('should handle string input for firstN', async () => {
      const result = await filterTests(mockTestSuite, { firstN: '2' });
      expect(result).toHaveLength(2);
      expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test2']);
    });

    it('should throw error if firstN is not a number', async () => {
      await expect(filterTests(mockTestSuite, { firstN: 'invalid' })).rejects.toThrow(
        'firstN must be a number, got: invalid',
      );
    });

    it('should handle undefined firstN', async () => {
      const result = await filterTests(mockTestSuite, { firstN: undefined });
      expect(result).toEqual(mockTestSuite.tests);
    });

    it('should throw error if firstN is null', async () => {
      await expect(filterTests(mockTestSuite, { firstN: null as any })).rejects.toThrow(
        'firstN must be a number, got: null',
      );
    });

    it('should throw error if firstN is NaN', async () => {
      await expect(filterTests(mockTestSuite, { firstN: Number.NaN })).rejects.toThrow(
        'firstN must be a number, got: NaN',
      );
    });
  });

  describe('sample filter', () => {
    it('should take N random tests', async () => {
      const result = await filterTests(mockTestSuite, { sample: 2 });
      expect(result).toHaveLength(2);
      // Can't test exact values since it's random
      expect(result.every((t: TestCase) => mockTestSuite.tests!.includes(t))).toBe(true);
    });

    it('should handle string input for sample', async () => {
      const result = await filterTests(mockTestSuite, { sample: '2' });
      expect(result).toHaveLength(2);
      expect(result.every((t: TestCase) => mockTestSuite.tests!.includes(t))).toBe(true);
    });

    it('should throw error if sample is not a number', async () => {
      await expect(filterTests(mockTestSuite, { sample: 'invalid' })).rejects.toThrow(
        'sample must be a number, got: invalid',
      );
    });

    it('should handle undefined sample', async () => {
      const result = await filterTests(mockTestSuite, { sample: undefined });
      expect(result).toEqual(mockTestSuite.tests);
    });

    it('should throw error if sample is null', async () => {
      await expect(filterTests(mockTestSuite, { sample: null as any })).rejects.toThrow(
        'sample must be a number, got: null',
      );
    });

    it('should throw error if sample is NaN', async () => {
      await expect(filterTests(mockTestSuite, { sample: Number.NaN })).rejects.toThrow(
        'sample must be a number, got: NaN',
      );
    });
  });

  describe('multiple filters', () => {
    it('should apply filters in correct order', async () => {
      const result = await filterTests(mockTestSuite, {
        metadata: 'type=unit',
        failing: 'eval-123',
        pattern: 'test1',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.vars?.var1).toBe('test1');
    });
  });
});
