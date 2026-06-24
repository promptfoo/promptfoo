import { OpenAiChatCompletionProvider } from '../openai/chat';

// GitHub Models default providers
// Using OpenAI-compatible API with GitHub's endpoint
const githubConfig = {
  apiBaseUrl: 'https://models.github.ai/inference',
  apiKeyEnvar: 'GITHUB_TOKEN',
};

export const DefaultGitHubGradingProvider = new OpenAiChatCompletionProvider('openai/gpt-5', {
  genAIProviderName: 'github',
  config: githubConfig,
});

export const DefaultGitHubGradingJsonProvider = new OpenAiChatCompletionProvider('openai/gpt-5', {
  genAIProviderName: 'github',
  config: {
    ...githubConfig,
    response_format: { type: 'json_object' },
  },
});

export const DefaultGitHubSuggestionsProvider = new OpenAiChatCompletionProvider('openai/gpt-5', {
  genAIProviderName: 'github',
  config: githubConfig,
});

// Fast model for quick evaluations
export const DefaultGitHubFastProvider = new OpenAiChatCompletionProvider('openai/gpt-5-nano', {
  genAIProviderName: 'github',
  config: githubConfig,
});

// Balanced model for general use
export const DefaultGitHubBalancedProvider = new OpenAiChatCompletionProvider('openai/gpt-5-mini', {
  genAIProviderName: 'github',
  config: githubConfig,
});

// Reasoning model for complex evaluations
export const DefaultGitHubReasoningProvider = new OpenAiChatCompletionProvider('openai/o4-mini', {
  genAIProviderName: 'github',
  config: githubConfig,
});
