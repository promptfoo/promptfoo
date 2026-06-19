import { OpenAiChatCompletionProvider } from '../openai/chat';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';

// GitHub Models default providers
// Using OpenAI-compatible API with GitHub's endpoint
const githubConfig = {
  apiBaseUrl: 'https://models.github.ai/inference',
  apiKeyEnvar: 'GITHUB_TOKEN',
};
const DEFAULT_GITHUB_MODEL = 'openai/gpt-5';

export const DefaultGitHubGradingProvider = new OpenAiChatCompletionProvider(DEFAULT_GITHUB_MODEL, {
  config: githubConfig,
});

export const DefaultGitHubGradingJsonProvider = new OpenAiChatCompletionProvider(
  DEFAULT_GITHUB_MODEL,
  {
    config: {
      ...githubConfig,
      response_format: { type: 'json_object' },
    },
  },
);

export const DefaultGitHubSuggestionsProvider = new OpenAiChatCompletionProvider(
  DEFAULT_GITHUB_MODEL,
  {
    config: githubConfig,
  },
);

export function getGitHubProviders(
  env?: EnvOverrides,
): Pick<DefaultProviders, 'gradingJsonProvider' | 'gradingProvider' | 'suggestionsProvider'> {
  return {
    gradingProvider: new OpenAiChatCompletionProvider(DEFAULT_GITHUB_MODEL, {
      env,
      config: githubConfig,
    }),
    gradingJsonProvider: new OpenAiChatCompletionProvider(DEFAULT_GITHUB_MODEL, {
      env,
      config: {
        ...githubConfig,
        response_format: { type: 'json_object' },
      },
    }),
    suggestionsProvider: new OpenAiChatCompletionProvider(DEFAULT_GITHUB_MODEL, {
      env,
      config: githubConfig,
    }),
  };
}

// Fast model for quick evaluations
export const DefaultGitHubFastProvider = new OpenAiChatCompletionProvider('openai/gpt-5-nano', {
  config: githubConfig,
});

// Balanced model for general use
export const DefaultGitHubBalancedProvider = new OpenAiChatCompletionProvider('openai/gpt-5-mini', {
  config: githubConfig,
});

// Reasoning model for complex evaluations
export const DefaultGitHubReasoningProvider = new OpenAiChatCompletionProvider('openai/o4-mini', {
  config: githubConfig,
});
