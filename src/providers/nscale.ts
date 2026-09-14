import { getEnvString } from '../envars';
import { resolveProviderCreatorInput } from './creator';
import { createNscaleImageProvider } from './nscale/image';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { splitLocalOptions } from './openai/localOptions';

import type { ApiProvider } from '../types/index';
import type { ProviderCreatorOptions } from './creator';

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
  options: ProviderCreatorOptions = {},
): ApiProvider {
  const providerOptions = resolveProviderCreatorInput(options);
  const splits = providerPath.split(':');

  const config = providerOptions.config || {};
  const { localOptions, modelParameters } = splitLocalOptions(config);

  const getApiKeyEnvar = () => {
    if (config.apiKeyEnvar) {
      return config.apiKeyEnvar;
    }
    // Select a native namespace without copying its credential into config.
    for (const envar of ['NSCALE_SERVICE_TOKEN', 'NSCALE_API_KEY']) {
      if (providerOptions.env?.[envar] || getEnvString(envar)) {
        return envar;
      }
    }
    return 'NSCALE_SERVICE_TOKEN';
  };

  const nscaleConfig = {
    ...providerOptions,
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
      config: providerOptions.config,
      id: providerOptions.id,
      env: providerOptions.env,
    });
  } else {
    // If no specific type is provided, default to chat
    const modelName = splits.slice(1).join(':');
    return new OpenAiChatCompletionProvider(modelName, nscaleConfig);
  }
}
