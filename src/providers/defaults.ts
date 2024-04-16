import {
  DefaultEmbeddingProvider as OpenAiEmbeddingProvider,
  DefaultGradingJsonProvider as OpenAiGradingJsonProvider,
  DefaultGradingProvider as OpenAiGradingProvider,
  DefaultSuggestionsProvider as OpenAiSuggestionsProvider,
} from './openai';

import {
  DefaultGradingProvider as AnthropicGradeProvider,
  DefaultGradingJsonProvider as AnthropicGradingJsonProvider,
  DefaultSuggestionsProvider as AnthropicSuggestionsProvider,
} from './anthropic';

import { EnvOverrides } from '../types';

export function getDefaultProviders(env?: EnvOverrides) {
  const preferAnthropic =
    !process.env.OPENAI_API_KEY &&
    !env?.OPENAI_API_KEY &&
    (process.env.ANTHROPIC_API_KEY || env?.ANTHROPIC_API_KEY);

  if (preferAnthropic) {
    return {
      embeddingProvider: OpenAiEmbeddingProvider, // TODO(ian): AnthropicEmbeddingProvider
      gradingProvider: AnthropicGradeProvider,
      gradingJsonProvider: AnthropicGradingJsonProvider,
      suggestionsProvider: AnthropicSuggestionsProvider,
    };
  }
  return {
    embeddingProvider: OpenAiEmbeddingProvider,
    gradingProvider: OpenAiGradingProvider,
    gradingJsonProvider: OpenAiGradingJsonProvider,
    suggestionsProvider: OpenAiSuggestionsProvider,
  };
}
