import { OpenAiChatCompletionProvider } from './openai/chat';

import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';

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

  // Filter out basePath from config to avoid passing it to the API
  const { basePath: _, ...configWithoutBasePath } = options.config?.config || {};

  // Create a custom provider class that overrides the getOpenAiBody method
  class CerebrasProvider extends OpenAiChatCompletionProvider {
    getOpenAiBody(prompt: string, context?: any, callApiOptions?: any) {
      // Get the body from the parent method
      const { body, config } = super.getOpenAiBody(prompt, context, callApiOptions);

      // Cerebras API doesn't support both max_tokens and max_completion_tokens
      // If max_completion_tokens is set, use it and remove max_tokens
      if (body.max_completion_tokens) {
        delete body.max_tokens;
      }

      return { body, config };
    }
  }

  const cerebrasConfig = {
    ...options,
    config: {
      apiBaseUrl: 'https://api.cerebras.ai/v1',
      apiKeyEnvar: 'CEREBRAS_API_KEY',
      passthrough: {
        ...configWithoutBasePath,
      },
    },
  };

  return new CerebrasProvider(modelName, cerebrasConfig);
}
