import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { OpenAiChatCompletionProvider } from '../openai/chat';
import { OpenAiEmbeddingProvider } from '../openai/embedding';
import { OpenAiModerationProvider } from '../openai/moderation';

// GitHub Models default providers
// Using OpenAI-compatible API with GitHub's endpoint
const githubConfig = {
  apiBaseUrl: 'https://models.github.ai',
  apiKeyEnvar: 'GITHUB_TOKEN',
};

export const DefaultGitHubGradingProvider = new OpenAiChatCompletionProvider('openai/gpt-4.1', {
  config: githubConfig,
});

export const DefaultGitHubGradingJsonProvider = new OpenAiChatCompletionProvider('openai/gpt-4.1', {
  config: {
    ...githubConfig,
    response_format: { type: 'json_object' },
  },
});

export const DefaultGitHubSuggestionsProvider = new OpenAiChatCompletionProvider('openai/gpt-4.1', {
  config: githubConfig,
});

// Fast model for quick evaluations
export const DefaultGitHubFastProvider = new OpenAiChatCompletionProvider('openai/gpt-4.1-nano', {
  config: githubConfig,
});

// Balanced model for general use
export const DefaultGitHubBalancedProvider = new OpenAiChatCompletionProvider(
  'openai/gpt-4.1-mini',
  {
    config: githubConfig,
  },
);

// Reasoning model for complex evaluations
export const DefaultGitHubReasoningProvider = new OpenAiChatCompletionProvider('openai/o3-mini', {
  config: githubConfig,
});

/**
 * GitHub Models provider configuration
 */
export const GitHubProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using GitHub Models default providers');

  return {
    datasetGenerationProvider: DefaultGitHubGradingProvider,
    embeddingProvider: new OpenAiEmbeddingProvider('text-embedding-3-large', { env }), // GitHub doesn't support embeddings yet
    gradingJsonProvider: DefaultGitHubGradingJsonProvider,
    gradingProvider: DefaultGitHubGradingProvider,
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest'), // GitHub doesn't have moderation
    suggestionsProvider: DefaultGitHubSuggestionsProvider,
    synthesizeProvider: DefaultGitHubGradingJsonProvider,
  };
};
