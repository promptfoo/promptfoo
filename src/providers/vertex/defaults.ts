import logger from '../../logger';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiModerationProvider } from '../openai/moderation';
import { VertexChatProvider, VertexEmbeddingProvider } from '../vertex';

// Default providers
export const DefaultGradingProvider = new VertexChatProvider('gemini-1.5-pro');
export const DefaultEmbeddingProvider = new VertexEmbeddingProvider('text-embedding');

/**
 * Google Gemini provider configuration
 */
export const GeminiProviderConfig: ProviderConfiguration = (env) => {
  logger.debug('Using Google Gemini default providers');
  return {
    datasetGenerationProvider: DefaultGradingProvider,
    embeddingProvider: DefaultEmbeddingProvider,
    gradingJsonProvider: DefaultGradingProvider,
    gradingProvider: DefaultGradingProvider,
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest'), // No native moderation, fallback to OpenAI
    suggestionsProvider: DefaultGradingProvider,
    synthesizeProvider: DefaultGradingProvider,
  };
};
