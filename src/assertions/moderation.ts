import { matchesModeration } from '../matchers';
import { parseChatPrompt } from '../providers/shared';
import invariant from '../util/invariant';
import { getActualPromptWithFallback } from '../util/providerResponse';

import type { AssertionParams, GradingResult } from '../types/index';

type ChatMessage = {
  role?: string;
  content?: unknown;
};

function getModerationText(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => getModerationText(part))
      .filter((part): part is string => typeof part === 'string');
    return textParts.length > 0 ? textParts.join('\n') : undefined;
  }

  if (content && typeof content === 'object') {
    const contentObject = content as Record<string, unknown>;
    return getModerationText(contentObject.text ?? contentObject.content);
  }

  return undefined;
}

function getLastModerationPrompt(parsedPrompt: ChatMessage[]): string | undefined {
  for (let i = parsedPrompt.length - 1; i >= 0; i--) {
    const message = parsedPrompt[i];
    if (message?.role === 'user') {
      const userPrompt = getModerationText(message.content);
      if (userPrompt !== undefined) {
        return userPrompt;
      }
    }
  }

  for (let i = parsedPrompt.length - 1; i >= 0; i--) {
    const message = parsedPrompt[i];
    const prompt = getModerationText(message?.content);
    if (prompt !== undefined) {
      return prompt;
    }
  }

  return undefined;
}

export const handleModeration = async ({
  assertion,
  test,
  outputString,
  providerResponse,
  prompt,
}: AssertionParams): Promise<GradingResult> => {
  // Priority: 1) response.prompt (provider-reported), 2) redteamFinalPrompt (legacy), 3) original prompt
  // This allows providers to report the actual prompt they sent (e.g., GenAIScript, dynamic prompts)
  let promptToModerate = getActualPromptWithFallback(providerResponse, prompt || '');
  invariant(promptToModerate, 'moderation assertion type must have a prompt');
  invariant(
    !assertion.value || (Array.isArray(assertion.value) && typeof assertion.value[0] === 'string'),
    'moderation assertion value must be a string array if set',
  );
  // Try to extract the last user message from serialized chat prompts (JSON or YAML).
  try {
    const parsedPrompt = parseChatPrompt<ChatMessage[] | null>(promptToModerate, null);
    if (parsedPrompt && parsedPrompt.length > 0) {
      promptToModerate = getLastModerationPrompt(parsedPrompt) ?? promptToModerate;
    }
  } catch {
    // Ignore error
  }

  const moderationResult = await matchesModeration(
    {
      userPrompt: promptToModerate,
      assistantResponse: outputString,
      categories: Array.isArray(assertion.value) ? assertion.value : [],
    },
    test.options,
  );

  const pass = moderationResult.pass;
  return {
    pass,
    score: moderationResult.score,
    reason: moderationResult.reason,
    assertion,
  };
};
