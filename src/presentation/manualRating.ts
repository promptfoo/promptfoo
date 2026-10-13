import { HUMAN_ASSERTION_TYPE } from '../providers/constants';
import { ResultFailureReason } from '../types/results';

import type { GradingResult, PromptMetrics } from '../types/index';

interface RatingState {
  pass: boolean;
  score: number;
  failureReason: ResultFailureReason;
  error?: string | null;
  gradingResult?: GradingResult | null;
}

interface ManualRating {
  action: 'rate' | 'clear' | 'annotate';
  pass?: boolean;
  score?: number;
  comment?: string;
}

function getHumanRating(gradingResult?: GradingResult | null): GradingResult | undefined {
  return (
    gradingResult?.componentResults?.find(
      (result) => result?.assertion?.type === HUMAN_ASSERTION_TYPE,
    ) ?? (gradingResult?.assertion?.type === HUMAN_ASSERTION_TYPE ? gradingResult : undefined)
  );
}

export function applyManualRating(
  state: RatingState,
  rating: ManualRating,
): RatingState & { gradingResult: GradingResult } {
  const grade = {
    ...(state.gradingResult ?? { pass: state.pass, score: state.score, reason: '' }),
    comment: rating.comment,
  };
  const rated = { ...state, gradingResult: grade };
  if (rating.action === 'annotate') {
    return rated;
  }

  const human = getHumanRating(grade);
  const components = (grade.componentResults ?? []).filter(
    (result) => result && result.assertion?.type !== HUMAN_ASSERTION_TYPE,
  );
  // Averaging components cannot restore thresholds or custom scores.
  const original = human
    ? human.metadata?.originalResult
    : {
        pass: state.pass,
        score: state.score,
        failureReason: state.failureReason,
        error: state.error ?? null,
        reason: grade.reason,
      };

  if (rating.action === 'clear') {
    const graderError = components.find((result) => !result.pass && result.metadata?.graderError);
    rated.pass = original?.pass ?? components.every((result) => result.pass);
    rated.score =
      original?.score ??
      (components.length
        ? components.reduce((sum, result) => sum + result.score, 0) / components.length
        : 1);
    rated.failureReason =
      original?.failureReason ??
      (rated.pass
        ? ResultFailureReason.NONE
        : graderError || state.failureReason === ResultFailureReason.ERROR
          ? ResultFailureReason.ERROR
          : ResultFailureReason.ASSERT);
    grade.reason =
      original?.reason ?? graderError?.reason ?? components[0]?.reason ?? 'No assertions';
    rated.error =
      original?.error ?? (rated.failureReason === ResultFailureReason.ERROR ? grade.reason : null);
    if (grade.assertion?.type === HUMAN_ASSERTION_TYPE) {
      delete grade.assertion;
    }
  } else {
    rated.pass = rating.pass ?? state.pass;
    rated.score = rating.score ?? (rating.pass === undefined ? state.score : Number(rating.pass));
    rated.failureReason = rated.pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT;
    rated.error = null;
    grade.reason = 'Manual result (overrides all other grading results)';
    components.push({
      pass: rated.pass,
      score: rated.score,
      reason: grade.reason,
      comment: rating.comment,
      assertion: { type: HUMAN_ASSERTION_TYPE },
      metadata: { originalResult: original },
    });
  }
  grade.pass = rated.pass;
  grade.score = rated.score;
  grade.componentResults = components;
  return rated;
}

export function updateManualRatingMetrics(
  metrics: PromptMetrics,
  previous: RatingState,
  next: RatingState,
): PromptMetrics {
  const updated = { ...metrics, score: (metrics.score ?? 0) + next.score - previous.score };
  const category = (state: RatingState) =>
    state.pass
      ? 'testPassCount'
      : state.failureReason === ResultFailureReason.ERROR
        ? 'testErrorCount'
        : 'testFailCount';
  if (category(previous) !== category(next)) {
    updated[category(previous)] = (updated[category(previous)] ?? 0) - 1;
    updated[category(next)] = (updated[category(next)] ?? 0) + 1;
  }
  const previousHuman = getHumanRating(previous.gradingResult);
  const nextHuman = getHumanRating(next.gradingResult);
  if (previousHuman) {
    const field = previousHuman.pass ? 'assertPassCount' : 'assertFailCount';
    updated[field] = (updated[field] ?? 0) - 1;
  }
  if (nextHuman) {
    const field = nextHuman.pass ? 'assertPassCount' : 'assertFailCount';
    updated[field] = (updated[field] ?? 0) + 1;
  }
  return updated;
}
