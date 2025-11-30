import { describe, expect, it } from 'vitest';
import { addCrescendo } from '../../../src/redteam/strategies/crescendo';

import type { TestCase } from '../../../src/types/index';

describe('addCrescendo', () => {
  it('should add crescendo configuration to test cases', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case 1',
        vars: { input: 'test input' },
        assert: [
          {
            type: 'contains',
            metric: 'exactMatch',
            value: 'expected output',
          },
        ],
      },
    ];

    const injectVar = 'input';
    const config = { someConfig: 'value' };

    const result = addCrescendo(testCases, injectVar, config);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      description: 'Test case 1',
      vars: { input: 'test input' },
      provider: {
        id: 'promptfoo:redteam:crescendo',
        config: {
          injectVar: 'input',
          someConfig: 'value',
        },
      },
      metadata: {
        strategyId: 'crescendo',
        originalText: 'test input',
      },
      assert: [
        {
          type: 'contains',
          metric: 'exactMatch/Crescendo',
          value: 'expected output',
        },
      ],
    });
  });

  it('should handle test cases without assertions', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case without assertions',
        vars: { input: 'test input' },
      },
    ];

    const result = addCrescendo(testCases, 'input', {});

    expect(result).toHaveLength(1);
    expect(result[0].assert).toBeUndefined();
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:crescendo',
      config: {
        injectVar: 'input',
      },
    });
    expect(result[0].metadata).toEqual({
      strategyId: 'crescendo',
      originalText: 'test input',
    });
  });

  it('should handle empty test cases array', () => {
    const result = addCrescendo([], 'inject', {});
    expect(result).toEqual([]);
  });

  it('should preserve other test case properties', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case',
        vars: { input: 'test' },
        provider: { id: 'original-provider' },
        assert: [{ type: 'contains', metric: 'test', value: 'value' }],
        otherProp: 'should be preserved',
      } as TestCase & { otherProp: string },
    ];

    const result = addCrescendo(testCases, 'input', {});

    expect(result[0]).toMatchObject({
      description: 'Test case',
      vars: { input: 'test' },
      otherProp: 'should be preserved',
      provider: {
        id: 'promptfoo:redteam:crescendo',
        config: {
          injectVar: 'input',
        },
      },
      metadata: {
        strategyId: 'crescendo',
        originalText: 'test',
      },
    });
  });

  describe('Rubric Storage (Provider Level)', () => {
    it('should store rendered rubric in storedGraderResult.assertion.value', () => {
      // Test the pattern used in crescendo provider for storing rubric
      const mockRenderedRubric = '<rubric>Rendered grading criteria</rubric>';
      const mockGraderResult: {
        pass: boolean;
        score: number;
        reason: string;
        assertion?: any;
      } = {
        pass: false,
        score: 0,
        reason: 'Jailbreak detected',
      };

      const testAssertion = {
        type: 'promptfoo:redteam:policy' as const,
        metric: 'PolicyViolation:test/Crescendo',
      };

      // Simulate the pattern used in crescendo provider
      const storedResult = {
        ...mockGraderResult,
        assertion: mockGraderResult.assertion
          ? { ...mockGraderResult.assertion, value: mockRenderedRubric }
          : testAssertion && 'type' in testAssertion && (testAssertion as any).type !== 'assert-set'
            ? { ...testAssertion, value: mockRenderedRubric }
            : undefined,
      };

      expect(storedResult.assertion).toBeDefined();
      expect(storedResult.assertion?.value).toBe(mockRenderedRubric);
      expect(storedResult.assertion?.type).toBe('promptfoo:redteam:policy');
      expect(storedResult.assertion?.metric).toBe('PolicyViolation:test/Crescendo');
    });

    it('should use grade.assertion when present', () => {
      const mockRenderedRubric = '<rubric>Test rubric</rubric>';
      const mockGraderResultWithAssertion = {
        pass: false,
        score: 0,
        reason: 'Failed',
        assertion: {
          type: 'promptfoo:redteam:harmful' as const,
          metric: 'Harmful/Crescendo',
          value: 'old value',
        },
      };

      const storedResult = {
        ...mockGraderResultWithAssertion,
        assertion: mockGraderResultWithAssertion.assertion
          ? { ...mockGraderResultWithAssertion.assertion, value: mockRenderedRubric }
          : undefined,
      };

      expect(storedResult.assertion?.value).toBe(mockRenderedRubric);
      expect(storedResult.assertion?.type).toBe('promptfoo:redteam:harmful');
      expect(storedResult.assertion?.metric).toBe('Harmful/Crescendo');
    });

    it('should not create assertion for AssertionSet', () => {
      const mockRenderedRubric = '<rubric>Test rubric</rubric>';
      const mockGraderResult = {
        pass: false,
        score: 0,
        reason: 'Failed',
      };

      const assertionSet = {
        type: 'assert-set' as const,
        assert: [{ type: 'contains' as const, value: 'test' }],
      };

      const storedResult = {
        ...mockGraderResult,
        assertion:
          assertionSet && 'type' in assertionSet && assertionSet.type !== 'assert-set'
            ? { ...assertionSet, value: mockRenderedRubric }
            : undefined,
      };

      expect(storedResult.assertion).toBeUndefined();
      expect(storedResult.pass).toBe(false);
    });
  });
});
