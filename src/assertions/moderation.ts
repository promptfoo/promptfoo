import { matchesModeration } from '../matchers';
import { parseChatPrompt } from '../providers/shared';
import invariant from '../util/invariant';
import { getActualPromptWithFallback } from '../util/providerResponse';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleModeration = async ({
  assertion,
  test,
  outputString,
  providerResponse,
  prompt,
}: AssertionParams): Promise<GradingResult> => {
  // Priority: 1) response.prompt (provider-reported), 2) redteamFinalPrompt (legacy), 3) original prompt
  // This allows providers to report the actual prompt they sent (e.g., GenAIScript, dynamic prompts)
  const promptToModerate = getActualPromptWithFallback(providerResponse, prompt || '');
  invariant(promptToModerate, 'moderation assertion type must have a prompt');
  invariant(
    !assertion.value || (Array.isArray(assertion.value) && typeof assertion.value[0] === 'string'),
    'moderation assertion value must be a string array if set',
  );
  if (promptToModerate[0] === '[' || promptToModerate[0] === '{') {
    // Try to extract the last user message from OpenAI-style prompts.
    try {
      const parsedPrompt = parseChatPrompt<null | { role: string; content: string }[]>(
        promptToModerate,
        null,
      );
      if (parsedPrompt && parsedPrompt.length > 0) {
        prompt = parsedPrompt[parsedPrompt.length - 1].content;
      }
    } catch {
      // Ignore error
    }
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
