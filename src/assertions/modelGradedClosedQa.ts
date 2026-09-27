import { isGraderFailure, matchesClosedQa } from '../matchers/llmGrading';
import { invertScore } from '../matchers/shared';
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

  // A grading provider/parse failure is not evidence about the submission, so
  // never flip it into a pass for `not-model-graded-closedqa` — propagate it
  // verbatim (mirrors the inverse-aware llm-rubric/g-eval handlers).
  if (isGraderFailure(resp)) {
    return { ...resp, assertion };
  }

  // `not-model-graded-closedqa` asserts the opposite outcome; flip pass/score
  // for the inverse case.
  return {
    ...resp,
    pass: resp.pass !== inverse,
    score: inverse ? invertScore(resp.score) : resp.score,
    assertion,
  };
};
