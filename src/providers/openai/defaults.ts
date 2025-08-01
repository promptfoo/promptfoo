import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiEmbeddingProvider } from './embedding';
import { OpenAiModerationProvider } from './moderation';

export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider('text-embedding-3-large');
export const DefaultGradingProvider = new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14');
export const DefaultGradingJsonProvider = new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14', {
  config: {
    response_format: { type: 'json_object' },
  },
});
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14');
export const DefaultModerationProvider = new OpenAiModerationProvider('omni-moderation-latest');

/**
 * OpenAI provider configuration
 */
export const OpenAiProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using OpenAI default providers');
  return {
    embeddingProvider: new OpenAiEmbeddingProvider('text-embedding-3-large', { env }),
    gradingJsonProvider: new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14', {
      env,
      config: {
        response_format: { type: 'json_object' },
      },
    }),
    gradingProvider: new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14', { env }),
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest', { env }),
    suggestionsProvider: new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14', { env }),
    synthesizeProvider: new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14', {
      env,
      config: {
        response_format: { type: 'json_object' },
      },
    }),
  };
};
