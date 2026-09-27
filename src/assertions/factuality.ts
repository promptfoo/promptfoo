import { isGraderFailure, matchesFactuality } from '../matchers/llmGrading';
import { invertScore } from '../matchers/shared';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleFactuality = async ({
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
    'factuality assertion type must have a string value',
  );
  invariant(prompt, 'factuality assertion type must have a prompt');
  // Note: rubricPrompt will be rendered later in matchesFactuality with proper variables
  // (input, ideal, completion) available at that point

  const resp = await matchesFactuality(
    prompt,
    renderedValue,
    outputString,
    test.options,
    test.vars,
    providerCallContext,
  );

  // A grading provider/parse failure is not evidence about the submission, so
  // never flip it into a pass for `not-model-graded-factuality` — propagate it
  // verbatim (mirrors the inverse-aware llm-rubric/g-eval handlers).
  if (isGraderFailure(resp)) {
    return { ...resp, assertion };
  }

  // `not-model-graded-factuality` asserts the opposite outcome; flip pass/score
  // for the inverse case.
  return {
    ...resp,
    pass: resp.pass !== inverse,
    score: inverse ? invertScore(resp.score) : resp.score,
    assertion,
  };
};
