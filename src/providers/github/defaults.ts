import { OpenAiChatCompletionProvider } from '../openai/chat';

// GitHub Models default providers
// Using OpenAI-compatible API with GitHub's endpoint
const githubConfig = {
  apiBaseUrl: 'https://models.github.ai',
  apiKeyEnvar: 'GITHUB_TOKEN',
};

export const DefaultGitHubGradingProvider = new OpenAiChatCompletionProvider('openai/gpt-5.1', {
  config: githubConfig,
});

export const DefaultGitHubGradingJsonProvider = new OpenAiChatCompletionProvider('openai/gpt-5.1', {
  config: {
    ...githubConfig,
    response_format: { type: 'json_object' },
  },
});

export const DefaultGitHubSuggestionsProvider = new OpenAiChatCompletionProvider('openai/gpt-5.1', {
  config: githubConfig,
});
