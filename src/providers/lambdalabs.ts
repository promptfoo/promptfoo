import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { createOpenAICompatibleProvider } from './shared/openaiCompatible';

/**
 * Creates a Lambda Labs provider using OpenAI-compatible endpoints
 *
 * Documentation: https://docs.lambdalabs.com/api
 *
 * Lambda Labs API supports the OpenAI API format and can be used as a drop-in replacement.
 * All parameters are automatically passed through to the Lambda Labs API.
 */
export function createLambdaLabsProvider(
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
      apiBaseUrl: 'https://api.lambda.ai/v1',
      apiKeyEnvar: 'LAMBDA_API_KEY',
    },
    options,
  );
}
