import { getEnvString } from '../envars';
import { getDefaultProviders } from '../providers/defaults';
import { loadApiProvider } from '../providers/index';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from '../redteam/constants';
import invariant from '../util/invariant';
import { getAndCheckProvider } from './providers';

import type { ApiModerationProvider, GradingConfig, GradingResult } from '../types/index';

/**
 * Input passed to `assertions.matchesModeration()`.
 *
 * Pass both sides of the exchange so moderation providers can inspect the
 * triggering prompt as well as the model response. Use `categories` to narrow
 * failures when only specific policy buckets matter to the test.
 *
 * @example
 * ```ts
 * const options: ModerationMatchOptions = {
 *   userPrompt: 'Tell me a joke.',
 *   assistantResponse: 'Here is one...',
 *   categories: ['violence'],
 * };
 * ```
 *
 * @public
 */
export interface ModerationMatchOptions {
  /** User prompt that led to the assistant response. */
  userPrompt: string;
  /** Assistant response to moderate. */
  assistantResponse: string;
  /** Optional subset of moderation categories that should count as failures. */
  categories?: string[];
}

/**
 * Check a model response with the configured moderation provider.
 *
 * @param options - Prompt, response, and optional category filter.
 * @param grading - Optional moderation-provider override.
 * @returns Moderation grading result without the surrounding assertion payload.
 */
export async function matchesModeration(
  options: ModerationMatchOptions,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  const { userPrompt, assistantResponse, categories = [] } = options;
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
  if (resp.error) {
    return {
      pass: false,
      score: 0,
      reason: `Moderation API error: ${resp.error}`,
    };
  }

  const { flags } = resp;
  if (!flags || flags.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: 'No moderation flags detected',
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
    };
  }

  return {
    pass: true,
    score: 1,
    reason: 'No relevant moderation flags detected',
  };
}
