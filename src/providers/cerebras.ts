import { OpenAiChatCompletionProvider } from './openai/chat';
import { splitLocalOptions } from './openai/localOptions';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';

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
  // Only genuine model parameters belong in the request body; promptfoo's own settings
  // (credentials, headers, cost overrides, basePath) stay local.
  const { localOptions, modelParameters } = splitLocalOptions(config);

  // Create a custom provider class that overrides the getOpenAiBody method
  class CerebrasProvider extends OpenAiChatCompletionProvider {
    override getOrganization(): string | undefined {
      return this.config.organization;
    }

    async getOpenAiBody(prompt: string, context?: any, callApiOptions?: any) {
      // Get the body from the parent method
      const { body, config } = await super.getOpenAiBody(prompt, context, callApiOptions);

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
      ...localOptions,
      apiBaseUrl: localOptions.apiBaseUrl || 'https://api.cerebras.ai/v1',
      apiKeyEnvar: localOptions.apiKeyEnvar || 'CEREBRAS_API_KEY',
      passthrough: { ...modelParameters, ...config.passthrough },
    },
  };

  return new CerebrasProvider(modelName, cerebrasConfig);
}
