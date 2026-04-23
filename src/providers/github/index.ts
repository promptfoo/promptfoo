import { OpenAiChatCompletionProvider } from '../openai/chat';

import type { LoadApiProviderContext, ProviderOptions } from '../../types/index';

export function createGitHubProvider(
  providerPath: string,
  providerOptions: ProviderOptions,
  _context: LoadApiProviderContext,
) {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':') || 'openai/gpt-5';
  return new OpenAiChatCompletionProvider(modelName, {
    ...providerOptions,
    config: {
      ...providerOptions.config,
      apiBaseUrl: 'https://models.github.ai/inference',
      apiKeyEnvar: 'GITHUB_TOKEN',
    },
  });
}
