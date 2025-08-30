import { OpenAiChatCompletionProvider } from '../openai/chat';

import type { LoadApiProviderContext, ProviderOptions } from '../../types';

export function createGitHubProvider(
  providerPath: string,
  providerOptions: ProviderOptions,
  context: LoadApiProviderContext,
) {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':') || 'openai/gpt-4.1';
  return new OpenAiChatCompletionProvider(modelName, {
    ...providerOptions,
    config: {
      ...providerOptions.config,
      apiBaseUrl: 'https://models.github.ai',
      apiKeyEnvar: 'GITHUB_TOKEN',
    },
  });
}
