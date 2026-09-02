import { matchesLlamaGuard } from '../matchers/llamaGuard';
import { isGraderFailure } from '../matchers/llmGrading';
import { resolveClassifierPrompt } from './classifierPrompt';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleLlamaGuard = async ({
  assertion,
  test,
  outputString,
  providerResponse,
  prompt,
  providerCallContext,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  const promptToClassify = resolveClassifierPrompt(providerResponse, prompt || '');
  if (!promptToClassify) {
    throw new Error('llama-guard assertion type must have a prompt');
  }
  if (
    assertion.value &&
    !(Array.isArray(assertion.value) && typeof assertion.value[0] === 'string')
  ) {
    throw new Error('llama-guard assertion value must be a string array if set');
  }

  const result = await matchesLlamaGuard(
    {
      userPrompt: promptToClassify,
      assistantResponse: outputString,
      categories: Array.isArray(assertion.value) ? assertion.value : [],
    },
    test.options,
    providerCallContext,
  );

  // A LlamaGuard provider/transport error is not evidence about the content, so never
  // flip it into a pass for `not-llama-guard` — propagate it verbatim (mirrors
  // handleModeration and the other inverse-aware model-graded handlers).
  if (isGraderFailure(result)) {
    return { ...result, assertion };
  }

  // `not-llama-guard` asserts the opposite outcome (e.g. that the output WAS flagged).
  const pass = inverse ? !result.pass : result.pass;
  const score = inverse ? 1 - result.score : result.score;
  return {
    ...result,
    pass,
    score,
    assertion,
  };
};
