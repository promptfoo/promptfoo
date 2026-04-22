import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filterTests } from '../../../src/commands/eval/filterTests';
import Eval from '../../../src/models/eval';
import { ResultFailureReason } from '../../../src/types/index';

import type { TestCase, TestSuite } from '../../../src/types/index';

vi.mock('../../../src/models/eval', () => ({
  default: {
    findById: vi.fn(),
  },
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
    vi.resetAllMocks();
    const mockEval = {
      id: 'eval-123',
      createdAt: new Date().getTime(),
      config: {},
      results: [],
      resultsCount: 0,
      prompts: [],
      persisted: true,
      toEvaluateSummary: vi.fn().mockResolvedValue({
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
            vars: { var1: 'test2' },
            success: false,
            failureReason: ResultFailureReason.ERROR,
            testCase: mockTestSuite.tests![1],
          },
          {
            vars: { var1: 'test3' },
            success: false,
            failureReason: ResultFailureReason.ASSERT,
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
    vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);
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

    describe('multiple metadata filters', () => {
      const multiMetadataTestSuite: TestSuite = {
        prompts: [],
        providers: [],
        tests: [
          {
            description: 'test1',
            vars: { var1: 'test1' },
            assert: [],
            metadata: { type: 'unit', env: 'dev', priority: 'high' },
          },
          {
            description: 'test2',
            vars: { var1: 'test2' },
            assert: [],
            metadata: { type: 'unit', env: 'prod', priority: 'low' },
          },
          {
            description: 'test3',
            vars: { var1: 'test3' },
            assert: [],
            metadata: { type: 'integration', env: 'dev', priority: 'high' },
          },
          {
            description: 'test4',
            vars: { var1: 'test4' },
            assert: [],
            metadata: { type: 'integration', env: 'prod', priority: 'medium' },
          },
        ],
      };

      it('should filter tests matching ALL metadata conditions (AND logic)', async () => {
        const result = await filterTests(multiMetadataTestSuite, {
          metadata: ['type=unit', 'env=dev'],
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test1');
      });

      it('should return empty when no tests match all conditions', async () => {
        const result = await filterTests(multiMetadataTestSuite, {
          metadata: ['type=unit', 'env=staging'],
        });
        expect(result).toHaveLength(0);
      });

      it('should handle single string value (backward compatibility)', async () => {
        const result = await filterTests(multiMetadataTestSuite, {
          metadata: 'type=unit',
        });
        expect(result).toHaveLength(2);
        expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test2']);
      });

      it('should handle array with single element', async () => {
        const result = await filterTests(multiMetadataTestSuite, {
          metadata: ['type=unit'],
        });
        expect(result).toHaveLength(2);
        expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test2']);
      });

      it('should filter with three or more conditions', async () => {
        const result = await filterTests(multiMetadataTestSuite, {
          metadata: ['type=unit', 'env=dev', 'priority=high'],
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test1');
      });

      it('should handle values containing equals sign', async () => {
        const testSuiteWithEquals: TestSuite = {
          prompts: [],
          providers: [],
          tests: [
            {
              description: 'test-with-equals',
              vars: { var1: 'test1' },
              assert: [],
              metadata: { query: 'a=1&b=2', type: 'special' },
            },
          ],
        };
        const result = await filterTests(testSuiteWithEquals, {
          metadata: ['query=a=1&b=2'],
        });
        expect(result).toHaveLength(1);
      });

      it('should throw error if any filter in array is invalid', async () => {
        await expect(
          filterTests(multiMetadataTestSuite, {
            metadata: ['type=unit', 'invalid'],
          }),
        ).rejects.toThrow('--filter-metadata must be specified in key=value format');
      });

      it('should throw error for empty value', async () => {
        await expect(
          filterTests(multiMetadataTestSuite, {
            metadata: ['type='],
          }),
        ).rejects.toThrow('--filter-metadata must be specified in key=value format');
      });

      it('should exclude tests missing any of the required metadata keys', async () => {
        const testSuitePartialMetadata: TestSuite = {
          prompts: [],
          providers: [],
          tests: [
            {
              description: 'has-both',
              vars: { var1: 'test1' },
              assert: [],
              metadata: { type: 'unit', env: 'dev' },
            },
            {
              description: 'missing-env',
              vars: { var1: 'test2' },
              assert: [],
              metadata: { type: 'unit' },
            },
          ],
        };
        const result = await filterTests(testSuitePartialMetadata, {
          metadata: ['type=unit', 'env=dev'],
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test1');
      });

      it('should work with array metadata values', async () => {
        const testSuiteArrayMetadata: TestSuite = {
          prompts: [],
          providers: [],
          tests: [
            {
              description: 'has-security-tag',
              vars: { var1: 'test1' },
              assert: [],
              metadata: { type: 'unit', tags: ['security', 'auth'] },
            },
            {
              description: 'no-security-tag',
              vars: { var1: 'test2' },
              assert: [],
              metadata: { type: 'unit', tags: ['performance'] },
            },
          ],
        };
        const result = await filterTests(testSuiteArrayMetadata, {
          metadata: ['type=unit', 'tags=security'],
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.vars?.var1).toBe('test1');
      });
    });
  });

  describe('failing filter', () => {
    it('should filter failing tests when failing option is provided', async () => {
      // --filter-failing returns all non-successful results (failures + errors)
      const result = await filterTests(mockTestSuite, { failing: 'eval-123' });
      expect(result).toHaveLength(3);
      expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test2', 'test3']);
    });

    it('should match failing tests when provider paths differ', async () => {
      vi.resetAllMocks();
      const absPath = path.join(process.cwd(), 'provider.js');
      const mockEval = {
        id: 'eval-123',
        createdAt: new Date().getTime(),
        config: {},
        results: [],
        resultsCount: 0,
        prompts: [],
        persisted: true,
        toEvaluateSummary: vi.fn().mockResolvedValue({
          version: 2,
          timestamp: new Date().toISOString(),
          results: [
            {
              vars: { var1: 'test1' },
              success: false,
              failureReason: ResultFailureReason.ASSERT,
              provider: { id: `file://${absPath}` },
              testCase: mockTestSuite.tests![0],
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
              completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
            },
          },
        }),
      };

      vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);

      const testSuite = {
        ...mockTestSuite,
        tests: [
          {
            ...mockTestSuite.tests![0],
            provider: `file://./provider.js`,
          },
        ],
      } as TestSuite;

      const result = await filterTests(testSuite, { failing: 'eval-123' });
      expect(result).toHaveLength(1);
    });
  });

  describe('errors only filter', () => {
    it('should filter error tests when errorsOnly option is provided', async () => {
      const result = await filterTests(mockTestSuite, { errorsOnly: 'eval-123' });
      expect(result).toHaveLength(1);
      expect(result[0]?.vars?.var1).toBe('test2');
    });
  });

  describe('failing only filter', () => {
    it('should filter assertion failures only, excluding errors', async () => {
      // --filter-failing-only returns only assertion failures, not errors
      const result = await filterTests(mockTestSuite, { failingOnly: 'eval-123' });
      expect(result).toHaveLength(2);
      // test1 and test3 have ASSERT failures, test2 has ERROR
      expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test3']);
    });

    it('should return empty when all failures are errors', async () => {
      vi.resetAllMocks();
      const mockEval = {
        id: 'eval-456',
        createdAt: new Date().getTime(),
        config: {},
        results: [],
        resultsCount: 0,
        prompts: [],
        persisted: true,
        toEvaluateSummary: vi.fn().mockResolvedValue({
          version: 2,
          timestamp: new Date().toISOString(),
          results: [
            {
              vars: { var1: 'test1' },
              success: false,
              failureReason: ResultFailureReason.ERROR,
              testCase: mockTestSuite.tests![0],
            },
            {
              vars: { var1: 'test2' },
              success: false,
              failureReason: ResultFailureReason.ERROR,
              testCase: mockTestSuite.tests![1],
            },
          ],
          table: { head: { prompts: [], vars: [] }, body: [] },
          stats: {
            successes: 0,
            failures: 0,
            errors: 2,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
            },
          },
        }),
      };
      vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);

      const result = await filterTests(mockTestSuite, { failingOnly: 'eval-456' });
      expect(result).toHaveLength(0);
    });

    it('should combine failingOnly and errorsOnly when both provided', async () => {
      // When both are provided, it should be a union of assertion failures and errors
      const result = await filterTests(mockTestSuite, {
        failingOnly: 'eval-123',
        errorsOnly: 'eval-123',
      });
      // Should include all 3 tests: test1 (ASSERT), test2 (ERROR), test3 (ASSERT)
      expect(result).toHaveLength(3);
      expect(result.map((t: TestCase) => t.vars?.var1)).toEqual(['test1', 'test3', 'test2']);
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

    it('should throw error for invalid regex pattern', async () => {
      await expect(filterTests(mockTestSuite, { pattern: '[invalid' })).rejects.toThrow(
        /Invalid regex pattern "\[invalid"/,
      );
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
