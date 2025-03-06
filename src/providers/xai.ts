import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import invariant from '../util/invariant';
import { OpenAiChatCompletionProvider } from './openai/chat';

export function createXAIProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions & { region?: string };
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const xaiConfig = {
    ...options,
    config: {
      apiBaseUrl: options.config?.region
        ? `https://${options.config.region}.api.x.ai/v1`
        : 'https://api.x.ai/v1',
      apiKeyEnvar: 'XAI_API_KEY',
      ...options.config,
    },
  };

  const modelName = splits.slice(1).join(':');
  invariant(modelName, 'Model name is required');
  return new OpenAiChatCompletionProvider(modelName, xaiConfig);
}
