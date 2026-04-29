import { isGraderFailure, matchesLlmRubric } from '../matchers/llmGrading';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleLlmRubric = async ({
  assertion,
  inverse,
  renderedValue,
  outputString,
  test,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' ||
      typeof renderedValue === 'object' ||
      typeof renderedValue === 'undefined',
    '"llm-rubric" assertion type must have a string or object value',
  );
  if (test.options?.rubricPrompt && typeof test.options.rubricPrompt === 'object') {
    test.options.rubricPrompt = JSON.stringify(test.options.rubricPrompt);
  }

  // Update the assertion value. This allows the web view to display the prompt.
  assertion.value = assertion.value || test.options?.rubricPrompt;

  const resp = await matchesLlmRubric(
    renderedValue || '',
    outputString,
    test.options,
    test.vars,
    assertion,
    undefined,
    providerCallContext,
  );

  if (isGraderFailure(resp)) {
    return { ...resp, assertion };
  }

  // Clamp the inverted score to [0, 1] so a grader that emits a NaN or
  // out-of-range score cannot produce a misleading negative/inflated value
  // after inversion. Non-inverted scores are passed through unchanged to
  // preserve the existing contract for callers reading raw rubric scores.
  const score = inverse
    ? Math.min(1, Math.max(0, 1 - (Number.isFinite(resp.score) ? resp.score : 0)))
    : resp.score;
  return {
    ...resp,
    pass: resp.pass !== inverse,
    score,
  };
};
