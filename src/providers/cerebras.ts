import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { OpenAiChatCompletionProvider } from './openai/chat';

/**
 * Creates a Cerebras provider using OpenAI-compatible chat endpoints
 *
 * Documentation: https://docs.cerebras.ai
 *
 * Cerebras API supports the OpenAI-compatible chat completion interface.
 * All parameters are automatically passed through to the Cerebras API.
 */
export function createCerebrasProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  const config = options.config?.config || {};
  const cerebrasConfig = {
    ...options,
    config: {
      apiBaseUrl: 'https://api.cerebras.ai/v1',
      apiKeyEnvar: 'CEREBRAS_API_KEY',
      passthrough: {
        ...config,
      },
    },
  };

  return new OpenAiChatCompletionProvider(modelName, cerebrasConfig);
} 