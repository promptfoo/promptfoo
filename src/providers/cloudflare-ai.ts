import type { ProviderOptions } from '../types';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiEmbeddingProvider } from './openai/embedding';

const KNOWN_MODELS = new Set([
  // Embedding models
  '@cf/baai/bge-base-en-v1.5',
  '@cf/baai/bge-large-en-v1.5',
  '@cf/baai/bge-small-en-v1.5',

  // Text generation models - Gemma series
  '@cf/google/gemma-2b-it-lora',
  '@cf/google/gemma-7b-it',
  '@cf/google/gemma-7b-it-lora',

  // Text generation models - Llama 2 series
  '@cf/meta/llama-2-13b-chat-awq',
  '@cf/meta/llama-2-70b-chat-fp16',
  '@cf/meta/llama-2-70b-chat-int8',
  '@cf/meta/llama-2-7b-chat-fp16',
  '@cf/meta/llama-2-7b-chat-hf-lora',
  '@cf/meta/llama-2-7b-chat-int8',

  // Text generation models - Llama 3.0 series
  '@cf/meta/llama-3-8b-instruct',
  '@cf/meta/llama-3-8b-instruct-awq',

  // Text generation models - Llama 3.1 series
  '@cf/meta/llama-3.1-70b-instruct',
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-awq',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/meta/llama-3.1-8b-instruct-fp8',

  // Text generation models - Llama 3.2 series
  '@cf/meta/llama-3.2-11b-vision-instruct',
  '@cf/meta/llama-3.2-1b-instruct',
  '@cf/meta/llama-3.2-3b-instruct',

  // Text generation models - Llama 3.3 series
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',

  // Text generation models - Mistral series
  '@cf/mistralai/mistral-7b-instruct-v0.1',
  '@cf/mistralai/mistral-7b-instruct-v0.2',
  '@cf/mistralai/mistral-7b-instruct-v0.2-lora',

  // Text generation models - Other notable models
  '@cf/microsoft/phi-2',
  '@cf/nexusflow/starling-lm-7b-beta',
  '@cf/openchat/openchat-3.5-0106',
  '@cf/qwen/qwen1.5-14b-chat-awq',
  '@cf/qwen/qwen1.5-7b-chat-awq',
  '@cf/defog/sqlcoder-7b-2',
]);

export type ICloudflareProviderBaseConfig = {
  accountId?: string;
  accountIdEnvar?: string;
  apiKey?: string;
  apiKeyEnvar?: string;
  apiBaseUrl?: string;
};

export class CloudflareChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, options: ProviderOptions = {}) {
    if (!modelName || !KNOWN_MODELS.has(modelName)) {
      throw new Error(
        `Invalid Cloudflare model: ${modelName}. Available models: ${Array.from(KNOWN_MODELS).join(', ')}`,
      );
    }

    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiBaseUrl:
          options.config?.apiBaseUrl ||
          `https://api.cloudflare.com/client/v4/accounts/${options.config?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        apiKeyEnvar: 'CLOUDFLARE_API_KEY',
      },
    });
  }
}

export class CloudflareEmbeddingProvider extends OpenAiEmbeddingProvider {
  constructor(modelName: string, options: ProviderOptions = {}) {
    if (!modelName || !KNOWN_MODELS.has(modelName)) {
      throw new Error(
        `Invalid Cloudflare model: ${modelName}. Available models: ${Array.from(KNOWN_MODELS).join(', ')}`,
      );
    }

    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiBaseUrl:
          options.config?.apiBaseUrl ||
          `https://api.cloudflare.com/client/v4/accounts/${options.config?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        apiKeyEnvar: 'CLOUDFLARE_API_KEY',
      },
    });
  }
}
