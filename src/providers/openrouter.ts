import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { createOpenAICompatibleProvider } from './shared/openaiCompatible';

/**
 * Creates an OpenRouter provider using OpenAI-compatible endpoints
 *
 * Documentation: https://openrouter.ai/docs
 *
 * OpenRouter API supports the OpenAI API format and provides a unified interface
 * to access various models from different providers through a single API.
 * All parameters are automatically passed through to the OpenRouter API.
 */
export function createOpenRouterProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const config = options.config?.config || {};

  return createOpenAICompatibleProvider(
    providerPath,
    {
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEnvar: 'OPENROUTER_API_KEY',
    },
    {
      ...options,
      config: {
        ...options.config,
        passthrough: {
          ...(config.transforms && { transforms: config.transforms }),
          ...(config.models && { models: config.models }),
          ...(config.route && { route: config.route }),
          ...(config.provider && { provider: config.provider }),
          ...(config.passthrough && { passthrough: config.passthrough }),
        },
      },
    },
  );
}
