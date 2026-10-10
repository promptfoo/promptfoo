import { isGraderFailure } from '../matchers/llmGrading';
import { invertScore } from '../matchers/shared';

import type { Assertion, GradingResult } from '../types/index';

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
    score: invertScore(result.score),
  };
}

export function finalizeGradedAssertion(
  resp: GradingResult,
  assertion: Assertion,
  inverse: boolean,
  attachAssertion = false,
): GradingResult {
  // Grader failures must remain failures under negation.
  if (isGraderFailure(resp)) {
    return { ...resp, assertion };
  }

  if (attachAssertion) {
    return {
      ...resp,
      pass: resp.pass !== inverse,
      score: inverse ? invertScore(resp.score) : resp.score,
      assertion,
    };
  }

  const score = inverse ? invertScore(resp.score) : resp.score;
  return {
    ...resp,
    pass: resp.pass !== inverse,
    score,
  };
}
