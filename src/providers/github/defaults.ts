import { OpenAiChatCompletionProvider } from '../openai/chat';
import { getDefaultRedteamTemperature } from '../redteamDefaults';

import type { EnvOverrides } from '../../types/env';

// GitHub Models default providers
// Using OpenAI-compatible API with GitHub's endpoint
const githubConfig = {
  apiBaseUrl: 'https://models.github.ai/inference',
  apiKeyEnvar: 'GITHUB_TOKEN',
};

export const DefaultGitHubGradingProvider = new OpenAiChatCompletionProvider('openai/gpt-5', {
  config: githubConfig,
});

export const DefaultGitHubGradingJsonProvider = new OpenAiChatCompletionProvider('openai/gpt-5', {
  config: {
    ...githubConfig,
    response_format: { type: 'json_object' },
  },
});

export const DefaultGitHubSuggestionsProvider = new OpenAiChatCompletionProvider('openai/gpt-5', {
  config: githubConfig,
});

function createGitHubRedteamProvider(env?: EnvOverrides) {
  return new OpenAiChatCompletionProvider('openai/gpt-5', {
    config: {
      ...githubConfig,
      temperature: getDefaultRedteamTemperature(env),
    },
  });
}

function createGitHubRedteamJsonProvider(env?: EnvOverrides) {
  return new OpenAiChatCompletionProvider('openai/gpt-5', {
    config: {
      ...githubConfig,
      temperature: getDefaultRedteamTemperature(env),
      response_format: { type: 'json_object' },
    },
  });
}

export const DefaultGitHubRedteamProvider = createGitHubRedteamProvider();

export const DefaultGitHubRedteamJsonProvider = createGitHubRedteamJsonProvider();

export function getGitHubRedteamProviders(env?: EnvOverrides) {
  return {
    redteamProvider: createGitHubRedteamProvider(env),
    redteamJsonProvider: createGitHubRedteamJsonProvider(env),
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
