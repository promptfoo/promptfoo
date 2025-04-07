import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { createOpenAICompatibleProvider } from './shared/openaiCompatible';

/**
 * Creates a DeepSeek provider using OpenAI-compatible endpoints
 *
 * Documentation: https://platform.deepseek.com/docs
 *
 * DeepSeek API supports the OpenAI API format and can be used as a drop-in replacement.
 * All parameters are automatically passed through to the DeepSeek API.
 */
export function createDeepSeekProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(1).join(':') || 'deepseek-chat';

  return createOpenAICompatibleProvider(
    `deepseek:chat:${modelName}`,
    {
      apiBaseUrl: 'https://api.deepseek.com/v1',
      apiKeyEnvar: 'DEEPSEEK_API_KEY',
    },
    options,
  );
}
