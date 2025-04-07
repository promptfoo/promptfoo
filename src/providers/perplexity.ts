import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { createOpenAICompatibleProvider } from './shared/openaiCompatible';

/**
 * Creates a Perplexity AI provider using OpenAI-compatible endpoints
 *
 * Documentation: https://docs.perplexity.ai/
 *
 * Perplexity AI API supports the OpenAI API format and provides search-augmented models
 * with citation capabilities.
 * All parameters are automatically passed through to the Perplexity AI API.
 */
export function createPerplexityProvider(
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
      apiBaseUrl: 'https://api.perplexity.ai',
      apiKeyEnvar: 'PERPLEXITY_API_KEY',
    },
    options,
  );
}
