import logger from '../logger';
import type { ApiProvider, EnvOverrides } from '../types';
import {
  DefaultGradingProvider as AnthropicGradingProvider,
  DefaultGradingJsonProvider as AnthropicGradingJsonProvider,
  DefaultSuggestionsProvider as AnthropicSuggestionsProvider,
  DefaultLlmRubricProvider as AnthropicLlmRubricProvider,
} from './anthropic';
import {
  DefaultEmbeddingProvider as OpenAiEmbeddingProvider,
  DefaultGradingJsonProvider as OpenAiGradingJsonProvider,
  DefaultGradingProvider as OpenAiGradingProvider,
  DefaultSuggestionsProvider as OpenAiSuggestionsProvider,
  DefaultModerationProvider as OpenAiModerationProvider,
} from './openai';
import {
  DefaultGradingProvider as GeminiGradingProvider,
  DefaultEmbeddingProvider as GeminiEmbeddingProvider,
} from './vertex';
import { hasGoogleDefaultCredentials } from './vertexUtil';

interface DefaultProviders {
  datasetGenerationProvider: ApiProvider;
  embeddingProvider: ApiProvider;
  gradingJsonProvider: ApiProvider;
  gradingProvider: ApiProvider;
  llmRubricProvider?: ApiProvider;
  moderationProvider: ApiProvider;
  suggestionsProvider: ApiProvider;
}

export async function getDefaultProviders(env?: EnvOverrides): Promise<DefaultProviders> {
  const preferAnthropic =
    !process.env.OPENAI_API_KEY &&
    !env?.OPENAI_API_KEY &&
    (process.env.ANTHROPIC_API_KEY || env?.ANTHROPIC_API_KEY);

  if (preferAnthropic) {
    logger.debug('Using Anthropic default providers');
    return {
      datasetGenerationProvider: AnthropicGradingProvider,
      embeddingProvider: OpenAiEmbeddingProvider, // TODO(ian): Voyager instead?
      gradingJsonProvider: AnthropicGradingJsonProvider,
      gradingProvider: AnthropicGradingProvider,
      llmRubricProvider: AnthropicLlmRubricProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: AnthropicSuggestionsProvider,
    };
  }

  const preferGoogle =
    !process.env.OPENAI_API_KEY && !env?.OPENAI_API_KEY && (await hasGoogleDefaultCredentials());
  if (preferGoogle) {
    logger.debug('Using Google default providers');
    return {
      datasetGenerationProvider: GeminiGradingProvider,
      embeddingProvider: GeminiEmbeddingProvider,
      gradingJsonProvider: GeminiGradingProvider,
      gradingProvider: GeminiGradingProvider,
      moderationProvider: OpenAiModerationProvider,
      suggestionsProvider: GeminiGradingProvider,
    };
  }

  logger.debug('Using OpenAI default providers');
  return {
    datasetGenerationProvider: OpenAiGradingProvider,
    embeddingProvider: OpenAiEmbeddingProvider,
    gradingJsonProvider: OpenAiGradingJsonProvider,
    gradingProvider: OpenAiGradingProvider,
    moderationProvider: OpenAiModerationProvider,
    suggestionsProvider: OpenAiSuggestionsProvider,
  };
}
