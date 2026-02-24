import { OpenAiChatCompletionProvider } from '../openai/chat';

import type { LoadApiProviderContext, ProviderOptions } from '../../types/index';

class GitHubChatCompletionProvider extends OpenAiChatCompletionProvider {
  protected override getGenAISystem(): string {
    return 'github';
  }
}

export function createGitHubProvider(
  providerPath: string,
  providerOptions: ProviderOptions,
  _context: LoadApiProviderContext,
) {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':') || 'openai/gpt-5';
  return new GitHubChatCompletionProvider(modelName, {
    ...providerOptions,
    config: {
      ...providerOptions.config,
      apiBaseUrl: 'https://models.github.ai/inference',
      apiKeyEnvar: 'GITHUB_TOKEN',
    },
  });
}
