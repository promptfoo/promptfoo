/**
 * Video-rubric assertion handler.
 *
 * Uses a multimodal LLM (Gemini) to evaluate video outputs against a rubric.
 */

import { matchesVideoRubric } from '../matchers';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleVideoRubric = async ({
  assertion,
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

  if (test.options?.rubricPrompt && typeof test.options.rubricPrompt === 'object') {
    test.options.rubricPrompt = JSON.stringify(test.options.rubricPrompt);
  }

  // Update the assertion value for web view display
  assertion.value = assertion.value || test.options?.rubricPrompt;

  return matchesVideoRubric(
    renderedValue || '',
    video,
    test.options,
    test.vars,
    assertion,
    providerCallContext,
  );
};
