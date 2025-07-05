import { AssertionsResult, DEFAULT_TOKENS_USED } from '../../src/assertions/assertionsResult';
import { getEnvBool } from '../../src/envars';
import type { GradingResult, AssertionSet } from '../../src/types';

jest.mock('../../src/envars');

describe('AssertionsResult', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('noAssertsResult', () => {
    it('should return default result for no assertions', () => {
      const result = AssertionsResult.noAssertsResult();
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'No assertions',
        tokensUsed: DEFAULT_TOKENS_USED,
        assertion: null,
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
        assertion: null,
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
        assertion: null,
      };

      assertionsResult.addResult({
        index: 0,
        result,
      });

      expect(assertionsResult['failedReason']).toBe('Test failed');
    });

    it('should throw error if short circuit enabled', () => {
      jest.mocked(getEnvBool).mockReturnValue(true);

      const assertionsResult = new AssertionsResult({});
      const result: GradingResult = {
        pass: false,
        score: 0,
        reason: 'Critical failure',
        tokensUsed: DEFAULT_TOKENS_USED,
        assertion: null,
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
          assertion: null,
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
          assertion: null,
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
      const scoringFunction = jest.fn().mockResolvedValue({
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
      const scoringFunction = jest.fn().mockRejectedValue(new Error('Scoring failed'));

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
      expect(result.reason).toBe('Content failed guardrail safety checks');
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
});
