import { matchesLlmRubric, matchesVideoRubric } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { finalizeGradedAssertion } from './ragDefaults';

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
    !assertion.transform && (providerResponse?.images?.length || providerResponse?.audio)
      ? { providerResponse }
      : undefined,
    providerCallContext,
  );

  return finalizeGradedAssertion(resp, assertion, inverse);
};

export const handleVideoRubric = async ({
  resolveVideo,
  assertion,
  inverse,
  renderedValue,
  test,
  providerResponse,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' ||
      typeof renderedValue === 'object' ||
      typeof renderedValue === 'undefined',
    '"video-rubric" assertion type must have a string or object value',
  );

  const video = providerResponse?.video;
  if (!video) {
    return {
      pass: false,
      score: 0,
      reason: 'No video found in provider response. video-rubric requires a video output.',
      assertion,
    };
  }

  const grading =
    test.options?.rubricPrompt && typeof test.options.rubricPrompt === 'object'
      ? { ...test.options, rubricPrompt: JSON.stringify(test.options.rubricPrompt) }
      : test.options;

  // Include a custom prompt in results without mutating the shared test definition.
  const resultAssertion =
    assertion.value === undefined && grading?.rubricPrompt !== undefined
      ? { ...assertion, value: grading.rubricPrompt }
      : assertion;

  const result = await matchesVideoRubric(
    renderedValue ?? '',
    resolveVideo,
    grading,
    test.vars,
    resultAssertion,
    providerCallContext,
  );

  return finalizeGradedAssertion(result, resultAssertion, inverse);
};
