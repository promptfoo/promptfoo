import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { createOpenAICompatibleProvider } from './shared/openaiCompatible';

/**
 * Creates a Groq provider using OpenAI-compatible endpoints
 *
 * Documentation: https://console.groq.com/docs/quickstart
 *
 * Groq API supports the OpenAI API format and can be used as a drop-in replacement.
 * All parameters are automatically passed through to the Groq API.
 */
export function createGroqProvider(
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
      apiBaseUrl: 'https://api.groq.com/openai/v1',
      apiKeyEnvar: 'GROQ_API_KEY',
    },
    options,
  );
}
