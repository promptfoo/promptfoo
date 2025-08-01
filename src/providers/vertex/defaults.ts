import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiModerationProvider } from '../openai/moderation';
import { VertexChatProvider, VertexEmbeddingProvider } from '../google/vertex';

const DEFAULT_MODEL = 'gemini-2.5-pro';
const EMBEDDING_MODEL = 'text-embedding';

/**
 * Google Gemini provider configuration
 */
export const GeminiProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using Google Gemini default providers');

  const standardConfig = { env };
  const chatProvider = new VertexChatProvider(DEFAULT_MODEL, standardConfig);

  return {
    embeddingProvider: new VertexEmbeddingProvider(EMBEDDING_MODEL, standardConfig),
    gradingJsonProvider: chatProvider,
    gradingProvider: chatProvider,
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest', standardConfig),
    suggestionsProvider: chatProvider,
    synthesizeProvider: chatProvider,
  };
};
