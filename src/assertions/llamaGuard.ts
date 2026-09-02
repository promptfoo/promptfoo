import { matchesLlamaGuard } from '../matchers/llamaGuard';
import { isGraderFailure } from '../matchers/llmGrading';
import { parseChatPrompt } from '../providers/shared';
import invariant from '../util/invariant';
import { getActualPromptWithFallback } from '../util/providerResponse';

import type { AssertionParams, GradingResult } from '../types/index';

type ChatMessage = {
  role?: string;
  content?: unknown;
};

function getChatMessageText(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => getChatMessageText(part))
      .filter((part): part is string => typeof part === 'string');
    return textParts.length > 0 ? textParts.join('\n') : undefined;
  }

  if (content && typeof content === 'object') {
    const contentObject = content as Record<string, unknown>;
    return getChatMessageText(contentObject.text ?? contentObject.content);
  }

  return undefined;
}

function getLastUserMessage(parsedPrompt: ChatMessage[]): string | undefined {
  for (let i = parsedPrompt.length - 1; i >= 0; i--) {
    const message = parsedPrompt[i];
    if (message?.role === 'user') {
      const userPrompt = getChatMessageText(message.content);
      if (userPrompt !== undefined) {
        return userPrompt;
      }
    }
  }

  for (let i = parsedPrompt.length - 1; i >= 0; i--) {
    const message = parsedPrompt[i];
    const prompt = getChatMessageText(message?.content);
    if (prompt !== undefined) {
      return prompt;
    }
  }

  return undefined;
}

export const handleLlamaGuard = async ({
  assertion,
  test,
  outputString,
  providerResponse,
  prompt,
  providerCallContext,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  // Priority: 1) response.prompt (provider-reported), 2) redteamFinalPrompt (legacy),
  // 3) original prompt. Mirrors handleModeration's prompt resolution.
  let promptToClassify = getActualPromptWithFallback(providerResponse, prompt || '');
  invariant(promptToClassify, 'llama-guard assertion type must have a prompt');
  invariant(
    !assertion.value || (Array.isArray(assertion.value) && typeof assertion.value[0] === 'string'),
    'llama-guard assertion value must be a string array if set',
  );

  // Try to extract the last user message from serialized chat prompts (JSON or YAML).
  try {
    const parsedPrompt = parseChatPrompt<ChatMessage[] | null>(promptToClassify, null);
    if (parsedPrompt && parsedPrompt.length > 0) {
      promptToClassify = getLastUserMessage(parsedPrompt) ?? promptToClassify;
    }
  } catch {
    // Ignore error
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
