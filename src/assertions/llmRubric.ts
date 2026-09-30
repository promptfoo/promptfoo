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
  provider,
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

  const audio =
    provider?.transform || test.options?.transform || test.options?.postprocess
      ? undefined
      : providerResponse?.audio;

  const resp = await matchesLlmRubric(
    renderedValue || '',
    outputString,
    test.options,
    test.vars,
    assertion,
    !assertion.transform && (providerResponse?.images?.length || audio)
      ? { providerResponse: { ...providerResponse, audio } }
      : undefined,
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
