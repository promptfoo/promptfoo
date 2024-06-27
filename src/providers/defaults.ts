import logger from '../logger';
import type { EnvOverrides } from '../types';
import {
  DefaultGradingProvider as AnthropicGradingProvider,
  DefaultGradingJsonProvider as AnthropicGradingJsonProvider,
  DefaultSuggestionsProvider as AnthropicSuggestionsProvider,
} from './anthropic';
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
import {
  DefaultGradingProvider as GeminiGradingProvider,
  DefaultEmbeddingProvider as GeminiEmbeddingProvider,
} from './vertex';
import { hasGoogleDefaultCredentials } from './vertexUtil';

export async function getDefaultProviders(env?: EnvOverrides) {
  const preferAnthropic =
    !process.env.OPENAI_API_KEY &&
    !env?.OPENAI_API_KEY &&
    (process.env.ANTHROPIC_API_KEY || env?.ANTHROPIC_API_KEY);

  if (preferAnthropic) {
    logger.debug('Using Anthropic default providers');
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
    logger.debug('Using Google default providers');
    return {
      embeddingProvider: GeminiEmbeddingProvider,
      gradingProvider: GeminiGradingProvider,
      gradingJsonProvider: GeminiGradingProvider,
      suggestionsProvider: GeminiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
    };
  }

  logger.debug('Using OpenAI default providers');
  return {
    embeddingProvider: OpenAiEmbeddingProvider,
    gradingProvider: OpenAiGradingProvider,
    gradingJsonProvider: OpenAiGradingJsonProvider,
    suggestionsProvider: OpenAiSuggestionsProvider,
    moderationProvider: OpenAiModerationProvider,
  };
}
