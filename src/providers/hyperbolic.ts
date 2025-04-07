import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { createOpenAICompatibleProvider } from './shared/openaiCompatible';

/**
 * Creates a Hyperbolic provider using OpenAI-compatible endpoints
 *
 * Documentation: https://docs.hyperbolic.xyz/
 *
 * Hyperbolic API supports the OpenAI API format and can be used as a drop-in replacement.
 * All parameters are automatically passed through to the Hyperbolic API.
 */
export function createHyperbolicProvider(
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
      apiBaseUrl: 'https://api.hyperbolic.xyz/v1',
      apiKeyEnvar: 'HYPERBOLIC_API_KEY',
    },
    options,
  );
}

// This export is kept for backward compatibility if needed
export class HyperbolicEmbeddingProvider {
  // Placeholder for any necessary embedding functionality
}
