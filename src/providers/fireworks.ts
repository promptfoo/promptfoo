import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { createOpenAICompatibleProvider } from './shared/openaiCompatible';

/**
 * Creates a Fireworks AI provider using OpenAI-compatible endpoints
 *
 * Documentation: https://docs.fireworks.ai/api/inference
 *
 * Fireworks AI API supports the OpenAI API format and can be used as a drop-in replacement.
 * All parameters are automatically passed through to the Fireworks AI API.
 */
export function createFireworksProvider(
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
      apiBaseUrl: 'https://api.fireworks.ai/inference/v1',
      apiKeyEnvar: 'FIREWORKS_API_KEY',
    },
    options,
  );
}

// This export is kept for backward compatibility if needed
export class FireworksProvider {
  // Placeholder for any necessary backward compatibility
}
