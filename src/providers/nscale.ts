import { getEnvString } from '../envars';
import { resolveProviderCreatorInput, splitOpenAiCompatibleConfig } from './creator';
import { createNscaleImageProvider } from './nscale/image';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';

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
  const { providerOptions, parsedPath } = resolveProviderCreatorInput(providerPath, options);
  const splits = parsedPath.segments;

  const config = providerOptions.config || {};

  const { providerOptions: providerLevelOptions, passthrough } =
    splitOpenAiCompatibleConfig(config);

  // Prefer service tokens over API keys (API keys deprecated Oct 30, 2025)
  const getApiKey = () => {
    return (
      config.apiKey ||
      providerOptions.env?.NSCALE_SERVICE_TOKEN ||
      getEnvString('NSCALE_SERVICE_TOKEN') ||
      providerOptions.env?.NSCALE_API_KEY ||
      getEnvString('NSCALE_API_KEY')
    );
  };

  const nscaleConfig = {
    ...providerOptions,
    config: {
      ...providerLevelOptions,
      // Honor an explicit apiBaseUrl (private/regional Nscale endpoints) instead
      // of silently ignoring it while still shipping it in the request body.
      apiBaseUrl: providerLevelOptions.apiBaseUrl || 'https://inference.api.nscale.com/v1',
      apiKey: getApiKey(),
      passthrough,
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
