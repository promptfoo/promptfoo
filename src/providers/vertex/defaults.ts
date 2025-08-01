import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiModerationProvider } from '../openai/moderation';
import { VertexChatProvider, VertexEmbeddingProvider } from '../google/vertex';

// Default providers
export const DefaultGradingProvider = new VertexChatProvider('gemini-2.5-pro');
export const DefaultEmbeddingProvider = new VertexEmbeddingProvider('text-embedding');

/**
 * Google Gemini provider configuration
 */
export const GeminiProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using Google Gemini default providers');
  return {
    embeddingProvider: new VertexEmbeddingProvider('text-embedding', { env }),
    gradingJsonProvider: new VertexChatProvider('gemini-2.5-pro', { env }),
    gradingProvider: new VertexChatProvider('gemini-2.5-pro', { env }),
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest', { env }), // No native moderation, fallback to OpenAI
    suggestionsProvider: new VertexChatProvider('gemini-2.5-pro', { env }),
    synthesizeProvider: new VertexChatProvider('gemini-2.5-pro', { env }),
  };
};
