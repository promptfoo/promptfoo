import { describe, expect, it } from 'vitest';
import { applyManualRating } from '../../src/presentation/manualRating';
import { ResultFailureReason } from '../../src/types/results';

const graderError = {
  pass: false,
  score: 0.35,
  failureReason: ResultFailureReason.ERROR,
  error: 'Grader unavailable',
  gradingResult: {
    pass: false,
    score: 0.35,
    reason: 'Grader unavailable',
    metadata: { graderError: true as const },
    componentResults: [
      { pass: true, score: 0.7, reason: 'Valid grade' },
      {
        pass: false,
        score: 0,
        reason: 'Grader unavailable',
        metadata: { graderError: true as const },
      },
    ],
  },
};

describe('manual ratings', () => {
  it('restores a threshold or custom-scored pass despite a failed component', () => {
    const original = {
      ...graderError,
      pass: true,
      score: 0.91,
      error: null,
      failureReason: ResultFailureReason.NONE,
      gradingResult: {
        ...graderError.gradingResult,
        pass: true,
        score: 0.91,
        reason: 'Custom score accepted',
        metadata: {},
      },
    };
    const rated = applyManualRating(original, { action: 'rate', pass: false });
    expect(applyManualRating(rated, { action: 'clear' })).toEqual(original);
  });

  it('restores score one for an originally ungraded result', () => {
    const original = { pass: true, score: 1, failureReason: ResultFailureReason.NONE };
    const rated = applyManualRating(original, { action: 'rate', pass: false });
    expect(applyManualRating(rated, { action: 'clear' })).toMatchObject({
      pass: true,
      score: 1,
      failureReason: ResultFailureReason.NONE,
    });
  });

  it('restores a legacy grader error from its automated components', () => {
    const approved = {
      ...graderError,
      pass: true,
      score: 1,
      failureReason: ResultFailureReason.NONE,
      error: null,
      gradingResult: {
        ...graderError.gradingResult,
        pass: true,
        score: 1,
        reason: 'Manual result',
        componentResults: [
          ...graderError.gradingResult.componentResults,
          { pass: true, score: 1, reason: 'Manual result', assertion: { type: 'human' as const } },
        ],
      },
    };
    expect(applyManualRating(approved, { action: 'clear' })).toEqual(graderError);
  });

  it('clears legacy ratings that have no saved snapshot', () => {
    const original = {
      pass: false,
      score: 0,
      failureReason: ResultFailureReason.ASSERT,
      gradingResult: {
        pass: false,
        score: 0,
        reason: 'Manual result',
        componentResults: [
          { pass: false, score: 0, reason: 'Manual result', assertion: { type: 'human' as const } },
        ],
      },
    };
    expect(applyManualRating(original, { action: 'clear' })).toMatchObject({
      pass: true,
      score: 1,
      failureReason: ResultFailureReason.NONE,
    });
  });
});
