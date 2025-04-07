import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { createOpenAICompatibleProvider } from './shared/openaiCompatible';

/**
 * Creates a TogetherAI provider using OpenAI-compatible endpoints
 *
 * TogetherAI supports many parameters beyond standard OpenAI ones.
 * All parameters are automatically passed through to the TogetherAI API.
 */
export function createTogetherAiProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  return createOpenAICompatibleProvider(
    providerPath,
    {
      apiBaseUrl: 'https://api.together.xyz/v1',
      apiKeyEnvar: 'TOGETHER_API_KEY',
    },
    options,
  );
}
