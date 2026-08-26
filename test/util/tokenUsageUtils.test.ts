import { describe, expect, it } from 'vitest';
import {
  accumulateAssertionTokenUsage,
  accumulateAttackerTokenUsage,
  accumulateGenerationTokenUsage,
  accumulateGradingRequest,
  accumulateGradingResponseTokenUsage,
  accumulateResponseTokenUsage,
  accumulateTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
  getErrorTokenUsage,
  normalizeTokenUsage,
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

    it('derives omitted totals for target, attacker, grading, and generation buckets', () => {
      const target = createEmptyTokenUsage();

      accumulateTokenUsage(target, {
        prompt: 60,
        completion: 40,
        numRequests: 2,
        attacker: { prompt: 30, completion: 20, numRequests: 3 },
        assertions: { prompt: 15, completion: 10, numRequests: 1 },
        generation: { prompt: 25, completion: 15, numRequests: 4 },
      });

      expect(target).toMatchObject({
        total: 100,
        attacker: { total: 50 },
        assertions: { total: 25 },
        generation: { total: 40 },
      });
    });

    it('preserves explicit zero totals and does not recharge cached-only usage', () => {
      const target = createEmptyTokenUsage();

      accumulateTokenUsage(target, {
        total: 0,
        prompt: 30,
        completion: 20,
        cached: 50,
        numRequests: 0,
        assertions: { prompt: 10, completion: 5, cached: 15, numRequests: 0 },
        attacker: { total: 0, prompt: 7, completion: 3, cached: 10, numRequests: 0 },
      });

      expect(target.total).toBe(0);
      expect(target.assertions?.total).toBe(0);
      expect(target.attacker?.total).toBe(0);
    });

    it('derives fresh usage when provider-side prompt caching covers only part of a request', () => {
      const target = createEmptyTokenUsage();

      accumulateTokenUsage(target, { prompt: 30, completion: 20, cached: 15, numRequests: 0 });

      expect(target).toMatchObject({ total: 50, cached: 15, numRequests: 0 });
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

      expect(target.total).toBe(22);
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

    it('retains the logical footprint of a cached target without incurring another request', () => {
      const target = createEmptyTokenUsage();

      accumulateResponseTokenUsage(target, {
        cached: true,
        tokenUsage: {
          total: 100,
          prompt: 60,
          completion: 40,
          cached: 10,
          numRequests: 1,
          completionDetails: { reasoning: 12 },
        },
      });

      expect(target).toMatchObject({
        total: 100,
        prompt: 60,
        completion: 40,
        cached: 100,
        numRequests: 1,
        completionDetails: { reasoning: 12 },
        incurredTokenUsage: { total: 0, prompt: 0, completion: 0, numRequests: 0 },
      });
    });

    it('preserves independently incurred attacker usage when the target response is cached', () => {
      const target = createEmptyTokenUsage();

      accumulateResponseTokenUsage(target, {
        cached: true,
        tokenUsage: {
          total: 100,
          prompt: 60,
          completion: 40,
          numRequests: 1,
          attacker: {
            total: 28,
            prompt: 20,
            completion: 8,
            numRequests: 1,
            completionDetails: { reasoning: 3 },
          },
        },
      });

      expect(target).toMatchObject({
        total: 100,
        prompt: 60,
        completion: 40,
        cached: 100,
        numRequests: 1,
        attacker: {
          total: 28,
          prompt: 20,
          completion: 8,
          numRequests: 1,
          completionDetails: { reasoning: 3 },
        },
        incurredTokenUsage: {
          total: 0,
          numRequests: 0,
          attacker: { total: 28, numRequests: 1 },
        },
      });
    });

    it('counts a cached target turn as one probe when fresh grading still runs', () => {
      const target = createEmptyTokenUsage();

      accumulateResponseTokenUsage(
        target,
        {
          cached: true,
          tokenUsage: { prompt: 60, completion: 40, numRequests: 1 },
        },
        { countCachedAsRequest: true },
      );

      expect(target).toMatchObject({
        total: 100,
        prompt: 60,
        completion: 40,
        cached: 100,
        numRequests: 1,
        incurredTokenUsage: { total: 0, numRequests: 0 },
      });
    });

    it('counts a cached response without usage as a logical turn but not an incurred request', () => {
      const target = createEmptyTokenUsage();

      accumulateResponseTokenUsage(target, { cached: true });

      expect(target).toMatchObject({
        total: 0,
        cached: 0,
        numRequests: 1,
        incurredTokenUsage: { total: 0, numRequests: 0 },
      });
    });

    it('keeps provider-side prompt cache hits in incurred usage because a model call still ran', () => {
      const target = createEmptyTokenUsage();

      accumulateResponseTokenUsage(target, {
        tokenUsage: { total: 100, prompt: 60, completion: 40, cached: 45, numRequests: 1 },
      });

      expect(target).toMatchObject({
        total: 100,
        cached: 45,
        numRequests: 1,
      });
      expect(target.incurredTokenUsage ?? target).toMatchObject({
        total: 100,
        cached: 45,
        numRequests: 1,
      });
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

  describe('accumulateAttackerTokenUsage', () => {
    it('keeps attacker tokens and requests separate from target usage', () => {
      const target = createEmptyTokenUsage();
      accumulateResponseTokenUsage(target, {
        tokenUsage: { total: 30, prompt: 20, completion: 10, numRequests: 2 },
      });
      accumulateAttackerTokenUsage(target, {
        tokenUsage: { total: 12, prompt: 8, completion: 4, numRequests: 1 },
      });
      accumulateAttackerTokenUsage(target, { tokenUsage: { total: 7, prompt: 5, completion: 2 } });

      expect(target).toMatchObject({
        total: 30,
        numRequests: 2,
        attacker: { total: 19, prompt: 13, completion: 6, numRequests: 2 },
      });
    });

    it('preserves attacker usage when aggregating results', () => {
      const target = createEmptyTokenUsage();
      accumulateTokenUsage(target, {
        total: 10,
        attacker: { total: 20, prompt: 15, completion: 5, numRequests: 2 },
      });
      expect(target).toMatchObject({
        total: 10,
        attacker: { total: 20, prompt: 15, completion: 5, numRequests: 2 },
      });
    });

    it('keeps cached attacker usage in the logical footprint but excludes it from incurred usage', () => {
      const target = createEmptyTokenUsage();

      accumulateAttackerTokenUsage(target, {
        cached: true,
        tokenUsage: { total: 32, prompt: 20, completion: 12, numRequests: 1 },
      });

      expect(target).toMatchObject({
        numRequests: 0,
        attacker: { total: 32, prompt: 20, completion: 12, numRequests: 1 },
        incurredTokenUsage: { attacker: { total: 0, numRequests: 0 } },
      });
    });

    it('discards historical incurred attacker and grading usage without losing fresh target work', () => {
      const target = createEmptyTokenUsage();
      accumulateResponseTokenUsage(target, {
        tokenUsage: { total: 21, prompt: 14, completion: 7 },
      });

      accumulateAttackerTokenUsage(target, {
        cached: true,
        tokenUsage: {
          total: 10,
          prompt: 7,
          completion: 3,
          numRequests: 1,
          assertions: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
          incurredTokenUsage: {
            total: 10,
            prompt: 7,
            completion: 3,
            numRequests: 1,
            assertions: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
          },
        },
      });

      expect(target).toMatchObject({
        total: 21,
        prompt: 14,
        completion: 7,
        numRequests: 1,
        attacker: { total: 10, prompt: 7, completion: 3, numRequests: 1 },
        assertions: { total: 5, prompt: 3, completion: 2, numRequests: 1 },
        incurredTokenUsage: {
          total: 21,
          prompt: 14,
          completion: 7,
          numRequests: 1,
          attacker: { total: 0, numRequests: 0 },
          assertions: { total: 0, numRequests: 0 },
        },
      });
    });

    it('preserves explicit incurred attacker and grading usage for fresh composite responses', () => {
      const target = createEmptyTokenUsage();

      accumulateAttackerTokenUsage(target, {
        tokenUsage: {
          total: 10,
          numRequests: 2,
          assertions: { total: 5, numRequests: 2 },
          incurredTokenUsage: {
            total: 6,
            numRequests: 1,
            assertions: { total: 2, numRequests: 1 },
          },
        },
      });

      expect(target).toMatchObject({
        attacker: { total: 10, numRequests: 2 },
        assertions: { total: 5, numRequests: 2 },
        incurredTokenUsage: {
          attacker: { total: 6, numRequests: 1 },
          assertions: { total: 2, numRequests: 1 },
        },
      });
    });

    it('requires explicit cache provenance for normalized attacker usage', () => {
      const target = createEmptyTokenUsage();

      accumulateAttackerTokenUsage(target, {
        tokenUsage: { total: 32, prompt: 32, completion: 0, cached: 32, numRequests: 0 },
      });

      expect(target).toMatchObject({
        numRequests: 0,
        attacker: { total: 32, prompt: 32, cached: 32, numRequests: 0 },
      });
      expect(target).not.toHaveProperty('incurredTokenUsage');
    });

    it('keeps fully prompt-cached attacker usage incurred when tracking actual work', () => {
      const target = createEmptyTokenUsage();
      target.incurredTokenUsage = createEmptyTokenUsage();

      accumulateAttackerTokenUsage(target, {
        tokenUsage: { total: 32, prompt: 32, completion: 0, cached: 32, numRequests: 0 },
      });

      expect(target).toMatchObject({
        attacker: { total: 32, prompt: 32, cached: 32 },
        incurredTokenUsage: { attacker: { total: 32, prompt: 32, cached: 32 } },
      });
    });

    it('does not mistake provider-side prompt caching for a cached attacker response', () => {
      const target = createEmptyTokenUsage();

      accumulateAttackerTokenUsage(target, {
        tokenUsage: { total: 32, prompt: 20, completion: 12, cached: 15, numRequests: 1 },
      });

      expect(target).toMatchObject({
        attacker: { total: 32, prompt: 20, completion: 12, cached: 15, numRequests: 1 },
      });
      expect(target).not.toHaveProperty('incurredTokenUsage');
    });

    it('does not infer an attacker cache replay when the response is explicitly fresh', () => {
      const target = createEmptyTokenUsage();

      accumulateAttackerTokenUsage(target, {
        cached: false,
        tokenUsage: { total: 0, cached: 32, numRequests: 0 },
      });

      expect(target).toMatchObject({ attacker: { total: 0, cached: 32, numRequests: 0 } });
      expect(target).not.toHaveProperty('incurredTokenUsage');
    });

    it('routes grading-model work nested in an attack task into the grading bucket', () => {
      const target = createEmptyTokenUsage();

      accumulateAttackerTokenUsage(target, {
        tokenUsage: {
          total: 100,
          prompt: 60,
          completion: 40,
          numRequests: 1,
          assertions: {
            total: 25,
            prompt: 18,
            completion: 7,
            numRequests: 0,
            completionDetails: { reasoning: 4 },
          },
        },
      });

      expect(target).toMatchObject({
        total: 0,
        numRequests: 0,
        attacker: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
        assertions: {
          total: 25,
          prompt: 18,
          completion: 7,
          numRequests: 0,
          completionDetails: { reasoning: 4 },
        },
      });
      expect(target.attacker).not.toHaveProperty('assertions');
    });
  });

  describe('accumulateGradingResponseTokenUsage', () => {
    it('counts grading tasks once even when a task reports multiple model calls', () => {
      const target = createEmptyTokenUsage();
      accumulateResponseTokenUsage(target, {
        tokenUsage: { total: 30, prompt: 20, completion: 10, numRequests: 2 },
      });
      accumulateGradingResponseTokenUsage(target, {
        tokenUsage: {
          total: 12,
          prompt: 8,
          completion: 4,
          numRequests: 2,
          completionDetails: { reasoning: 3 },
        },
      });
      accumulateGradingResponseTokenUsage(target, { tokenUsage: { total: 7, prompt: 5 } });
      accumulateGradingResponseTokenUsage(target, {});

      expect(target).toMatchObject({
        total: 30,
        numRequests: 2,
        assertions: {
          total: 19,
          prompt: 13,
          completion: 4,
          numRequests: 3,
          completionDetails: { reasoning: 3 },
        },
      });
    });

    it('does not count fully cached strategy grading responses as new requests', () => {
      const target = createEmptyTokenUsage();

      accumulateGradingResponseTokenUsage(target, {
        tokenUsage: { total: 40, cached: 40, numRequests: 0 },
      });

      expect(target).toMatchObject({
        assertions: { total: 40, cached: 40, numRequests: 1 },
        incurredTokenUsage: { assertions: { total: 0, numRequests: 0 } },
      });
    });

    it('does not count explicitly cached strategy responses with missing usage', () => {
      const target = createEmptyTokenUsage();

      accumulateGradingResponseTokenUsage(target, { cached: true });

      expect(target).toMatchObject({
        assertions: { total: 0, numRequests: 1 },
        incurredTokenUsage: { assertions: { total: 0, numRequests: 0 } },
      });
    });

    it('counts fresh strategy grading tasks normalized to zero requests', () => {
      const target = createEmptyTokenUsage();

      accumulateGradingResponseTokenUsage(target, {
        tokenUsage: { total: 25, cached: 10, numRequests: 0 },
      });

      expect(target.assertions).toMatchObject({ total: 25, cached: 10, numRequests: 1 });
    });
  });

  describe('accumulateGenerationTokenUsage', () => {
    it('keeps generation usage separate from target tokens and request counts', () => {
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
        total: 0,
        prompt: 0,
        completion: 0,
        numRequests: 2,
        assertions: { total: 0, numRequests: 0 },
        generation: { total: 15, prompt: 9, completion: 6, numRequests: 3 },
      });
    });

    it('rejects malformed generation usage', () => {
      const target = createEmptyTokenUsage();

      expect(accumulateGenerationTokenUsage(target, 'invalid')).toBe(false);
      expect(accumulateGenerationTokenUsage(target, {})).toBe(false);
      expect(target.total).toBe(0);
    });

    it('preserves generation request counts when a provider reports no token totals', () => {
      const target = createEmptyTokenUsage();

      expect(accumulateGenerationTokenUsage(target, { numRequests: 3 })).toBe(true);
      expect(target.generation).toMatchObject({ total: 0, numRequests: 3 });
      expect(target.numRequests).toBe(0);
    });

    it('preserves logical and incurred cached generation as separate scan buckets', () => {
      const target = createEmptyTokenUsage();
      target.total = 10;
      target.numRequests = 1;

      expect(
        accumulateGenerationTokenUsage(target, {
          total: 30,
          prompt: 20,
          completion: 10,
          cached: 30,
          numRequests: 1,
          incurredTokenUsage: { total: 0, numRequests: 0 },
        }),
      ).toBe(true);

      expect(target).toMatchObject({
        total: 10,
        numRequests: 1,
        generation: { total: 30, cached: 30, numRequests: 1 },
        incurredTokenUsage: {
          total: 10,
          numRequests: 1,
          generation: { total: 0, numRequests: 0 },
        },
      });
    });
  });

  describe('accumulateGradingRequest', () => {
    it('counts the request without token usage when the grader reports none', () => {
      const assertions = createEmptyAssertions();
      accumulateGradingRequest(assertions, undefined);

      expect(assertions.numRequests).toBe(1);
      expect(assertions.total).toBe(0);
    });

    it('preserves every request represented by cumulative assertion token usage', () => {
      const assertions = createEmptyAssertions();
      accumulateGradingRequest(assertions, { total: 9, prompt: 5, completion: 4, numRequests: 3 });

      expect(assertions.numRequests).toBe(3);
      expect(assertions.total).toBe(9);
      expect(assertions.prompt).toBe(5);
      expect(assertions.completion).toBe(4);
    });

    it('counts legacy grading usage without an explicit request count once', () => {
      const assertions = createEmptyAssertions();

      accumulateGradingRequest(assertions, { total: 9, prompt: 5, completion: 4 });

      expect(assertions).toMatchObject({ total: 9, numRequests: 1 });
    });

    it('counts fresh matcher usage when normalization replaced its missing request count with zero', () => {
      const assertions = createEmptyAssertions();

      accumulateGradingRequest(assertions, {
        total: 9,
        prompt: 5,
        completion: 4,
        cached: 0,
        numRequests: 0,
      });

      expect(assertions).toMatchObject({ total: 9, numRequests: 1 });
    });

    it('counts fresh grading tasks when the provider reports no tokens or request count', () => {
      const assertions = createEmptyAssertions();

      accumulateGradingRequest(
        assertions,
        {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          numRequests: 0,
        },
        { fresh: true },
      );

      expect(assertions).toMatchObject({ total: 0, cached: 0, numRequests: 1 });
    });

    it('does not count cached grading responses when no token usage was reported', () => {
      const assertions = createEmptyAssertions();

      accumulateGradingRequest(
        assertions,
        { total: 0, cached: 0, numRequests: 0 },
        { cached: true },
      );

      expect(assertions).toMatchObject({ total: 0, cached: 0, numRequests: 0 });
    });

    it('does not count cached grading responses without a usage object', () => {
      const assertions = createEmptyAssertions();

      accumulateGradingRequest(assertions, undefined, { cached: true });

      expect(assertions).toMatchObject({ total: 0, numRequests: 0 });
    });

    it('does not create grading requests for deterministic assertion usage', () => {
      const assertions = createEmptyAssertions();

      accumulateGradingRequest(
        assertions,
        { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
        { cached: false },
      );

      expect(assertions).toMatchObject({ total: 0, cached: 0, numRequests: 0 });
    });

    it('counts fresh grading beside a larger avoided cached-token total', () => {
      const assertions = createEmptyAssertions();

      accumulateGradingRequest(
        assertions,
        { total: 50, prompt: 30, completion: 20, cached: 97, numRequests: 0 },
        { cached: false },
      );

      expect(assertions).toMatchObject({ total: 50, cached: 97, numRequests: 1 });
    });

    it('counts partially cached grading usage as one fresh request', () => {
      const assertions = createEmptyAssertions();

      accumulateGradingRequest(assertions, { total: 9, cached: 3, numRequests: 0 });

      expect(assertions).toMatchObject({ total: 9, cached: 3, numRequests: 1 });
    });

    it('preserves an explicit zero request count from cached grading usage', () => {
      const assertions = createEmptyAssertions();

      accumulateGradingRequest(assertions, { total: 9, cached: 9, numRequests: 0 });

      expect(assertions).toMatchObject({ total: 9, cached: 9, numRequests: 0 });
    });
  });

  describe('accumulateAssertionTokenUsage', () => {
    it('preserves cumulative grader requests and reasoning details', () => {
      const assertions = createEmptyAssertions();

      accumulateAssertionTokenUsage(assertions, {
        total: 30,
        prompt: 20,
        completion: 10,
        numRequests: 3,
        completionDetails: { reasoning: 7, cacheCreationInputTokens: 11 },
      });

      expect(assertions).toMatchObject({
        total: 30,
        prompt: 20,
        completion: 10,
        numRequests: 3,
        completionDetails: { reasoning: 7, cacheCreationInputTokens: 11 },
      });
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

    it('preserves attacker tokens, internal request counts, and completion details', () => {
      const attacker = {
        total: 90,
        prompt: 55,
        completion: 35,
        cached: 7,
        numRequests: 4,
        completionDetails: { reasoning: 12 },
      };

      const result = normalizeTokenUsage({ total: 25, numRequests: 1, attacker });

      expect(result.total).toBe(25);
      expect(result.numRequests).toBe(1);
      expect(result.attacker).toEqual(attacker);
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
