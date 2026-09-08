import { isGraderFailure } from '../matchers/llmGrading';
import { matchesModeration } from '../matchers/moderation';
import invariant from '../util/invariant';
import { resolveClassifierPrompt } from './classifierPrompt';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleModeration = async ({
  assertion,
  test,
  outputString,
  providerResponse,
  prompt,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  // Priority: 1) response.prompt (provider-reported), 2) redteamFinalPrompt (legacy),
  // 3) original prompt, then unwrap serialized chat prompts to the last user message.
  const promptToModerate = resolveClassifierPrompt(providerResponse, prompt || '');
  invariant(promptToModerate, 'moderation assertion type must have a prompt');
  invariant(
    !assertion.value || (Array.isArray(assertion.value) && typeof assertion.value[0] === 'string'),
    'moderation assertion value must be a string array if set',
  );

  const moderationResult = await matchesModeration(
    {
      userPrompt: promptToModerate,
      assistantResponse: outputString,
      categories: Array.isArray(assertion.value) ? assertion.value : [],
    },
    test.options,
  );

  // A moderation provider/transport error is not evidence about the content, so
  // never flip it into a pass for `not-moderation` — propagate it verbatim
  // (mirrors the inverse-aware llm-rubric/g-eval handlers).
  if (isGraderFailure(moderationResult)) {
    return { ...moderationResult, assertion };
  }

  // `not-moderation` asserts the opposite outcome (e.g. that the output WAS
  // flagged). Flip pass/score for the inverse case, mirroring handleClassifier.
  const pass = inverse ? !moderationResult.pass : moderationResult.pass;
  const score = inverse ? 1 - moderationResult.score : moderationResult.score;
  return {
    // Preserve provider-reported moderation token usage and any matcher metadata;
    // inversion changes only the verdict.
    ...moderationResult,
    pass,
    score,
    assertion,
  };
};
