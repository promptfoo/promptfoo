import type { ApiProvider, ProviderOptions } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { OpenAiChatCompletionProvider } from '../openai/chat';
import { OpenAiCompletionProvider } from '../openai/completion';
import { OpenAiEmbeddingProvider } from '../openai/embedding';

/**
 * Creates a provider using OpenAI-compatible endpoints
 *
 * This is a shared utility function used by various providers that offer
 * OpenAI-compatible APIs (TogetherAI, Lambda Labs, etc.)
 *
 * @param providerPath The provider path (e.g., "lambdalabs:chat:model-name")
 * @param serviceConfig Service-specific configuration (API URL, environment variable names)
 * @param options Additional provider options
 * @returns An appropriate OpenAI-compatible provider
 */
export function createOpenAICompatibleProvider(
  providerPath: string,
  serviceConfig: {
    apiBaseUrl: string;
    apiKeyEnvar: string;
  },
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');

  const config = options.config?.config || {};
  const providerConfig = {
    ...options,
    config: {
      apiBaseUrl: serviceConfig.apiBaseUrl,
      apiKeyEnvar: serviceConfig.apiKeyEnvar,
      passthrough: {
        ...config,
      },
    },
  };

  if (splits[1] === 'chat') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiChatCompletionProvider(modelName, providerConfig);
  } else if (splits[1] === 'completion') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiCompletionProvider(modelName, providerConfig);
  } else if (splits[1] === 'embedding' || splits[1] === 'embeddings') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiEmbeddingProvider(modelName, providerConfig);
  } else {
    // If no specific type is provided, default to chat
    const modelName = splits.slice(1).join(':');
    return new OpenAiChatCompletionProvider(modelName, providerConfig);
  }
}
