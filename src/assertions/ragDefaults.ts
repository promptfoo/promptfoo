import { isGraderFailure } from '../matchers/llmGrading';

import type { GradingResult } from '../types/index';

export const DEFAULT_RAG_ASSERTION_THRESHOLD = 0.5;

export function applyRagInverse(
  result: Omit<GradingResult, 'assertion'>,
  inverse: boolean,
): Omit<GradingResult, 'assertion'> {
  if (!inverse || isGraderFailure(result)) {
    return result;
  }

  return {
    ...result,
    pass: !result.pass,
    score: 1 - result.score,
  };
}
