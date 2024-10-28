import invariant from 'tiny-invariant';
import type { ApiProvider, ProviderOptions, EnvOverrides } from '../types';
import { OpenAiChatCompletionProvider } from './openai';

export function createXAIProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const xaiConfig = {
    ...options,
    config: {
      ...options.config,
      apiBaseUrl: 'https://api.x.ai/v1',
      apiKeyEnvar: 'XAI_API_KEY',
    },
  };

  const modelName = splits.slice(1).join(':');
  invariant(modelName, 'Model name is required');
  return new OpenAiChatCompletionProvider(modelName, xaiConfig);
}
