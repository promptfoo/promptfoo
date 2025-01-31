import type { ProviderOptions } from '../types';
import { OpenAiChatCompletionProvider, OpenAiEmbeddingProvider } from './openai';

const KNOWN_MODELS = new Set([
  // Flagship models
  'qwen-max',
  'qwen-max-latest',
  'qwen-max-2025-01-25',
  'qwen-plus',
  'qwen-plus-latest',
  'qwen-plus-2025-01-25',
  'qwen-turbo',
  'qwen-turbo-latest',
  'qwen-turbo-2024-11-01',
  // Visual models
  'qwen-vl-max',
  'qwen-vl-plus',
  'qwen2.5-vl-72b-instruct',
  'qwen2.5-vl-7b-instruct',
  'qwen2.5-vl-3b-instruct',
  // Qwen 2.5 models
  'qwen2.5-7b-instruct-1m',
  'qwen2.5-14b-instruct-1m',
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

export class AlibabaChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, options: ProviderOptions = {}) {
    if (!modelName || !KNOWN_MODELS.has(modelName)) {
      throw new Error(
        `Invalid Alibaba Cloud model: ${modelName}. Available models: ${Array.from(KNOWN_MODELS).join(', ')}`,
      );
    }

    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiBaseUrl: API_BASE_URL,
        apiKeyEnvar: 'DASHSCOPE_API_KEY',
      },
    });
  }
}

export class AlibabaEmbeddingProvider extends OpenAiEmbeddingProvider {
  constructor(modelName: string, options: ProviderOptions = {}) {
    if (!modelName || !KNOWN_MODELS.has(modelName)) {
      throw new Error(
        `Invalid Alibaba Cloud model: ${modelName}. Available models: ${Array.from(KNOWN_MODELS).join(', ')}`,
      );
    }

    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiBaseUrl: API_BASE_URL,
        apiKeyEnvar: 'DASHSCOPE_API_KEY',
      },
    });
  }
}
