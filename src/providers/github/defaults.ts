import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiChatCompletionProvider } from '../openai/chat';
import { OpenAiEmbeddingProvider } from '../openai/embedding';
import { OpenAiModerationProvider } from '../openai/moderation';

const DEFAULT_MODEL = 'openai/gpt-4.1';
const GITHUB_CONFIG = {
  apiBaseUrl: 'https://models.github.ai',
  apiKeyEnvar: 'GITHUB_TOKEN',
};

/**
 * GitHub Models provider configuration
 */
export const GitHubProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using GitHub Models default providers');

  const standardConfig = { env, config: GITHUB_CONFIG };
  const jsonConfig = {
    env,
    config: { ...GITHUB_CONFIG, response_format: { type: 'json_object' as const } },
  };

  return {
    embeddingProvider: new OpenAiEmbeddingProvider('text-embedding-3-large', { env }), // GitHub doesn't support embeddings
    gradingJsonProvider: new OpenAiChatCompletionProvider(DEFAULT_MODEL, jsonConfig),
    gradingProvider: new OpenAiChatCompletionProvider(DEFAULT_MODEL, standardConfig),
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest', { env }), // GitHub doesn't have moderation
    suggestionsProvider: new OpenAiChatCompletionProvider(DEFAULT_MODEL, standardConfig),
    synthesizeProvider: new OpenAiChatCompletionProvider(DEFAULT_MODEL, jsonConfig),
  };
};
