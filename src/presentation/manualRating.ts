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

export interface ManualRating {
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
  const grade = state.gradingResult ?? { pass: state.pass, score: state.score, reason: '' };
  if (rating.action === 'annotate') {
    return { ...state, gradingResult: { ...grade, comment: rating.comment } };
  }

  const human = getHumanRating(grade);
  const components = (grade.componentResults ?? []).filter(
    (result) => result && result.assertion?.type !== HUMAN_ASSERTION_TYPE,
  );
  // Retain the evaluated aggregate. Averaging components loses thresholds and custom scores.
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
    const pass = original?.pass ?? (!graderError && components.every((result) => result.pass));
    const score =
      original?.score ??
      (components.length
        ? components.reduce((sum, result) => sum + result.score, 0) / components.length
        : 1);
    const failureReason =
      original?.failureReason ??
      (pass
        ? ResultFailureReason.NONE
        : graderError || state.failureReason === ResultFailureReason.ERROR
          ? ResultFailureReason.ERROR
          : ResultFailureReason.ASSERT);
    const reason =
      original?.reason ?? graderError?.reason ?? components[0]?.reason ?? 'No assertions';
    const { assertion, ...restGrade } = grade;
    return {
      ...state,
      pass,
      score,
      failureReason,
      error: original?.error ?? (failureReason === ResultFailureReason.ERROR ? reason : null),
      gradingResult: {
        ...restGrade,
        ...(assertion?.type === HUMAN_ASSERTION_TYPE ? {} : { assertion }),
        pass,
        score,
        reason,
        comment: rating.comment,
        componentResults: components,
      },
    };
  }

  const pass = rating.pass ?? state.pass;
  const score = rating.score ?? (rating.pass === undefined ? state.score : pass ? 1 : 0);
  const reason = 'Manual result (overrides all other grading results)';
  return {
    ...state,
    pass,
    score,
    failureReason: pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
    error: null,
    gradingResult: {
      ...grade,
      pass,
      score,
      reason,
      comment: rating.comment,
      componentResults: [
        ...components,
        {
          pass,
          score,
          reason,
          comment: rating.comment,
          assertion: { type: HUMAN_ASSERTION_TYPE },
          metadata: { originalResult: original },
        },
      ],
    },
  };
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
