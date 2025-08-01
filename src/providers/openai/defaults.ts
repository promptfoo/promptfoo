import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiEmbeddingProvider } from './embedding';
import { OpenAiModerationProvider } from './moderation';

const DEFAULT_MODEL = 'gpt-4.1-2025-04-14';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';
const DEFAULT_MODERATION_MODEL = 'omni-moderation-latest';

/**
 * OpenAI provider configuration
 */
export const OpenAiProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using OpenAI default providers');

  const jsonConfig = { env, config: { response_format: { type: 'json_object' as const } } };
  const standardConfig = { env };

  return {
    embeddingProvider: new OpenAiEmbeddingProvider(DEFAULT_EMBEDDING_MODEL, standardConfig),
    gradingJsonProvider: new OpenAiChatCompletionProvider(DEFAULT_MODEL, jsonConfig),
    gradingProvider: new OpenAiChatCompletionProvider(DEFAULT_MODEL, standardConfig),
    moderationProvider: new OpenAiModerationProvider(DEFAULT_MODERATION_MODEL, standardConfig),
    suggestionsProvider: new OpenAiChatCompletionProvider(DEFAULT_MODEL, standardConfig),
    synthesizeProvider: new OpenAiChatCompletionProvider(DEFAULT_MODEL, jsonConfig),
  };
};

// Export specific provider instances for backward compatibility with tests
export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider(DEFAULT_EMBEDDING_MODEL);
export const DefaultGradingJsonProvider = new OpenAiChatCompletionProvider(DEFAULT_MODEL, {
  config: { response_format: { type: 'json_object' as const } },
});
export const DefaultGradingProvider = new OpenAiChatCompletionProvider(DEFAULT_MODEL);
export const DefaultModerationProvider = new OpenAiModerationProvider(DEFAULT_MODERATION_MODEL);
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider(DEFAULT_MODEL);
