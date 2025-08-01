import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiModerationProvider } from '../openai/moderation';
import { MistralChatCompletionProvider, MistralEmbeddingProvider } from '../mistral';

const DEFAULT_MODEL = 'mistral-large-latest';

/**
 * Mistral provider configuration
 */
export const MistralProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using Mistral default providers');

  const jsonConfig = { env, config: { response_format: { type: 'json_object' as const } } };
  const standardConfig = { env };

  return {
    embeddingProvider: new MistralEmbeddingProvider(standardConfig),
    gradingJsonProvider: new MistralChatCompletionProvider(DEFAULT_MODEL, jsonConfig),
    gradingProvider: new MistralChatCompletionProvider(DEFAULT_MODEL, standardConfig),
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest', standardConfig),
    suggestionsProvider: new MistralChatCompletionProvider(DEFAULT_MODEL, standardConfig),
    synthesizeProvider: new MistralChatCompletionProvider(DEFAULT_MODEL, standardConfig),
  };
};
