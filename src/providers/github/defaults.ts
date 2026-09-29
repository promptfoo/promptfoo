import { OpenAiChatCompletionProvider } from '../openai/chat';
import { GITHUB_MODELS_RETIREMENT_MESSAGE } from './index';

class RetiredGitHubProvider extends OpenAiChatCompletionProvider {
  async callApi(
    ..._args: Parameters<OpenAiChatCompletionProvider['callApi']>
  ): ReturnType<OpenAiChatCompletionProvider['callApi']> {
    return { error: GITHUB_MODELS_RETIREMENT_MESSAGE };
  }
}

// Preserve the exported provider objects for existing consumers, but never call the retired API.
const githubConfig = {
  apiBaseUrl: 'https://models.github.ai/inference',
  apiKeyEnvar: 'GITHUB_TOKEN',
};

export const DefaultGitHubGradingProvider = new RetiredGitHubProvider('openai/gpt-5', {
  config: githubConfig,
});
export const DefaultGitHubGradingJsonProvider = new RetiredGitHubProvider('openai/gpt-5', {
  config: { ...githubConfig, response_format: { type: 'json_object' } },
});
export const DefaultGitHubSuggestionsProvider = new RetiredGitHubProvider('openai/gpt-5', {
  config: githubConfig,
});
