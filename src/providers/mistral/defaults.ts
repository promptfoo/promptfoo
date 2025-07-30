import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiModerationProvider } from '../openai/moderation';
import { MistralChatCompletionProvider, MistralEmbeddingProvider } from '../mistral';

export const DefaultEmbeddingProvider = new MistralEmbeddingProvider();
export const DefaultGradingProvider = new MistralChatCompletionProvider('mistral-large-latest');
export const DefaultGradingJsonProvider = new MistralChatCompletionProvider(
  'mistral-large-latest',
  {
    config: {
      response_format: { type: 'json_object' },
    },
  },
);
export const DefaultSuggestionsProvider = new MistralChatCompletionProvider('mistral-large-latest');
export const DefaultSynthesizeProvider = new MistralChatCompletionProvider('mistral-large-latest');

/**
 * Mistral provider configuration
 */
export const MistralProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using Mistral default providers');

  return {
    datasetGenerationProvider: DefaultGradingProvider,
    embeddingProvider: DefaultEmbeddingProvider,
    gradingJsonProvider: DefaultGradingJsonProvider,
    gradingProvider: DefaultGradingProvider,
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest'),
    suggestionsProvider: DefaultSuggestionsProvider,
    synthesizeProvider: DefaultSynthesizeProvider,
  };
};
