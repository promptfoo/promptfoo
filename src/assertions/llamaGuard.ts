import { matchesLlamaGuard } from '../matchers/llamaGuard';
import { isGraderFailure } from '../matchers/llmGrading';
import { resolveClassifierConversation, resolveClassifierPrompt } from './classifierPrompt';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleLlamaGuard = async ({
  assertion,
  renderedValue,
  test,
  outputString,
  providerResponse,
  prompt,
  providerCallContext,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  const promptToClassify = resolveClassifierPrompt(providerResponse, prompt || '');
  if (promptToClassify === undefined) {
    throw new Error('llama-guard assertion type must have a prompt');
  }

  // Use the rendered value: runAssertionInternal resolves nunjucks templates, file://
  // references, and script results into `renderedValue`, so reading assertion.value
  // would leave a configured allow-list such as ['{{ category }}'] unrendered and
  // silently match nothing — turning a template into a safety false negative.
  const value = renderedValue ?? assertion.value;
  const configuredValue = typeof value === 'string' && value.trim() === '' ? undefined : value;
  if (
    configuredValue != null &&
    (!Array.isArray(configuredValue) ||
      configuredValue.length === 0 ||
      !configuredValue.every((category) => typeof category === 'string'))
  ) {
    throw new Error('llama-guard assertion value must be a string array if set');
  }

  const result = await matchesLlamaGuard(
    {
      userPrompt: promptToClassify,
      assistantResponse: outputString,
      categories: configuredValue ?? [],
      conversation: resolveClassifierConversation(providerResponse, prompt || ''),
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
