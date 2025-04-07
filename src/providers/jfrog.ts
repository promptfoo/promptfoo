import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { createOpenAICompatibleProvider } from './shared/openaiCompatible';

/**
 * Creates a JFrog ML provider using OpenAI-compatible endpoints
 *
 * Documentation: https://jfrog.com/help/r/jfrog-installation-setup/jfrog-ml-model-library-api
 *
 * JFrog ML API supports the OpenAI API format and can be used as a drop-in replacement.
 * All parameters are automatically passed through to the JFrog ML API.
 */
export function createJfrogMlProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions & { baseUrl?: string };
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(1).join(':');
  const baseUrl = options.config?.baseUrl || 'https://models.qwak-prod.qwak.ai/v1';

  return createOpenAICompatibleProvider(
    `jfrog:chat:${modelName}`, // Ensure we use the chat format
    {
      apiBaseUrl: `${baseUrl}/${modelName}`,
      apiKeyEnvar: 'QWAK_TOKEN',
    },
    options,
  );
}
