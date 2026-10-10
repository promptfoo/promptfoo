import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { OpenAiImageProvider } from './openai/image';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider } from '../types/index';
import type { OpenAiCompletionOptions, OpenAiSharedOptions } from './openai/types';

/**
 * CometAPI Image Provider - extends OpenAI Image Provider for CometAPI's image generation models
 */
export class CometApiImageProvider extends OpenAiImageProvider {
  constructor(
    modelName: string,
    options: { config?: OpenAiSharedOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiKeyEnvar: options.config?.apiKeyEnvar || 'COMETAPI_KEY',
        apiBaseUrl: 'https://api.cometapi.com/v1',
      },
    });
  }

  getApiKey(): string | undefined {
    if (this.config?.apiKey) {
      return this.config.apiKey;
    }
    const apiKeyEnvar = this.config.apiKeyEnvar || 'COMETAPI_KEY';
    return this.env?.[apiKeyEnvar] || getEnvString(apiKeyEnvar);
  }

  getApiUrlDefault(): string {
    return 'https://api.cometapi.com/v1';
  }
}

/**
 * Factory for creating CometAPI providers using OpenAI-compatible endpoints.
 */
export function createCometApiProvider(
  providerPath: string,
  options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const type = splits[1];
  const modelName = splits.slice(2).join(':');

  const openaiOptions = {
    ...options,
    config: {
      ...(options.config || {}),
      apiBaseUrl: 'https://api.cometapi.com/v1',
      apiKeyEnvar: options.config?.apiKeyEnvar || 'COMETAPI_KEY',
    },
  };

  if (type === 'chat') {
    return new OpenAiChatCompletionProvider(modelName, openaiOptions);
  } else if (type === 'completion') {
    return new OpenAiCompletionProvider(modelName, openaiOptions);
  } else if (type === 'embedding' || type === 'embeddings') {
    return new OpenAiEmbeddingProvider(modelName, openaiOptions);
  } else if (type === 'image') {
    return new CometApiImageProvider(modelName, openaiOptions);
  }

  // Default to chat provider when no type is specified
  const defaultModel = splits.slice(1).join(':');
  return new OpenAiChatCompletionProvider(defaultModel, openaiOptions);
}
