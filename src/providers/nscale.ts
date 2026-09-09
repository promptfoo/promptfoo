import { getEnvString } from '../envars';
import { createNscaleImageProvider } from './nscale/image';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { splitLocalOptions } from './openai/util';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';

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

  const getApiKeyEnvar = () => {
    if (config.apiKeyEnvar) {
      return config.apiKeyEnvar;
    }
    // Select a native namespace without copying its credential into config.
    for (const envar of ['NSCALE_SERVICE_TOKEN', 'NSCALE_API_KEY']) {
      if (options.env?.[envar] || getEnvString(envar)) {
        return envar;
      }
    }
    return 'NSCALE_SERVICE_TOKEN';
  };

  const nscaleConfig = {
    ...options,
    config: {
      ...localOptions,
      apiKeyEnvar: getApiKeyEnvar(),
      // Honor an explicit apiBaseUrl (private/regional Nscale endpoints) instead
      // of silently ignoring it while still shipping it in the request body.
      apiBaseUrl: localOptions.apiBaseUrl || 'https://inference.api.nscale.com/v1',
      passthrough: { ...modelParameters, ...config.passthrough },
    },
  };

  if (splits[1] === 'chat') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiChatCompletionProvider(modelName, nscaleConfig);
  } else if (splits[1] === 'completion') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiCompletionProvider(modelName, nscaleConfig);
  } else if (splits[1] === 'embedding' || splits[1] === 'embeddings') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiEmbeddingProvider(modelName, nscaleConfig);
  } else if (splits[1] === 'image') {
    return createNscaleImageProvider(providerPath, {
      config,
      id: options.id,
      env: options.env,
    });
  } else {
    // If no specific type is provided, default to chat
    const modelName = splits.slice(1).join(':');
    return new OpenAiChatCompletionProvider(modelName, nscaleConfig);
  }
}
