import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import invariant from '../util/invariant';
import { OpenAiChatCompletionProvider } from './openai/chat';

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
