import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type { ProviderOptions } from '../types/index';

const KNOWN_MODELS = new Set([
  // Qwen3-Max
  'qwen3-max',
  'qwen3-max-2025-09-23',
  'qwen3-max-preview',

  // Qwen-Max
  'qwen-max',
  'qwen-max-latest',
  'qwen-max-2025-01-25',

  // Qwen-Plus
  'qwen-plus',
  'qwen-plus-latest',
  'qwen-plus-2025-09-11',
  'qwen-plus-2025-07-28',
  'qwen-plus-2025-07-14',
  'qwen-plus-2025-04-28',
  'qwen-plus-2025-01-25',

  // Qwen-Flash
  'qwen-flash',
  'qwen-flash-2025-07-28',

  // Qwen-Turbo
  'qwen-turbo',
  'qwen-turbo-latest',
  'qwen-turbo-2025-04-28',
  'qwen-turbo-2024-11-01',

  // QwQ
  'qwq-plus',

  // Qwen-Long
  'qwen-long-latest',
  'qwen-long-2025-01-25',

  // Qwen-Omni
  'qwen3-omni-flash',
  'qwen3-omni-flash-2025-09-15',

  // Qwen-Omni-Realtime
  'qwen3-omni-flash-realtime',
  'qwen3-omni-flash-realtime-2025-09-15',

  // QVQ
  'qvq-max',
  'qvq-max-latest',
  'qvq-max-2025-03-25',

  // Qwen3-VL-Plus
  'qwen3-vl-plus',
  'qwen3-vl-plus-2025-09-23',

  // Qwen3-VL-Flash
  'qwen3-vl-flash',
  'qwen3-vl-flash-2025-10-15',

  // Qwen-VL-OCR
  'qwen-vl-ocr',

  // Qwen3-ASR
  'qwen3-asr-flash',
  'qwen3-asr-flash-2025-09-08',

  // Qwen3-ASR-Realtime
  'qwen3-asr-flash-realtime',
  'qwen3-asr-flash-realtime-2025-10-27',

  // Qwen-Math
  'qwen-math-plus',
  'qwen-math-plus-latest',
  'qwen-math-plus-2024-09-19',
  'qwen-math-plus-2024-08-16',
  'qwen-math-turbo',
  'qwen-math-turbo-latest',
  'qwen-math-turbo-2024-09-19',

  // Qwen3-Coder-Plus
  'qwen3-coder-plus',
  'qwen3-coder-plus-2025-09-23',
  'qwen3-coder-plus-2025-07-22',

  // Qwen3-Coder-Flash
  'qwen3-coder-flash',
  'qwen3-coder-flash-2025-07-28',

  // Qwen-MT
  'qwen-mt-plus',
  'qwen-mt-turbo',

  // Qwen data mining
  'qwen-doc-turbo',

  // Qwen deep research
  'qwen-deep-research',

  // Qwen3 open-source
  'qwen3-next-80b-a3b-thinking',
  'qwen3-next-80b-a3b-instruct',
  'qwen3-235b-a22b-thinking-2507',
  'qwen3-235b-a22b-instruct-2507',
  'qwen3-30b-a3b-thinking-2507',
  'qwen3-30b-a3b-instruct-2507',
  'qwen3-235b-a22b',
  'qwen3-32b',
  'qwen3-30b-a3b',
  'qwen3-14b',
  'qwen3-8b',
  'qwen3-4b',
  'qwen3-1.7b',
  'qwen3-0.6b',

  // QwQ open-source
  'qwq-32b',
  'qwq-32b-preview',

  // QVQ open-source
  'qvq-72b-preview',

  // Qwen2.5-Omni
  'qwen2.5-omni-7b',

  // Qwen3-Omni-Captioner
  'qwen3-omni-30b-a3b-captioner',

  // Qwen3-VL open-source
  'qwen3-vl-30b-a3b-thinking',
  'qwen3-vl-30b-a3b-instruct',
  'qwen3-vl-235b-a22b-thinking',
  'qwen3-vl-235b-a22b-instruct',
  'qwen3-vl-32b-thinking',
  'qwen3-vl-32b-instruct',
  'qwen3-vl-8b-thinking',
  'qwen3-vl-8b-instruct',

  // Qwen2.5-Math
  'qwen2.5-math-72b-instruct',
  'qwen2.5-math-7b-instruct',
  'qwen2.5-math-1.5b-instruct',

  // Qwen3-Coder open-source
  'qwen3-coder-480b-a35b-instruct',
  'qwen3-coder-30b-a3b-instruct',

  // DeepSeek
  'deepseek-v3.2-exp',
  'deepseek-v3.1',
  'deepseek-r1',
  'deepseek-r1-0528',
  'deepseek-v3',
  'deepseek-r1-distill-qwen-1.5b',
  'deepseek-r1-distill-qwen-7b',
  'deepseek-r1-distill-qwen-14b',
  'deepseek-r1-distill-qwen-32b',
  'deepseek-r1-distill-llama-8b',
  'deepseek-r1-distill-llama-70b',

  // Kimi
  'moonshot-kimi-k2-instruct',

  // Image generation
  'qwen-image-plus',

  // Embedding models
  'text-embedding-v3',
  'text-embedding-v4',
]);

const API_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export class AlibabaChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, options: ProviderOptions = {}) {
    if (!modelName) {
      throw new Error('Alibaba modelName is required');
    }
    if (!KNOWN_MODELS.has(modelName)) {
      logger.warn(
        `Unknown Alibaba Cloud model: ${modelName}. Known models: ${Array.from(KNOWN_MODELS).join(', ')}`,
      );
    }

    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiBaseUrl: options.config?.apiBaseUrl ?? API_BASE_URL,
        apiKeyEnvar: 'DASHSCOPE_API_KEY',
      },
    });
  }
}

export class AlibabaEmbeddingProvider extends OpenAiEmbeddingProvider {
  constructor(modelName: string, options: ProviderOptions = {}) {
    if (!modelName) {
      throw new Error('Alibaba modelName is required');
    }
    if (!KNOWN_MODELS.has(modelName)) {
      logger.warn(
        `Unknown Alibaba Cloud model: ${modelName}. Known models: ${Array.from(KNOWN_MODELS).join(', ')}`,
      );
    }

    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiBaseUrl: options.config?.apiBaseUrl ?? API_BASE_URL,
        apiKeyEnvar: 'DASHSCOPE_API_KEY',
      },
    });
  }
}
