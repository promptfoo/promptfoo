import { isGraderFailure, matchesClosedQa } from '../matchers/llmGrading';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleModelGradedClosedQa = async ({
  assertion,
  inverse,
  renderedValue,
  outputString,
  test,
  prompt,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'model-graded-closedqa assertion type must have a string value',
  );
  invariant(prompt, 'model-graded-closedqa assertion type must have a prompt');
  // Note: rubricPrompt will be rendered later in matchesClosedQa with proper variables
  // (input, criteria, completion) available at that point

  const resp = await matchesClosedQa(
    prompt,
    renderedValue,
    outputString,
    test.options,
    test.vars,
    providerCallContext,
  );

  // A grader error/refusal is not a real verdict, so do not invert it (mirrors
  // handleLlmRubric).
  if (isGraderFailure(resp)) {
    return { ...resp, assertion };
  }

  // Clamp only on inversion so a NaN or out-of-range grader score cannot turn
  // `1 - score` into a misleading negative/inflated value.
  const score = inverse
    ? Math.min(1, Math.max(0, 1 - (Number.isFinite(resp.score) ? resp.score : 0)))
    : resp.score;
  return {
    ...resp,
    assertion,
    pass: resp.pass !== inverse,
    score,
  };
};
