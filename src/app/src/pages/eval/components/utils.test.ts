import { HUMAN_ASSERTION_TYPE } from '@promptfoo/providers/constants';
import { describe, expect, it } from 'vitest';
import { getHumanRating, hasHumanRating } from './utils';
import type { EvaluateTableOutput } from '@promptfoo/types';

// Helper to create a base output object with all required properties
const createBaseOutput = (): EvaluateTableOutput => ({
  id: 'test-id',
  text: 'test output',
  prompt: 'test prompt',
  pass: true,
  score: 1,
  cost: 0,
  failureReason: 0,
  latencyMs: 0,
  namedScores: {},
  testCase: {},
});

describe('hasHumanRating', () => {
  it('should return true when output has human rating in componentResults', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Manual rating',
            assertion: { type: HUMAN_ASSERTION_TYPE },
          },
        ],
      },
    };

    expect(hasHumanRating(output)).toBe(true);
  });

  it('should return false when output has no human rating in componentResults', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Automated check',
            assertion: { type: 'javascript' },
          },
        ],
      },
    };

    expect(hasHumanRating(output)).toBe(false);
  });

  it('should return false when output is null', () => {
    expect(hasHumanRating(null)).toBe(false);
  });

  it('should return false when output is undefined', () => {
    expect(hasHumanRating(undefined)).toBe(false);
  });

  it('should return false when gradingResult is missing', () => {
    const output = createBaseOutput();
    expect(hasHumanRating(output)).toBe(false);
  });

  it('should return false when componentResults is missing', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
      },
    };

    expect(hasHumanRating(output)).toBe(false);
  });

  it('should return false when componentResults is empty', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [],
      },
    };

    expect(hasHumanRating(output)).toBe(false);
  });

  it('should handle componentResults with null or undefined assertion properties', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'No assertion',
            assertion: null as any,
          },
          {
            pass: false,
            score: 0,
            reason: 'Undefined assertion',
          } as any,
        ],
      },
    };

    expect(hasHumanRating(output)).toBe(false);
  });

  it('should find human rating among multiple componentResults', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Automated check',
            assertion: { type: 'javascript' },
          },
          {
            pass: true,
            score: 1,
            reason: 'Manual rating',
            assertion: { type: HUMAN_ASSERTION_TYPE },
          },
          {
            pass: true,
            score: 1,
            reason: 'Another check',
            assertion: { type: 'python' },
          },
        ],
      },
    };

    expect(hasHumanRating(output)).toBe(true);
  });
});

describe('getHumanRating', () => {
  it('should return human rating componentResult when present', () => {
    const humanResult = {
      pass: true,
      score: 0.9,
      reason: 'Manual rating',
      assertion: { type: HUMAN_ASSERTION_TYPE },
    };

    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [humanResult],
      },
    };

    expect(getHumanRating(output)).toEqual(humanResult);
  });

  it('should return undefined when no human rating exists', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Automated check',
            assertion: { type: 'javascript' },
          },
        ],
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should return undefined when output is null', () => {
    expect(getHumanRating(null)).toBeUndefined();
  });

  it('should return undefined when output is undefined', () => {
    expect(getHumanRating(undefined)).toBeUndefined();
  });

  it('should return undefined when gradingResult is missing', () => {
    const output = createBaseOutput();
    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should return undefined when componentResults is missing', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should return undefined when componentResults is empty', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [],
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should handle componentResults without assertion property', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'No assertion',
          } as any,
        ],
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should return first human rating when multiple exist', () => {
    const firstHumanResult = {
      pass: true,
      score: 0.8,
      reason: 'First manual rating',
      assertion: { type: HUMAN_ASSERTION_TYPE },
    };

    const secondHumanResult = {
      pass: false,
      score: 0.3,
      reason: 'Second manual rating',
      assertion: { type: HUMAN_ASSERTION_TYPE },
    };

    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Automated',
            assertion: { type: 'javascript' },
          },
          firstHumanResult,
          secondHumanResult,
        ],
      },
    };

    expect(getHumanRating(output)).toEqual(firstHumanResult);
  });

  it('should handle componentResults with null elements', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [null as any, undefined as any],
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });
});
