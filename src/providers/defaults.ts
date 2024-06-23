import {
  DefaultEmbeddingProvider as OpenAiEmbeddingProvider,
  DefaultGradingJsonProvider as OpenAiGradingJsonProvider,
  DefaultGradingProvider as OpenAiGradingProvider,
  DefaultSuggestionsProvider as OpenAiSuggestionsProvider,
  DefaultModerationProvider as OpenAiModerationProvider,
} from './openai';

import {
  DefaultGradingProvider as AnthropicGradingProvider,
  DefaultGradingJsonProvider as AnthropicGradingJsonProvider,
  DefaultSuggestionsProvider as AnthropicSuggestionsProvider,
} from './anthropic';

import { DefaultGradingProvider as GeminiGradingProvider } from './vertex';

import { hasGoogleDefaultCredentials } from './vertexUtil';

import { EnvOverrides } from '../types';

export async function getDefaultProviders(env?: EnvOverrides) {
  const preferAnthropic =
    !process.env.OPENAI_API_KEY &&
    !env?.OPENAI_API_KEY &&
    (process.env.ANTHROPIC_API_KEY || env?.ANTHROPIC_API_KEY);

  if (preferAnthropic) {
    return {
      embeddingProvider: OpenAiEmbeddingProvider, // TODO(ian): Voyager instead?
      gradingProvider: AnthropicGradingProvider,
      gradingJsonProvider: AnthropicGradingJsonProvider,
      suggestionsProvider: AnthropicSuggestionsProvider,
      moderationProvider: OpenAiModerationProvider,
    };
  }

  const preferGoogle =
    !process.env.OPENAI_API_KEY && !env?.OPENAI_API_KEY && (await hasGoogleDefaultCredentials());
  if (preferGoogle) {
    return {
      embeddingProvider: OpenAiEmbeddingProvider,
      gradingProvider: GeminiGradingProvider,
      gradingJsonProvider: GeminiGradingProvider,
      suggestionsProvider: GeminiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
    };
  }

  return {
    embeddingProvider: OpenAiEmbeddingProvider,
    gradingProvider: OpenAiGradingProvider,
    gradingJsonProvider: OpenAiGradingJsonProvider,
    suggestionsProvider: OpenAiSuggestionsProvider,
    moderationProvider: OpenAiModerationProvider,
  };
}
