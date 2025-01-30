import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { OpenAiChatCompletionProvider, OpenAiEmbeddingProvider } from './openai';

const KNOWN_MODELS = new Set([
  // Flagship models
  'qwen-max',
  'qwen-max-2025-01-25',
  'qwen-max-0125',
  'qwen-plus',
  'qwen-turbo',
  // Visual models
  'qwen-vl-max',
  'qwen-vl-plus',
  // Qwen 2.5 models
  'qwen2.5-72b-instruct',
  'qwen2.5-32b-instruct',
  'qwen2.5-14b-instruct',
  'qwen2.5-7b-instruct',
  // Qwen 2 models
  'qwen2-72b-instruct',
  'qwen2-57b-a14b-instruct',
  'qwen2-7b-instruct',
  // Qwen 1.5 models
  'qwen1.5-110b-chat',
  'qwen1.5-72b-chat',
  'qwen1.5-32b-chat',
  'qwen1.5-14b-chat',
  'qwen1.5-7b-chat',
  // Embedding models
  'text-embedding-v3',
]);

const API_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export function createAlibabaProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const [, modelType, ...modelParts] = providerPath.split(':');
  const modelName = modelParts.join(':');

  const alibabaConfig = {
    ...options,
    config: {
      ...options.config,
      apiBaseUrl: API_BASE_URL,
      apiKeyEnvar: 'ALICLOUD_API_KEY',
    },
  };

  const finalModelName = modelName || modelType;
  if (!finalModelName || !KNOWN_MODELS.has(finalModelName)) {
    throw new Error(
      `Invalid Alibaba Cloud model: ${finalModelName}. Available models: ${Array.from(KNOWN_MODELS).join(', ')}`,
    );
  }

  if (finalModelName.startsWith('text-embedding')) {
    return new OpenAiEmbeddingProvider(finalModelName, alibabaConfig);
  }

  return new OpenAiChatCompletionProvider(finalModelName, alibabaConfig);
}
