import type { GradingResult } from '../../src/types';
import { getHumanRating } from '../../src/util/humanRatingHelpers';

describe('humanRatingHelpers', () => {
  describe('getHumanRating', () => {
    it('should return null for null or undefined input', () => {
      expect(getHumanRating(null)).toBeNull();
      expect(getHumanRating(undefined)).toBeNull();
    });

    it('should return null when no componentResults', () => {
      const gradingResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test',
      };
      expect(getHumanRating(gradingResult)).toBeNull();
    });

    it('should return null when componentResults is not an array', () => {
      const gradingResult = {
        pass: true,
        score: 1,
        reason: 'Test',
        componentResults: 'not an array' as any,
      };
      expect(getHumanRating(gradingResult)).toBeNull();
    });

    it('should return null when no human ratings found', () => {
      const gradingResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test',
        componentResults: [
          { pass: true, score: 1, reason: 'Test', assertion: { type: 'equals' } },
          { pass: false, score: 0, reason: 'Test', assertion: { type: 'contains' } },
        ],
      };
      expect(getHumanRating(gradingResult)).toBeNull();
    });

    it('should return the human rating when found', () => {
      const humanRating = {
        pass: true,
        score: 1,
        reason: 'Manual',
        assertion: { type: 'human' as const },
      };
      const gradingResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test',
        componentResults: [
          { pass: true, score: 1, reason: 'Test', assertion: { type: 'equals' } },
          humanRating,
        ],
      };
      expect(getHumanRating(gradingResult)).toBe(humanRating);
    });

    it('should return the last human rating when multiple found', () => {
      const firstHumanRating = {
        pass: false,
        score: 0,
        reason: 'First',
        assertion: { type: 'human' as const },
      };
      const lastHumanRating = {
        pass: true,
        score: 1,
        reason: 'Last',
        assertion: { type: 'human' as const },
      };
      const gradingResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test',
        componentResults: [
          firstHumanRating,
          { pass: true, score: 1, reason: 'Test', assertion: { type: 'equals' } },
          lastHumanRating,
        ],
      };

      expect(getHumanRating(gradingResult)).toBe(lastHumanRating);
    });

    it('should handle malformed component results', () => {
      const gradingResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test',
        componentResults: [
          null as any,
          undefined as any,
          { pass: true, score: 1, reason: 'Test' },
          { pass: true, score: 1, reason: 'Human', assertion: { type: 'human' as const } },
        ],
      };
      const humanRating = gradingResult.componentResults?.[3];
      expect(getHumanRating(gradingResult)).toBe(humanRating);
    });
  });
});
