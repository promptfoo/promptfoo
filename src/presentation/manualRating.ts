import { HUMAN_ASSERTION_TYPE } from '../providers/constants';
import { isResultFailureReason, ResultFailureReason } from '../types/results';

import type { GradingResult, PromptMetrics } from '../types/index';

const MANUAL_REASON = 'Manual result (overrides all other grading results)';

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
  const components = gradingResult?.componentResults;
  const human = Array.isArray(components)
    ? components.find((result) => result?.assertion?.type === HUMAN_ASSERTION_TYPE)
    : undefined;
  return (
    human ?? (gradingResult?.assertion?.type === HUMAN_ASSERTION_TYPE ? gradingResult : undefined)
  );
}

interface OriginalVerdict extends Omit<RatingState, 'gradingResult'> {
  reason: string;
}

function getOriginalVerdict(human: GradingResult | undefined): OriginalVerdict | undefined {
  // Legacy clients can supply arbitrary custom metadata on a human assertion.
  const original = human?.metadata?.originalResult;
  return typeof original?.pass === 'boolean' &&
    Number.isFinite(original.score) &&
    isResultFailureReason(original.failureReason) &&
    typeof original.reason === 'string' &&
    (original.error == null || typeof original.error === 'string')
    ? original
    : undefined;
}

// Legacy viewers and SDKs post the entire grade, including for comment-only updates.
export function applySubmittedGrade(
  state: RatingState,
  gradingResult: GradingResult,
): RatingState & { gradingResult: GradingResult } {
  const { pass, score } = gradingResult;
  const next = {
    pass,
    score,
    gradingResult,
    failureReason: pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
    error: null,
  };
  if (pass || getHumanRating(gradingResult)) {
    return next;
  }
  if (gradingResult.metadata?.graderError === true) {
    return { ...next, failureReason: ResultFailureReason.ERROR, error: gradingResult.reason };
  }
  const snapshot = getOriginalVerdict(getHumanRating(state.gradingResult));
  const original = snapshot ?? state;
  const reason = snapshot?.reason ?? state.gradingResult?.reason ?? 'Manual result';
  if (
    !original.pass &&
    original.score === score &&
    (!gradingResult.reason || gradingResult.reason === reason)
  ) {
    // A highlight or a legacy clear can retain a provider error without a grader-error marker.
    return { ...next, failureReason: original.failureReason, error: original.error };
  }
  return { ...next, error: gradingResult.reason ?? null };
}

// Historic human overrides have no snapshot. Recover from the automated components
// when available, otherwise keep the row's stored verdict and score.
function getLegacyVerdict(state: RatingState, grade: GradingResult, components: GradingResult[]) {
  const graderError = components.find(
    (result) =>
      !result.pass &&
      result.metadata?.graderError === true &&
      result.assertion?.weight !== 0 &&
      result.metadata.assertionSet?.weight !== 0,
  );
  const pass = components.length ? components.every((result) => result.pass) : state.pass;
  const scores = components
    .map((result) => result.score)
    .filter((score) => typeof score === 'number');
  const score = scores.length
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length
    : state.score;
  const failureReason = pass
    ? ResultFailureReason.NONE
    : graderError || state.failureReason === ResultFailureReason.ERROR
      ? ResultFailureReason.ERROR
      : ResultFailureReason.ASSERT;
  const reason =
    graderError?.reason ??
    (grade.reason === MANUAL_REASON
      ? components[0]?.reason || 'Manual rating cleared'
      : grade.reason);
  return {
    pass,
    score,
    failureReason,
    reason,
    error: failureReason === ResultFailureReason.ERROR ? reason : null,
  };
}

export function applyManualRating(
  state: RatingState,
  rating: ManualRating,
): RatingState & { gradingResult: GradingResult } {
  const previous = state.gradingResult;
  const grade: GradingResult = {
    ...previous,
    pass: previous?.pass ?? state.pass,
    score: previous?.score ?? state.score,
    reason: previous?.reason ?? 'Manual result',
    comment: rating.comment,
  };
  const rated = { ...state, gradingResult: grade };
  if (rating.action === 'annotate') {
    if (!grade.componentResults?.length) {
      delete grade.componentResults;
    }
    return rated;
  }

  const human = getHumanRating(grade);
  const components = (grade.componentResults ?? []).filter(
    (result) => result && result.assertion?.type !== HUMAN_ASSERTION_TYPE,
  );
  if (rating.action === 'clear') {
    if (!human) {
      return rated;
    }
    // Snapshots preserve thresholds and custom scores that averaging cannot restore.
    const original = getOriginalVerdict(human) ?? getLegacyVerdict(state, grade, components);
    rated.pass = original.pass;
    rated.score = original.score;
    rated.failureReason = original.failureReason;
    rated.error = original.error ?? null;
    grade.reason = original.reason;
    if (grade.assertion?.type === HUMAN_ASSERTION_TYPE) {
      delete grade.assertion;
    }
  } else {
    rated.pass = rating.pass ?? state.pass;
    rated.score = rating.score ?? (rating.pass === undefined ? state.score : Number(rating.pass));
    rated.failureReason = rated.pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT;
    rated.error = null;
    grade.reason = MANUAL_REASON;
    components.push({
      pass: rated.pass,
      score: rated.score,
      reason: grade.reason,
      comment: rating.comment,
      assertion: { type: HUMAN_ASSERTION_TYPE },
      metadata: human
        ? human.metadata
        : {
            originalResult: {
              pass: state.pass,
              score: state.score,
              failureReason: state.failureReason,
              error: state.error ?? null,
              reason: previous?.reason ?? 'Manual result',
            },
          },
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
