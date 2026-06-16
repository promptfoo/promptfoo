import { getEnvString } from '../envars';
import { getDefaultProviders } from '../providers/defaults';
import { loadApiProvider } from '../providers/index';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from '../redteam/constants';
import invariant from '../util/invariant';
import { getAndCheckProvider } from './providers';
import { normalizeMatcherTokenUsage } from './shared';

import type { ApiModerationProvider, GradingConfig, GradingResult } from '../types/index';

interface ModerationMatchOptions {
  userPrompt: string;
  assistantResponse: string;
  categories?: string[];
}

export async function matchesModeration(
  { userPrompt, assistantResponse, categories = [] }: ModerationMatchOptions,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!assistantResponse) {
    return {
      pass: true,
      score: 1,
      reason: 'No output to moderate',
    };
  }

  const defaultProviders = await getDefaultProviders();

  // Only try to use Replicate if OpenAI is not available
  const hasOpenAiKey = getEnvString('OPENAI_API_KEY');
  const hasReplicateKey =
    !hasOpenAiKey && (getEnvString('REPLICATE_API_KEY') || getEnvString('REPLICATE_API_TOKEN'));
  const defaultModerationProvider = hasReplicateKey
    ? await loadApiProvider(LLAMA_GUARD_REPLICATE_PROVIDER)
    : defaultProviders.moderationProvider;

  const moderationProvider = (await getAndCheckProvider(
    'moderation',
    grading?.provider,
    defaultModerationProvider,
    'moderation check',
  )) as ApiModerationProvider;

  invariant(moderationProvider, 'Moderation provider must be defined');

  const resp = await moderationProvider.callModerationApi(userPrompt, assistantResponse);
  const tokensUsed = resp.tokenUsage ? normalizeMatcherTokenUsage(resp.tokenUsage) : undefined;
  if (resp.error) {
    // A provider/transport error is not evidence about the content. Tag it as a
    // grader failure so inverse-aware callers (`not-moderation`) propagate it
    // verbatim instead of flipping it into a spurious pass.
    return {
      pass: false,
      score: 0,
      reason: `Moderation API error: ${resp.error}`,
      ...(tokensUsed ? { tokensUsed } : {}),
      metadata: { graderError: true },
    };
  }

  const { flags } = resp;
  if (!flags || flags.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: 'No moderation flags detected',
      ...(tokensUsed ? { tokensUsed } : {}),
    };
  }
  const filteredFlags =
    categories.length === 0 ? flags : flags.filter((flag) => categories.includes(flag.code));
  if (filteredFlags.length > 0) {
    return {
      pass: false,
      score: 0,
      reason: `Moderation flags detected: ${filteredFlags
        .map((flag) => flag.description)
        .join(', ')}`,
      ...(tokensUsed ? { tokensUsed } : {}),
    };
  }

  return {
    pass: true,
    score: 1,
    reason: 'No relevant moderation flags detected',
    ...(tokensUsed ? { tokensUsed } : {}),
  };
}
