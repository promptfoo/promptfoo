import logger from '../logger';
import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { OpenAiChatCompletionProvider, OpenAiEmbeddingProvider } from './openai';

const knownModels: Record<string, boolean> = {
  // Flagship models (commercial)
  'qwen-max': true,
  'qwen-max-2025-01-25': true,
  'qwen-max-0125': true,
  'qwen-plus': true,
  'qwen-turbo': true,

  // Visual language models
  'qwen-vl-max': true,
  'qwen-vl-plus': true,

  // Qwen 2.5 series
  'qwen2.5-72b-instruct': true,
  'qwen2.5-32b-instruct': true,
  'qwen2.5-14b-instruct': true,
  'qwen2.5-7b-instruct': true,

  // Qwen 2 series
  'qwen2-72b-instruct': true,
  'qwen2-57b-a14b-instruct': true,
  'qwen2-7b-instruct': true,

  // Qwen 1.5 series
  'qwen1.5-110b-chat': true,
  'qwen1.5-72b-chat': true,
  'qwen1.5-32b-chat': true,
  'qwen1.5-14b-chat': true,
  'qwen1.5-7b-chat': true,

  // Embedding models
  'text-embedding-v3': true,
};

export function createAlibabaProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelType = splits[1];
  const modelName = splits.slice(2).join(':');

  // Common config for all Alibaba Cloud models
  const alibabaConfig = {
    ...options,
    config: {
      ...options.config,
      apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      apiKeyEnvar: 'ALICLOUD_API_KEY',
    },
  };

  // Handle different model types
  if (modelType === 'embedding') {
    // Text embedding models
    return new OpenAiEmbeddingProvider(modelName || 'text-embedding-v3', alibabaConfig);
  } else if (modelType === 'vl') {
    // Visual language models
    return new OpenAiChatCompletionProvider(modelName || 'qwen-vl-max', alibabaConfig);
  } else if (modelType === 'chat' || modelType === 'completion') {
    // Chat/completion models
    return new OpenAiChatCompletionProvider(modelName || 'qwen-plus', alibabaConfig);
  } else {
    // If no type specified, check if it's a known model name
    const modelNameOrType = modelType || 'qwen-plus';

    if (!knownModels[modelNameOrType.toLowerCase()]) {
      logger.warn(
        `Unknown Alibaba Cloud model: ${modelNameOrType}. Using default model qwen-plus. Available models include:
         - Flagship: qwen-max, qwen-plus, qwen-turbo
         - Visual: qwen-vl-max, qwen-vl-plus
         - Qwen 2.5: qwen2.5-{72,32,14,7}b-instruct
         - Qwen 2: qwen2-{72,57,7}b-instruct
         - Qwen 1.5: qwen1.5-{110,72,32,14,7}b-chat
         - Embedding: text-embedding-v3`,
      );
    }

    // Route to appropriate provider based on model name prefix
    if (modelNameOrType.startsWith('text-embedding')) {
      return new OpenAiEmbeddingProvider(modelNameOrType, alibabaConfig);
    } else {
      return new OpenAiChatCompletionProvider(modelNameOrType, alibabaConfig);
    }
  }
}
