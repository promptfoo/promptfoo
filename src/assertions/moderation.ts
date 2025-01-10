import logger from '../logger';
import { matchesModeration } from '../matchers';
import { parseChatPrompt } from '../providers/shared';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handleModeration = async ({
  assertion,
  test,
  outputString,
  providerResponse,
  prompt,
}: AssertionParams): Promise<GradingResult> => {
  if (providerResponse.flagged) {
    logger.debug('Target built-in guardrail triggered');
    return {
      pass: false,
      score: 0,
      reason: providerResponse.flaggedInput
        ? 'Prompt guardrail triggered'
        : 'Output guardrail triggered',
      assertion,
    };
  }
  // Some redteam techniques override the actual prompt that is used, so we need to assess that prompt for moderation.
  const promptToModerate = providerResponse.metadata?.redteamFinalPrompt || prompt;
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
