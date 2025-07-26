import type { TokenUsage } from '../../src/types/shared';
import {
  createEmptyTokenUsage,
  accumulateTokenUsage,
  accumulateResponseTokenUsage,
  accumulateGraderTokenUsage,
} from '../../src/util/tokenUsageUtils';

describe('tokenUsageUtils', () => {
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

      expect(target.completionDetails).toEqual({
        reasoning: 5,
        acceptedPrediction: 3,
        rejectedPrediction: 2,
      });

      accumulateTokenUsage(target, {
        completionDetails: {
          reasoning: 10,
        },
      });

      expect(target.completionDetails).toEqual({
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
  });

  describe('accumulateGraderTokenUsage', () => {
    it('should accumulate token usage from grader result with tokensUsed', () => {
      const target = createEmptyTokenUsage();
      const graderResult = {
        tokensUsed: {
          total: 50,
          prompt: 30,
          completion: 20,
          numRequests: 1,
        },
      };

      accumulateGraderTokenUsage(target, graderResult);

      expect(target.total).toBe(50);
      expect(target.prompt).toBe(30);
      expect(target.completion).toBe(20);
      expect(target.numRequests).toBe(1);
    });

    it('should increment numRequests when grader result exists but has no tokensUsed', () => {
      const target = createEmptyTokenUsage();
      const graderResult = {};

      accumulateGraderTokenUsage(target, graderResult);

      expect(target.numRequests).toBe(1);
      expect(target.total).toBe(0);
    });

    it('should handle undefined grader result', () => {
      const target = createEmptyTokenUsage();

      accumulateGraderTokenUsage(target, undefined);

      expect(target.numRequests).toBe(0);
      expect(target.total).toBe(0);
    });
  });
});
