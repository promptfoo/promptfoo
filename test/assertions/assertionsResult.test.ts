import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssertionsResult,
  DEFAULT_TOKENS_USED,
  GUARDRAIL_BLOCKED_REASON,
} from '../../src/assertions/assertionsResult';
import { getEnvBool } from '../../src/envars';
import {
  accumulateGradingRequest,
  accumulateGradingTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
} from '../../src/util/tokenUsageUtils';

import type { AssertionSet, GradingResult, ScoringFunction } from '../../src/types/index';

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
        accuracy: 1.6,
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

    it('preserves detailed token accounting across multiple assertion results', async () => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'First grade passed',
          tokensUsed: {
            total: 20,
            prompt: 12,
            completion: 8,
            numRequests: 2,
            completionDetails: { reasoning: 5, cacheReadInputTokens: 7 },
          },
        },
      });
      assertionsResult.addResult({
        index: 1,
        result: {
          pass: false,
          score: 0,
          reason: 'Second grade failed',
          tokensUsed: {
            total: 11,
            prompt: 6,
            completion: 5,
            numRequests: 1,
            completionDetails: { reasoning: 3, cacheCreationInputTokens: 4 },
          },
        },
      });

      expect((await assertionsResult.testResult()).tokensUsed).toMatchObject({
        total: 31,
        prompt: 18,
        completion: 13,
        numRequests: 3,
        completionDetails: {
          reasoning: 8,
          cacheReadInputTokens: 7,
          cacheCreationInputTokens: 4,
        },
      });
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
    it('preserves cache provenance when every grading response was reused', async () => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Cached grading result without token usage',
          tokensUsed: DEFAULT_TOKENS_USED,
          metadata: { cachedResponse: true },
        },
      });

      const result = await assertionsResult.testResult();
      const usage = createEmptyAssertions();
      accumulateGradingRequest(usage, result.tokensUsed, {
        cached: result.metadata?.cachedResponse === true,
      });

      expect(result.tokensUsed).toMatchObject({
        total: 0,
        cached: 0,
        numRequests: 1,
        incurredTokenUsage: { total: 0, numRequests: 0 },
      });
      expect(result.metadata).toEqual({ cachedResponse: true });
      expect(usage.numRequests).toBe(0);
    });

    it('does not mark mixed fresh and cached grading responses as fully cached', async () => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Cached grading result',
          tokensUsed: DEFAULT_TOKENS_USED,
          metadata: { cachedResponse: true },
        },
      });
      assertionsResult.addResult({
        index: 1,
        result: {
          pass: true,
          score: 1,
          reason: 'Fresh grading result without token usage',
          tokensUsed: DEFAULT_TOKENS_USED,
          metadata: { renderedGradingPrompt: 'Grade this response' },
        },
      });

      const result = await assertionsResult.testResult();
      const usage = createEmptyAssertions();
      accumulateGradingRequest(usage, result.tokensUsed, {
        cached: result.metadata?.cachedResponse === true,
      });

      expect(result.metadata?.cachedResponse).toBeUndefined();
      expect(usage.numRequests).toBe(2);
      expect(result.tokensUsed?.incurredTokenUsage?.numRequests).toBe(1);
    });

    it('counts fresh matcher calls when avoided cached tokens exceed fresh token usage', async () => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Cached grading result',
          tokensUsed: { total: 0, cached: 97, numRequests: 0 },
          metadata: { cachedResponse: true },
        },
      });
      assertionsResult.addResult({
        index: 1,
        result: {
          pass: true,
          score: 1,
          reason: 'Fresh local grading result',
          tokensUsed: { total: 50, prompt: 30, completion: 20, numRequests: 0 },
          metadata: { renderedGradingPrompt: 'Grade this response' },
        },
      });

      const result = await assertionsResult.testResult();
      const usage = createEmptyAssertions();
      accumulateGradingRequest(usage, result.tokensUsed, {
        cached: result.metadata?.cachedResponse === true,
      });

      expect(usage).toMatchObject({ total: 147, cached: 97, numRequests: 2 });
      expect(result.tokensUsed?.incurredTokenUsage).toMatchObject({
        total: 50,
        numRequests: 1,
      });
      expect(result.metadata?.cachedResponse).toBeUndefined();
    });

    it('preserves logical and incurred usage when cached and fresh graders are combined', async () => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Cached grading result',
          metadata: { cachedResponse: true },
          tokensUsed: {
            total: 37,
            prompt: 23,
            completion: 14,
            numRequests: 1,
            completionDetails: { reasoning: 9 },
          },
        },
      });
      assertionsResult.addResult({
        index: 1,
        result: {
          pass: true,
          score: 1,
          reason: 'Fresh grading result',
          tokensUsed: {
            total: 23,
            prompt: 15,
            completion: 8,
            numRequests: 1,
            completionDetails: { reasoning: 4 },
          },
        },
      });

      const result = await assertionsResult.testResult();
      const accounting = createEmptyTokenUsage();
      accumulateGradingTokenUsage(accounting, result.tokensUsed, {
        cached: result.metadata?.cachedResponse,
      });

      expect(result.metadata?.cachedResponse).toBeUndefined();
      expect(result.tokensUsed).toMatchObject({
        total: 60,
        prompt: 38,
        completion: 22,
        cached: 37,
        numRequests: 2,
        completionDetails: { reasoning: 13 },
        incurredTokenUsage: {
          total: 23,
          prompt: 15,
          completion: 8,
          numRequests: 1,
          completionDetails: { reasoning: 4 },
        },
      });
      expect(accounting).toMatchObject({
        assertions: { total: 60, cached: 37, numRequests: 2 },
        incurredTokenUsage: { assertions: { total: 23, numRequests: 1 } },
      });
    });

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

    it('should honor a threshold of 0 as an override (never fail on individual assertion failures)', async () => {
      const assertionsResult = new AssertionsResult({ threshold: 0 });

      // A failing assertion — under the default all-pass logic this fails the test.
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: false,
          score: 0,
          reason: 'Test 1 failed',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        weight: 1,
      });

      // A passing assertion.
      assertionsResult.addResult({
        index: 1,
        result: {
          pass: true,
          score: 1,
          reason: 'Test 2 passed',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        weight: 1,
      });

      const result = await assertionsResult.testResult();

      // Aggregate score 0.5 ≥ 0 → the threshold override passes the test. Before the fix
      // `if (this.threshold)` was falsy for 0, so the override was skipped and the failing
      // assertion failed the whole test.
      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.5);
      expect(result.reason).toBe('Aggregate score 0.50 ≥ 0 threshold');
    });

    it('should pass at the threshold:0 boundary when every assertion fails (aggregate score 0)', async () => {
      // The override the fix depends on is `0 >= 0`. With every assertion failing the
      // aggregate score is exactly 0, which must still pass under threshold:0.
      const assertionsResult = new AssertionsResult({ threshold: 0 });
      assertionsResult.addResult({
        index: 0,
        result: { pass: false, score: 0, reason: 'failed', tokensUsed: DEFAULT_TOKENS_USED },
        weight: 1,
      });

      const result = await assertionsResult.testResult();

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('Aggregate score 0.00 ≥ 0 threshold');
    });

    it('should NOT force-pass when the threshold is null (e.g. an empty `threshold:` in YAML)', async () => {
      // A null/NaN threshold is not a real score requirement. Gating the override on a
      // numeric threshold keeps `score >= null` (always true) from silently passing every
      // failing assertion; the default all-pass logic applies instead.
      const assertionsResult = new AssertionsResult({ threshold: null as unknown as number });
      assertionsResult.addResult({
        index: 0,
        result: { pass: false, score: 0, reason: 'Test failed', tokensUsed: DEFAULT_TOKENS_USED },
        weight: 1,
      });

      const result = await assertionsResult.testResult();

      expect(result.pass).toBe(false);
      expect(result.reason).toBe('Test failed');
    });

    it('should honor an assert-set threshold of 0 (override + threshold survives in metadata)', async () => {
      // The assert-set path (index.ts) builds an AssertionsResult with a parentAssertionSet,
      // and flows through the same numeric-threshold override gate. A threshold of 0
      // must still engage the override here, and `0` must round-trip into the assert-set metadata
      // (buildAssertionSetMetadata uses `!== undefined`, not a truthy check).
      const assertionsResult = new AssertionsResult({
        threshold: 0,
        parentAssertionSet: {
          index: 0,
          assertionSet: {
            type: 'assert-set',
            threshold: 0,
            assert: [
              { type: 'equals', value: 'Hello world' },
              { type: 'contains', value: 'world' },
            ],
          } as AssertionSet,
        },
      });

      // A failing assertion — under the default all-pass logic this fails the assert-set.
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: false,
          score: 0,
          reason: 'equals failed',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        weight: 1,
      });
      assertionsResult.addResult({
        index: 1,
        result: {
          pass: true,
          score: 1,
          reason: 'contains passed',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        weight: 1,
      });

      const result = await assertionsResult.testResult();

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.5);
      expect(result.reason).toBe('Aggregate score 0.50 ≥ 0 threshold');
      expect(result.metadata?.assertionSet?.threshold).toBe(0);
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

    it('exposes completion details to typed scoring functions', async () => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Grading passed',
          tokensUsed: {
            total: 12,
            prompt: 5,
            completion: 7,
            numRequests: 1,
            completionDetails: { reasoning: 7 },
          },
        },
      });

      const scoringFunction: ScoringFunction = (_scores, context) => ({
        pass: true,
        score: context?.tokensUsed?.completionDetails?.reasoning ?? 0,
        reason: 'Reasoning tokens are available',
      });

      expect((await assertionsResult.testResult(scoringFunction)).score).toBe(7);
    });

    it('clears cached provenance when a custom scoring function performs fresh grading', async () => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Cached component grade',
          tokensUsed: { total: 0, cached: 97, numRequests: 0 },
          metadata: { cachedResponse: true },
        },
      });
      const scoringFunction: ScoringFunction = () => ({
        pass: true,
        score: 0.8,
        reason: 'Fresh custom grading',
        tokensUsed: { total: 23, prompt: 15, completion: 8, numRequests: 1 },
      });

      const result = await assertionsResult.testResult(scoringFunction);
      const usage = createEmptyAssertions();
      accumulateGradingRequest(usage, result.tokensUsed, {
        cached: result.metadata?.cachedResponse === true,
      });

      expect(result.metadata?.cachedResponse).toBeUndefined();
      expect(usage).toMatchObject({
        total: 120,
        prompt: 15,
        completion: 8,
        cached: 97,
        numRequests: 2,
      });
      expect(result.tokensUsed?.incurredTokenUsage).toMatchObject({
        total: 23,
        prompt: 15,
        completion: 8,
        numRequests: 1,
      });
    });

    it.each([
      {
        label: 'fresh components and fresh scoring',
        componentCached: false,
        scorerCached: false,
        expectedLogical: { total: 73, prompt: 45, completion: 28, cached: 0, numRequests: 2 },
      },
      {
        label: 'fresh components and cached scoring',
        componentCached: false,
        scorerCached: true,
        expectedLogical: { total: 87, prompt: 52, completion: 35, cached: 37, numRequests: 2 },
        expectedIncurred: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
      },
      {
        label: 'cached components and fresh scoring',
        componentCached: true,
        scorerCached: false,
        expectedLogical: { total: 120, prompt: 76, completion: 44, cached: 97, numRequests: 2 },
        expectedIncurred: { total: 23, prompt: 15, completion: 8, numRequests: 1 },
      },
      {
        label: 'cached components and cached scoring',
        componentCached: true,
        scorerCached: true,
        expectedLogical: { total: 134, prompt: 83, completion: 51, cached: 134, numRequests: 2 },
        expectedIncurred: { total: 0, prompt: 0, completion: 0, numRequests: 0 },
      },
    ])('accounts for $label without losing or double-counting usage', async (scenario) => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Component grading result',
          tokensUsed: scenario.componentCached
            ? { total: 97, prompt: 61, completion: 36, numRequests: 1 }
            : { total: 50, prompt: 30, completion: 20, numRequests: 1 },
          ...(scenario.componentCached && { metadata: { cachedResponse: true } }),
        },
      });
      const scoringFunction: ScoringFunction = () => ({
        pass: true,
        score: 0.8,
        reason: 'Custom scoring result',
        tokensUsed: scenario.scorerCached
          ? { total: 37, prompt: 22, completion: 15, numRequests: 1 }
          : { total: 23, prompt: 15, completion: 8, numRequests: 1 },
        ...(scenario.scorerCached && { metadata: { cachedResponse: true } }),
      });

      const result = await assertionsResult.testResult(scoringFunction);
      const accounting = createEmptyTokenUsage();
      accumulateGradingTokenUsage(accounting, result.tokensUsed, {
        cached: result.metadata?.cachedResponse,
      });

      expect(accounting.assertions).toMatchObject(scenario.expectedLogical);
      if (scenario.expectedIncurred) {
        expect(accounting.incurredTokenUsage?.assertions).toMatchObject(scenario.expectedIncurred);
      } else {
        expect(accounting.incurredTokenUsage).toBeUndefined();
      }
      expect(result.metadata?.cachedResponse).toBe(
        scenario.componentCached && scenario.scorerCached ? true : undefined,
      );
    });

    it('does not double-count component usage returned unchanged by custom scoring', async () => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Component grading result',
          tokensUsed: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
        },
      });
      const scoringFunction: ScoringFunction = (_scores, context) => ({
        pass: true,
        score: 0.8,
        reason: 'Custom score without additional grading',
        tokensUsed: context?.tokensUsed,
      });

      expect((await assertionsResult.testResult(scoringFunction)).tokensUsed).toMatchObject({
        total: 50,
        prompt: 30,
        completion: 20,
        numRequests: 1,
      });
    });

    it.each([
      {
        label: 'a shallow copy',
        copy: (usage: NonNullable<GradingResult['tokensUsed']>) => ({ ...usage }),
      },
      {
        label: 'a serialized copy',
        copy: (usage: NonNullable<GradingResult['tokensUsed']>) =>
          JSON.parse(JSON.stringify(usage)) as NonNullable<GradingResult['tokensUsed']>,
      },
    ])('does not double-count $label of existing custom-scoring usage', async ({ copy }) => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Component grading result',
          tokensUsed: {
            total: 50,
            prompt: 30,
            completion: 20,
            numRequests: 1,
            completionDetails: { reasoning: 7 },
          },
        },
      });
      const scoringFunction: ScoringFunction = (_scores, context) => ({
        pass: true,
        score: 0.8,
        reason: 'Custom score without additional grading',
        ...(context?.tokensUsed && { tokensUsed: copy(context.tokensUsed) }),
      });

      expect((await assertionsResult.testResult(scoringFunction)).tokensUsed).toMatchObject({
        total: 50,
        prompt: 30,
        completion: 20,
        numRequests: 1,
        completionDetails: { reasoning: 7 },
      });
    });

    it('counts independently graded scoring usage even when token counts match components', async () => {
      const assertionsResult = new AssertionsResult({});
      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Component grading result',
          tokensUsed: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
        },
      });
      const scoringFunction: ScoringFunction = (_scores, context) => ({
        pass: true,
        score: 0.8,
        reason: 'Independent grading happened to use the same token counts',
        ...(context?.tokensUsed && { tokensUsed: { ...context.tokensUsed } }),
        metadata: { renderedGradingPrompt: 'Grade the component scores' },
      });

      expect((await assertionsResult.testResult(scoringFunction)).tokensUsed).toMatchObject({
        total: 100,
        prompt: 60,
        completion: 40,
        numRequests: 2,
      });
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

  describe('namedScores weight normalization', () => {
    it('should normalize a shared metric using assertion weights', async () => {
      const assertionsResult = new AssertionsResult({});

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'Critical signal passed',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        metric: 'accuracy',
        weight: 3,
      });

      assertionsResult.addResult({
        index: 1,
        result: {
          pass: false,
          score: 0,
          reason: 'Optional signal failed',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        metric: 'accuracy',
        weight: 1,
      });

      const result = await assertionsResult.testResult();

      // accuracy: (1 * 3 + 0 * 1) / (3 + 1) = 0.75
      expect(result.namedScores!['accuracy']).toBeCloseTo(0.75);
      expect(result.namedScoreWeights).toEqual({
        accuracy: 4,
      });
    });

    it('should apply different weights to named metrics and normalize correctly', async () => {
      const assertionsResult = new AssertionsResult({});

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 0.6,
          reason: 'Test 1',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        metric: 'relevance',
        weight: 3,
      });

      assertionsResult.addResult({
        index: 1,
        result: {
          pass: true,
          score: 0.9,
          reason: 'Test 2',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        metric: 'clarity',
        weight: 1,
      });

      const result = await assertionsResult.testResult();

      // relevance: (0.6 * 3) / 3 = 0.6
      expect(result.namedScores!['relevance']).toBeCloseTo(0.6);
      // clarity: (0.9 * 1) / 1 = 0.9
      expect(result.namedScores!['clarity']).toBeCloseTo(0.9);
      expect(result.namedScoreWeights).toEqual({
        relevance: 3,
        clarity: 1,
      });
    });

    it('should produce unchanged namedScores when weights are equal', async () => {
      const assertionsResult = new AssertionsResult({});

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 0.5,
          reason: 'Test 1',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        metric: 'accuracy',
        weight: 2,
      });

      assertionsResult.addResult({
        index: 1,
        result: {
          pass: true,
          score: 0.7,
          reason: 'Test 2',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        metric: 'accuracy',
        weight: 2,
      });

      const result = await assertionsResult.testResult();

      // accuracy: (0.5 * 2 + 0.7 * 2) / (2 + 2) = 2.4 / 4 = 0.6
      expect(result.namedScores!['accuracy']).toBeCloseTo(0.6);
      expect(result.namedScoreWeights).toEqual({
        accuracy: 4,
      });
    });

    it('should compute weighted averages for the same metric with unequal weights', async () => {
      const assertionsResult = new AssertionsResult({});

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 0.4,
          reason: 'Test 1',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        metric: 'accuracy',
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
        metric: 'accuracy',
        weight: 3,
      });

      const result = await assertionsResult.testResult();

      // accuracy: (0.4 * 1 + 0.8 * 3) / (1 + 3) = 0.7
      expect(result.namedScores!['accuracy']).toBeCloseTo(0.7);
      expect(result.namedScoreWeights).toEqual({
        accuracy: 4,
      });
    });

    it('should handle weight 0 for named metric correctly', async () => {
      const assertionsResult = new AssertionsResult({});

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 0.8,
          reason: 'Test 1',
          tokensUsed: DEFAULT_TOKENS_USED,
        },
        metric: 'safety',
        weight: 0,
      });

      const result = await assertionsResult.testResult();

      // weight 0: (0.8 * 0) / 0 → 0 (division guarded)
      expect(result.namedScores!['safety']).toBe(0);
      expect(result.namedScoreWeights).toEqual({
        safety: 0,
      });
    });

    it('should preserve nested namedScoreWeights when merging child named scores', async () => {
      const assertionsResult = new AssertionsResult({});

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: false,
          score: 0.75,
          reason: 'Nested assertion set partially failed',
          tokensUsed: DEFAULT_TOKENS_USED,
          namedScores: {
            accuracy: 0.75,
          },
          namedScoreWeights: {
            accuracy: 4,
          },
        },
      });

      const result = await assertionsResult.testResult();

      expect(result.namedScores!['accuracy']).toBeCloseTo(0.75);
      expect(result.namedScoreWeights).toEqual({
        accuracy: 4,
      });
    });

    it('should scale nested namedScoreWeights by parent assertion weight', async () => {
      const assertionsResult = new AssertionsResult({});

      assertionsResult.addResult({
        index: 0,
        result: {
          pass: true,
          score: 0.75,
          reason: 'Nested assertion set passed',
          tokensUsed: DEFAULT_TOKENS_USED,
          namedScores: {
            accuracy: 0.75,
          },
          namedScoreWeights: {
            accuracy: 4,
          },
        },
        weight: 2,
      });

      const result = await assertionsResult.testResult();

      expect(result.namedScores!['accuracy']).toBeCloseTo(0.75);
      expect(result.namedScoreWeights).toEqual({
        accuracy: 8,
      });
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
