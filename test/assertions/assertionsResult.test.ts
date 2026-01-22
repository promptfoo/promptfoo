import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssertionsResult,
  DEFAULT_TOKENS_USED,
  GUARDRAIL_BLOCKED_REASON,
} from '../../src/assertions/assertionsResult';
import { getEnvBool } from '../../src/envars';

import type { AssertionSet, GradingResult } from '../../src/types/index';

vi.mock('../../src/envars');

describe('AssertionsResult', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('noAssertsResult', () => {
    it('should return default result for no assertions', () => {
      const result = AssertionsResult.noAssertsResult();
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'No assertions',
        tokensUsed: DEFAULT_TOKENS_USED,
      });
    });
  });

  describe('addResult', () => {
    it('should add result and update totals', () => {
      const assertionsResult = new AssertionsResult({});
      const result: GradingResult = {
        pass: true,
        score: 0.8,
        reason: 'Test passed',
        tokensUsed: {
          total: 100,
          prompt: 50,
          completion: 50,
          cached: 0,
        },
      };

      assertionsResult.addResult({
        index: 0,
        result,
        metric: 'accuracy',
        weight: 2,
      });

      expect(assertionsResult['totalScore']).toBe(1.6); // 0.8 * 2
      expect(assertionsResult['totalWeight']).toBe(2);
      expect(assertionsResult['tokensUsed']).toEqual({
        total: 100,
        prompt: 50,
        completion: 50,
        cached: 0,
        numRequests: 0,
      });
      expect(assertionsResult['namedScores']).toEqual({
        accuracy: 0.8,
      });
    });

    it('should handle failed results', () => {
      const assertionsResult = new AssertionsResult({});
      const result: GradingResult = {
        pass: false,
        score: 0.3,
        reason: 'Test failed',
        tokensUsed: DEFAULT_TOKENS_USED,
      };

      assertionsResult.addResult({
        index: 0,
        result,
      });

      expect(assertionsResult['failedReason']).toBe('Test failed');
    });

    it('should throw error if short circuit enabled', () => {
      vi.mocked(getEnvBool).mockReturnValue(true);

      const assertionsResult = new AssertionsResult({});
      const result: GradingResult = {
        pass: false,
        score: 0,
        reason: 'Critical failure',
        tokensUsed: DEFAULT_TOKENS_USED,
      };

      expect(() =>
        assertionsResult.addResult({
          index: 0,
          result,
        }),
      ).toThrow('Critical failure');
    });
  });

  describe('testResult', () => {
    it('should calculate final result with threshold', async () => {
      const assertionsResult = new AssertionsResult({ threshold: 0.7 });

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 0.6,
          reason: 'Test 1',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        weight: 1,
      });

      assertionsResult.addResult({
        index: 1,
        result: {
          pass: true,
          score: 0.8,
          reason: 'Test 2',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        weight: 1,
      });

      const result = await assertionsResult.testResult();

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.7);
      expect(result.reason).toBe('Aggregate score 0.70 ≥ 0.7 threshold');
    });

    it('should handle scoring function', async () => {
      const assertionsResult = new AssertionsResult({});
      const scoringFunction = vi.fn().mockResolvedValue({
        pass: true,
        score: 0.9,
        reason: 'Custom scoring',
      });

      const result = await assertionsResult.testResult(scoringFunction);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.9);
      expect(result.reason).toBe('Custom scoring');
      expect(scoringFunction).toHaveBeenCalledWith(
        {},
        {
          threshold: undefined,
          parentAssertionSet: undefined,
          componentResults: [],
          tokensUsed: DEFAULT_TOKENS_USED,
        },
      );
    });

    it('should handle scoring function errors', async () => {
      const assertionsResult = new AssertionsResult({});
      const scoringFunction = vi.fn().mockRejectedValue(new Error('Scoring failed'));

      const result = await assertionsResult.testResult(scoringFunction);

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('Scoring function error: Scoring failed');
    });

    it('should handle failed content safety checks', async () => {
      const assertionsResult = new AssertionsResult({});

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: false,
          score: 0,
          reason: 'Failed safety check',
          assertion: {
            type: 'guardrails',
            config: {
              purpose: 'redteam',
            },
          },
          tokensUsed: DEFAULT_TOKENS_USED,
        },
      });

      const result = await assertionsResult.testResult();

      expect(result.pass).toBe(true);
      expect(result.reason).toBe(GUARDRAIL_BLOCKED_REASON);
    });
  });

  describe('parentAssertionSet', () => {
    it('should return parent assertion set', () => {
      const parentSet = {
        index: 1,
        assertionSet: {
          type: 'assert-set',
          assert: [
            {
              type: 'contains-any',
            },
          ],
        } as AssertionSet,
      };
      const assertionsResult = new AssertionsResult({ parentAssertionSet: parentSet });

      expect(assertionsResult.parentAssertionSet).toBe(parentSet);
    });
  });

  describe('hierarchy metadata', () => {
    it('should annotate assert-set parent with isAssertSet and childCount', async () => {
      const assertionsResult = new AssertionsResult({});

      // Add a result that has nested componentResults (simulating assert-set)
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 0.75,
          reason: 'Either/Or passed',
          assertion: {
            type: 'contains',
            threshold: 0.5,
            weight: 2,
          },
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'Cost check passed',
              assertion: { type: 'cost', weight: 1 },
            },
            {
              pass: false,
              score: 0,
              reason: 'Latency check failed',
              assertion: { type: 'latency', weight: 1 },
            },
          ],
          tokensUsed: DEFAULT_TOKENS_USED,
        },
      });

      const result = await assertionsResult.testResult();

      // Should have 3 component results: parent + 2 children
      expect(result.componentResults).toHaveLength(3);

      // First result should be the parent assert-set
      const parent = result.componentResults![0];
      expect(parent.metadata?.isAssertSet).toBe(true);
      expect(parent.metadata?.childCount).toBe(2);
      expect(parent.metadata?.assertSetThreshold).toBe(0.5);
      expect(parent.metadata?.assertSetWeight).toBe(2);

      // Second result should be first child with parentAssertSetIndex
      const child1 = result.componentResults![1];
      expect(child1.metadata?.parentAssertSetIndex).toBe(0);
      expect(child1.metadata?.assertSetWeight).toBe(1);

      // Third result should be second child with parentAssertSetIndex
      const child2 = result.componentResults![2];
      expect(child2.metadata?.parentAssertSetIndex).toBe(0);
      expect(child2.metadata?.assertSetWeight).toBe(1);
    });

    it('should preserve assertion weight in metadata for standalone assertions', async () => {
      const assertionsResult = new AssertionsResult({});

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Contains check passed',
          assertion: { type: 'contains', weight: 3 },
          tokensUsed: DEFAULT_TOKENS_USED,
        },
      });

      const result = await assertionsResult.testResult();

      expect(result.componentResults).toHaveLength(1);
      expect(result.componentResults![0].metadata?.assertSetWeight).toBe(3);
    });

    it('should correctly index multiple assert-sets', async () => {
      const assertionsResult = new AssertionsResult({});

      // First assert-set
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'First set passed',
          assertion: { type: 'contains', threshold: 0.5 },
          componentResults: [
            { pass: true, score: 1, reason: 'Child 1', assertion: { type: 'cost' } },
          ],
          tokensUsed: DEFAULT_TOKENS_USED,
        },
      });

      // Standalone assertion
      assertionsResult.addResult({
        index: 1,
        result: {
          pass: true,
          score: 1,
          reason: 'Standalone passed',
          assertion: { type: 'contains' },
          tokensUsed: DEFAULT_TOKENS_USED,
        },
      });

      // Second assert-set
      assertionsResult.addResult({
        index: 2,
        result: {
          pass: false,
          score: 0.3,
          reason: 'Second set failed',
          assertion: { type: 'contains', threshold: 0.8 },
          componentResults: [
            { pass: false, score: 0.3, reason: 'Child 2', assertion: { type: 'llm-rubric' } },
          ],
          tokensUsed: DEFAULT_TOKENS_USED,
        },
      });

      const result = await assertionsResult.testResult();

      // Should have 5 component results: 2 parents + 2 children + 1 standalone
      expect(result.componentResults).toHaveLength(5);

      // First set parent at index 0
      expect(result.componentResults![0].metadata?.isAssertSet).toBe(true);
      expect(result.componentResults![0].metadata?.childCount).toBe(1);

      // First set child at index 1
      expect(result.componentResults![1].metadata?.parentAssertSetIndex).toBe(0);

      // Standalone at index 2
      expect(result.componentResults![2].metadata?.isAssertSet).toBeUndefined();
      expect(result.componentResults![2].metadata?.parentAssertSetIndex).toBeUndefined();

      // Second set parent at index 3
      expect(result.componentResults![3].metadata?.isAssertSet).toBe(true);
      expect(result.componentResults![3].metadata?.childCount).toBe(1);

      // Second set child at index 4
      expect(result.componentResults![4].metadata?.parentAssertSetIndex).toBe(3);
    });
  });
});
