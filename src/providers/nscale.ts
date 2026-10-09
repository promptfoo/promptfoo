import { resolveProviderApiKey } from './credentials';
import { createNscaleImageProvider } from './nscale/image';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { splitLocalOptions } from './openai/localOptions';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiSharedOptions } from './openai/types';

function withNscaleCredentials(
  provider: OpenAiChatCompletionProvider | OpenAiCompletionProvider | OpenAiEmbeddingProvider,
): ApiProvider {
  return Object.assign(provider, {
    getApiKey(config: OpenAiSharedOptions = provider.config): string | undefined {
      return resolveProviderApiKey(config, provider.env, [
        'NSCALE_SERVICE_TOKEN',
        'NSCALE_API_KEY',
      ]);
    },
    getMissingApiKeyErrorMessage(config: OpenAiSharedOptions = provider.config): string {
      return `API key is not set. Set the ${config.apiKeyEnvar || 'NSCALE_SERVICE_TOKEN'} environment variable or add \`apiKey\` to the provider config.`;
    },
  });
}

/**
 * Creates an Nscale provider using OpenAI-compatible endpoints
 *
 * Nscale provides serverless AI inference with OpenAI-compatible API endpoints.
 * All parameters are automatically passed through to the Nscale API.
 *
 * Documentation: https://docs.nscale.com/
 */
export function createNscaleProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');

  const config = options.config?.config || {};
  const { localOptions, modelParameters } = splitLocalOptions(config);

  const nscaleConfig = {
    ...options,
    config: {
      ...localOptions,
      // Honor an explicit apiBaseUrl (private/regional Nscale endpoints) instead
      // of silently ignoring it while still shipping it in the request body.
      apiBaseUrl: localOptions.apiBaseUrl || 'https://inference.api.nscale.com/v1',
      passthrough: { ...modelParameters, ...config.passthrough },
    },
  };

  if (splits[1] === 'chat') {
    const modelName = splits.slice(2).join(':');
    return withNscaleCredentials(new OpenAiChatCompletionProvider(modelName, nscaleConfig));
  } else if (splits[1] === 'completion') {
    const modelName = splits.slice(2).join(':');
    return withNscaleCredentials(new OpenAiCompletionProvider(modelName, nscaleConfig));
  } else if (splits[1] === 'embedding' || splits[1] === 'embeddings') {
    const modelName = splits.slice(2).join(':');
    return withNscaleCredentials(new OpenAiEmbeddingProvider(modelName, nscaleConfig));
  } else if (splits[1] === 'image') {
    return createNscaleImageProvider(providerPath, {
      config,
      id: options.id,
      env: options.env,
    });
  } else {
    // If no specific type is provided, default to chat
    const modelName = splits.slice(1).join(':');
    return withNscaleCredentials(new OpenAiChatCompletionProvider(modelName, nscaleConfig));
  }
}
