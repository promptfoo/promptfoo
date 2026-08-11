import { describe, expect, it } from 'vitest';
import {
  accumulateGenerationTokenUsage,
  accumulateGradingRequest,
  accumulateResponseTokenUsage,
  accumulateTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
  getErrorTokenUsage,
  normalizeTokenUsage,
  subtractGradingRequest,
  subtractResponseTokenUsage,
} from '../../src/util/tokenUsageUtils';

import type { TokenUsage } from '../../src/types/shared';

describe('tokenUsageUtils', () => {
  describe('getErrorTokenUsage', () => {
    it('returns validated usage carried by an error', () => {
      const error = Object.assign(new Error('failed'), {
        tokenUsage: { total: 9, prompt: 5, completion: 4, numRequests: 1 },
      });

      expect(getErrorTokenUsage(error)).toEqual({
        total: 9,
        prompt: 5,
        completion: 4,
        numRequests: 1,
      });
    });

    it('rejects malformed usage carried by an error', () => {
      expect(
        getErrorTokenUsage(Object.assign(new Error('failed'), { tokenUsage: 'invalid' })),
      ).toBeUndefined();
      expect(
        getErrorTokenUsage(Object.assign(new Error('failed'), { tokenUsage: null })),
      ).toBeUndefined();
    });
  });

  describe('createEmptyTokenUsage', () => {
    it('should create an empty token usage object with all fields initialized to zero', () => {
      const result = createEmptyTokenUsage();

      expect(result).toEqual({
        prompt: 0,
        completion: 0,
        cached: 0,
        total: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
        assertions: {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          numRequests: 0,
          completionDetails: {
            reasoning: 0,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
        },
      });
    });

    it('should return Required<TokenUsage> type', () => {
      const result = createEmptyTokenUsage();

      // This test checks that all optional fields are actually present
      expect(result.prompt).toBeDefined();
      expect(result.completion).toBeDefined();
      expect(result.cached).toBeDefined();
      expect(result.total).toBeDefined();
      expect(result.numRequests).toBeDefined();
      expect(result.completionDetails).toBeDefined();
      expect(result.assertions).toBeDefined();
    });
  });

  describe('accumulateTokenUsage', () => {
    it('should accumulate basic token fields', () => {
      const target: TokenUsage = createEmptyTokenUsage();
      const update = {
        prompt: 10,
        completion: 20,
        cached: 5,
        total: 30,
      };

      accumulateTokenUsage(target, update);

      expect(target.prompt).toBe(10);
      expect(target.completion).toBe(20);
      expect(target.cached).toBe(5);
      expect(target.total).toBe(30);
    });

    it('should handle undefined update gracefully', () => {
      const target: TokenUsage = createEmptyTokenUsage();
      const originalTarget = { ...target };

      accumulateTokenUsage(target, undefined);

      expect(target).toEqual(originalTarget);
    });

    it('should accumulate numRequests when provided', () => {
      const target: TokenUsage = createEmptyTokenUsage();

      accumulateTokenUsage(target, { numRequests: 3 });
      expect(target.numRequests).toBe(3);

      accumulateTokenUsage(target, { numRequests: 2 });
      expect(target.numRequests).toBe(5);
    });

    it('should increment numRequests by 1 when incrementRequests is true and numRequests not provided', () => {
      const target: TokenUsage = createEmptyTokenUsage();

      accumulateTokenUsage(target, { total: 10 }, true);
      expect(target.numRequests).toBe(1);

      accumulateTokenUsage(target, { total: 5 }, true);
      expect(target.numRequests).toBe(2);
    });

    it('should not increment numRequests when incrementRequests is false and numRequests not provided', () => {
      const target: TokenUsage = createEmptyTokenUsage();

      accumulateTokenUsage(target, { total: 10 }, false);
      expect(target.numRequests).toBe(0);

      accumulateTokenUsage(target, { total: 5 });
      expect(target.numRequests).toBe(0);
    });

    it('should accumulate completion details', () => {
      const target: TokenUsage = createEmptyTokenUsage();

      accumulateTokenUsage(target, {
        completionDetails: {
          reasoning: 5,
          acceptedPrediction: 3,
          rejectedPrediction: 2,
        },
      });

      expect(target.completionDetails).toMatchObject({
        reasoning: 5,
        acceptedPrediction: 3,
        rejectedPrediction: 2,
      });

      accumulateTokenUsage(target, {
        completionDetails: {
          reasoning: 10,
        },
      });

      expect(target.completionDetails).toMatchObject({
        reasoning: 15,
        acceptedPrediction: 3,
        rejectedPrediction: 2,
      });
    });

    it('should accumulate assertion tokens', () => {
      const target: TokenUsage = createEmptyTokenUsage();

      accumulateTokenUsage(target, {
        assertions: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 2,
        },
      });

      expect(target.assertions?.total).toBe(10);
      expect(target.assertions?.prompt).toBe(5);
      expect(target.assertions?.completion).toBe(5);
      expect(target.assertions?.cached).toBe(2);
    });

    it('should accumulate assertion completion details', () => {
      const target: TokenUsage = createEmptyTokenUsage();

      accumulateTokenUsage(target, {
        assertions: {
          completionDetails: {
            reasoning: 5,
            acceptedPrediction: 3,
          },
        },
      });

      expect(target.assertions?.completionDetails).toMatchObject({
        reasoning: 5,
        acceptedPrediction: 3,
      });
    });

    it('should handle missing fields with undefined or 0', () => {
      const target: TokenUsage = {
        total: 10,
        // Other fields undefined
      };

      accumulateTokenUsage(target, {
        prompt: 5,
        completion: 7,
      });

      expect(target.total).toBe(10);
      expect(target.prompt).toBe(5);
      expect(target.completion).toBe(7);
      expect(target.cached).toBe(0); // addNumbers converts undefined to 0
    });
  });

  describe('accumulateResponseTokenUsage', () => {
    it('should accumulate token usage from response with tokenUsage', () => {
      const target = createEmptyTokenUsage();
      const response = {
        tokenUsage: {
          total: 100,
          prompt: 60,
          completion: 40,
          numRequests: 1,
        },
      };

      accumulateResponseTokenUsage(target, response);

      expect(target.total).toBe(100);
      expect(target.prompt).toBe(60);
      expect(target.completion).toBe(40);
      expect(target.numRequests).toBe(1);
    });

    it('should increment numRequests when response exists but has no tokenUsage', () => {
      const target = createEmptyTokenUsage();
      const response = {};

      accumulateResponseTokenUsage(target, response);

      expect(target.numRequests).toBe(1);
      expect(target.total).toBe(0);
    });

    it('should handle undefined response', () => {
      const target = createEmptyTokenUsage();

      accumulateResponseTokenUsage(target, undefined);

      expect(target.numRequests).toBe(0);
      expect(target.total).toBe(0);
    });

    it('should accumulate multiple responses', () => {
      const target = createEmptyTokenUsage();

      accumulateResponseTokenUsage(target, {
        tokenUsage: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
      });
      accumulateResponseTokenUsage(target, {
        tokenUsage: { total: 30, prompt: 20, completion: 10, numRequests: 1 },
      });

      expect(target.total).toBe(80);
      expect(target.prompt).toBe(50);
      expect(target.completion).toBe(30);
      expect(target.numRequests).toBe(2);
    });

    it('should not increment numRequests when countAsRequest is false', () => {
      const target = createEmptyTokenUsage();

      accumulateResponseTokenUsage(
        target,
        {
          tokenUsage: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
        },
        { countAsRequest: false },
      );

      expect(target.total).toBe(50);
      expect(target.prompt).toBe(30);
      expect(target.completion).toBe(20);
      expect(target.numRequests).toBe(0);
    });

    it('should not increment numRequests from response-only entries when countAsRequest is false', () => {
      const target = createEmptyTokenUsage();

      accumulateResponseTokenUsage(target, {}, { countAsRequest: false });

      expect(target.total).toBe(0);
      expect(target.numRequests).toBe(0);
    });
  });

  describe('subtractResponseTokenUsage', () => {
    it('ignores non-numeric token deltas from imported rows', () => {
      const target: TokenUsage = {
        total: 10,
        prompt: 5,
        completion: 4,
        cached: 1,
        numRequests: 2,
      };

      subtractResponseTokenUsage(target, {
        tokenUsage: {
          total: 'bad',
          prompt: Number.NaN,
          completion: Infinity,
          cached: 1,
          numRequests: 'bad',
        } as any,
      });

      expect(target).toEqual({
        total: 10,
        prompt: 5,
        completion: 4,
        cached: 0,
        numRequests: 2,
      });
    });

    it('should not create completionDetails for legacy aggregates', () => {
      const target: TokenUsage = {
        total: 10,
        prompt: 5,
        completion: 5,
        cached: 0,
      };

      subtractResponseTokenUsage(target, {
        tokenUsage: {
          completionDetails: {
            reasoning: 3,
            cacheReadInputTokens: 2,
          },
        },
      });

      expect(target.completionDetails).toBeUndefined();
    });

    it('should not create negative missing buckets for legacy aggregates', () => {
      const target: TokenUsage = {
        total: 10,
      };

      subtractResponseTokenUsage(target, {
        tokenUsage: {
          total: 6,
          prompt: 3,
          completion: 2,
          cached: 1,
        },
      });

      expect(target).toEqual({ total: 4 });
      expect('prompt' in target).toBe(false);
      expect('completion' in target).toBe(false);
      expect('cached' in target).toBe(false);
    });

    it('clamps numRequests at zero when an under-credited aggregate is debited', () => {
      const target: TokenUsage = { total: 0, numRequests: 0 };

      subtractResponseTokenUsage(target, { tokenUsage: { total: 0 } });

      expect(target.numRequests).toBe(0);
    });

    it('clamps numRequests at zero when a request-only debit under-runs the aggregate', () => {
      const target: TokenUsage = { total: 0, numRequests: 0 };

      subtractResponseTokenUsage(target, {});

      expect(target.numRequests).toBe(0);
    });

    it('clamps numRequests at zero when an explicit numRequests debit under-runs the aggregate', () => {
      const target: TokenUsage = { total: 0, numRequests: 0 };

      subtractResponseTokenUsage(target, { tokenUsage: { numRequests: 1 } });

      expect(target.numRequests).toBe(0);
    });

    it('clamps nested assertion numRequests at zero when an under-credited aggregate is debited', () => {
      // Imported V4 rows accept response.tokenUsage as unknown, so a row can
      // carry a nested assertions.numRequests that the aggregate never
      // credited; the debit must not push the bucket negative.
      const target: TokenUsage = {
        total: 10,
        numRequests: 1,
        assertions: { total: 5, numRequests: 0 },
      };

      subtractResponseTokenUsage(target, {
        tokenUsage: { total: 4, assertions: { total: 2, numRequests: 1 } },
      });

      expect(target.assertions).toEqual({ total: 3, numRequests: 0 });
    });
  });

  describe('accumulateGenerationTokenUsage', () => {
    it('adds generation totals without inflating target request counts', () => {
      const target = createEmptyTokenUsage();
      target.numRequests = 2;

      expect(
        accumulateGenerationTokenUsage(target, {
          total: 15,
          prompt: 9,
          completion: 6,
          numRequests: 3,
          assertions: { total: 99, numRequests: 4 },
        }),
      ).toBe(true);

      expect(target).toMatchObject({
        total: 15,
        prompt: 9,
        completion: 6,
        numRequests: 2,
        assertions: { total: 0, numRequests: 0 },
      });
    });

    it('rejects malformed generation usage', () => {
      const target = createEmptyTokenUsage();

      expect(accumulateGenerationTokenUsage(target, 'invalid')).toBe(false);
      expect(accumulateGenerationTokenUsage(target, { numRequests: 3 })).toBe(false);
      expect(target.total).toBe(0);
    });
  });

  describe('accumulateGradingRequest', () => {
    it('counts the request without token usage when the grader reports none', () => {
      const assertions = createEmptyAssertions();
      accumulateGradingRequest(assertions, undefined);

      expect(assertions.numRequests).toBe(1);
      expect(assertions.total).toBe(0);
    });

    it('counts the request and folds in reported assertion token usage', () => {
      const assertions = createEmptyAssertions();
      accumulateGradingRequest(assertions, { total: 9, prompt: 5, completion: 4, numRequests: 3 });

      expect(assertions.numRequests).toBe(1);
      expect(assertions.total).toBe(9);
      expect(assertions.prompt).toBe(5);
      expect(assertions.completion).toBe(4);
    });
  });

  describe('subtractGradingRequest', () => {
    it('is the inverse of accumulateGradingRequest for graded rows with tokens', () => {
      const assertions = createEmptyAssertions();
      accumulateGradingRequest(assertions, { total: 9, prompt: 5, completion: 4 });
      subtractGradingRequest(assertions, { total: 9, prompt: 5, completion: 4 });

      expect(assertions).toEqual(createEmptyAssertions());
    });

    it('debits numRequests even when the graded row reported no tokens', () => {
      const assertions = createEmptyAssertions();
      accumulateGradingRequest(assertions, undefined);
      accumulateGradingRequest(assertions, undefined);
      subtractGradingRequest(assertions, undefined);

      expect(assertions.numRequests).toBe(1);
    });

    it('leaves numRequests untouched when the aggregate never tracked it', () => {
      const assertions = createEmptyAssertions();
      delete (assertions as { numRequests?: number }).numRequests;
      subtractGradingRequest(assertions, { total: 3 });

      expect(assertions.numRequests).toBeUndefined();
    });

    it('clamps numRequests at zero to avoid negatives from under-credited aggregates', () => {
      const assertions = createEmptyAssertions();
      subtractGradingRequest(assertions, undefined);

      expect(assertions.numRequests).toBe(0);
    });
  });

  describe('normalizeTokenUsage', () => {
    it('should return fully populated TokenUsage with defaults for undefined input', () => {
      const result = normalizeTokenUsage(undefined);

      expect(result).toEqual({
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
        assertions: {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          numRequests: 0,
          completionDetails: {
            reasoning: 0,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
        },
      });
    });

    it('should preserve provided values', () => {
      const result = normalizeTokenUsage({
        total: 100,
        prompt: 60,
        completion: 40,
      });

      expect(result.total).toBe(100);
      expect(result.prompt).toBe(60);
      expect(result.completion).toBe(40);
    });

    it('should fill in missing fields with defaults', () => {
      const result = normalizeTokenUsage({
        total: 50,
      });

      expect(result.total).toBe(50);
      expect(result.prompt).toBe(0);
      expect(result.completion).toBe(0);
      expect(result.cached).toBe(0);
      expect(result.numRequests).toBe(0);
    });

    it('should preserve completionDetails if provided', () => {
      const result = normalizeTokenUsage({
        completionDetails: {
          reasoning: 10,
          acceptedPrediction: 5,
          rejectedPrediction: 2,
        },
      });

      expect(result.completionDetails).toEqual({
        reasoning: 10,
        acceptedPrediction: 5,
        rejectedPrediction: 2,
      });
    });

    it('should preserve assertions if provided', () => {
      const result = normalizeTokenUsage({
        assertions: {
          total: 20,
          prompt: 10,
          completion: 10,
        },
      });

      expect(result.assertions.total).toBe(20);
      expect(result.assertions.prompt).toBe(10);
      expect(result.assertions.completion).toBe(10);
    });

    it('should handle empty object', () => {
      const result = normalizeTokenUsage({});

      expect(result.total).toBe(0);
      expect(result.prompt).toBe(0);
      expect(result.completion).toBe(0);
    });

    it('should handle partial completionDetails', () => {
      const result = normalizeTokenUsage({
        completionDetails: {
          reasoning: 5,
        },
      });

      expect(result.completionDetails.reasoning).toBe(5);
      // Other fields may be undefined or 0 depending on source
    });

    it('should return Required<TokenUsage> type', () => {
      const result = normalizeTokenUsage({ total: 10 });

      // TypeScript compile-time check: all fields should be non-optional
      expect(result.total).toBeDefined();
      expect(result.prompt).toBeDefined();
      expect(result.completion).toBeDefined();
      expect(result.cached).toBeDefined();
      expect(result.numRequests).toBeDefined();
      expect(result.completionDetails).toBeDefined();
      expect(result.assertions).toBeDefined();
    });
  });
});
