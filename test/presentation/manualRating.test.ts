import { describe, expect, it } from 'vitest';
import { applyManualRating, applySubmittedGrade } from '../../src/presentation/manualRating';
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

  it('keeps repeated clears from regrading a threshold-based result', () => {
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
        reason: 'Accepted by threshold',
      },
    };
    expect(applyManualRating(original, { action: 'clear' })).toEqual(original);
  });

  it('distinguishes an old full-grade override and clear from a replacement grade', () => {
    const human = { ...graderError.gradingResult, assertion: { type: 'human' as const } };
    const manual = applySubmittedGrade(graderError, human);
    expect(manual).toMatchObject({ failureReason: ResultFailureReason.ASSERT, error: null });
    expect(manual.gradingResult).toEqual(human);
    expect(applySubmittedGrade(manual, graderError.gradingResult)).toEqual(graderError);

    const replacement = { pass: false, score: 0.35, reason: 'Rejected by custom threshold' };
    expect(applySubmittedGrade(graderError, replacement)).toEqual({
      pass: replacement.pass,
      score: replacement.score,
      failureReason: ResultFailureReason.ASSERT,
      error: replacement.reason,
      gradingResult: replacement,
    });
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

  it('keeps the current verdict when clearing a legacy rating without a snapshot or automated grades', () => {
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
      pass: false,
      score: 0,
      failureReason: ResultFailureReason.ASSERT,
    });
  });
});
