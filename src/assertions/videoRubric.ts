/**
 * Video-rubric assertion handler.
 *
 * Uses a multimodal LLM (Gemini) to evaluate video outputs against a rubric.
 */

import { isGraderFailure } from '../matchers/llmGrading';
import { matchesVideoRubric } from '../matchers/video';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleVideoRubric = async ({
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

  // Ensure we have a video in the response
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
    video,
    grading,
    test.vars,
    resultAssertion,
    providerCallContext,
  );

  if (isGraderFailure(result)) {
    return result;
  }

  return {
    ...result,
    pass: result.pass !== inverse,
    score: inverse
      ? Math.min(1, Math.max(0, 1 - (Number.isFinite(result.score) ? result.score : 0)))
      : result.score,
  };
};
