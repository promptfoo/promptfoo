import { isGraderFailure, matchesLlmRubric } from '../matchers/llmGrading';
import { invertScore } from '../matchers/shared';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleLlmRubric = async ({
  assertion,
  inverse,
  renderedValue,
  outputString,
  providerResponse,
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
    !assertion.transform && providerResponse?.images?.length ? { providerResponse } : undefined,
    providerCallContext,
  );

  if (isGraderFailure(resp)) {
    return { ...resp, assertion };
  }

  const score = inverse ? invertScore(resp.score) : resp.score;
  return {
    ...resp,
    pass: resp.pass !== inverse,
    score,
  };
};
