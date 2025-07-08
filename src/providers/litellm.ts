import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import type { OpenAiCompletionOptions } from './openai/types';

type LiteLLMCompletionOptions = OpenAiCompletionOptions;

interface LiteLLMProviderOptions {
  config?: ProviderOptions;
  id?: string;
  env?: EnvOverrides;
}

/**
 * Creates a LiteLLM provider using OpenAI-compatible endpoints
 *
 * LiteLLM supports chat, completion, and embedding models through its proxy server.
 * All parameters are automatically passed through to the LiteLLM API.
 *
 * @example
 * // Chat model (default)
 * createLiteLLMProvider('litellm:gpt-4')
 * createLiteLLMProvider('litellm:chat:gpt-4')
 *
 * // Completion model
 * createLiteLLMProvider('litellm:completion:gpt-3.5-turbo-instruct')
 *
 * // Embedding model
 * createLiteLLMProvider('litellm:embedding:text-embedding-3-large')
 */
export function createLiteLLMProvider(
  providerPath: string,
  options: LiteLLMProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const providerType = splits[1];

  // Extract model name based on provider type
  const modelName = ['chat', 'completion', 'embedding', 'embeddings'].includes(providerType)
    ? splits.slice(2).join(':')
    : splits.slice(1).join(':');

  // Prepare LiteLLM-specific configuration
  const config = options.config?.config || {};
  const litellmConfig: ProviderOptions & { config?: LiteLLMCompletionOptions } = {
    ...options.config,
    config: {
      apiKeyEnvar: 'LITELLM_API_KEY',
      apiKeyRequired: false,
      apiBaseUrl: config.apiBaseUrl || 'http://0.0.0.0:4000',
      ...config,
    },
  };

  // Create the appropriate provider based on type
  switch (providerType) {
    case 'completion':
      return new OpenAiCompletionProvider(modelName, litellmConfig);

    case 'embedding':
    case 'embeddings':
      return new OpenAiEmbeddingProvider(modelName, litellmConfig);

    case 'chat':
      return new OpenAiChatCompletionProvider(modelName, litellmConfig);

    default:
      // Default to chat for backward compatibility (e.g., 'litellm:gpt-4')
      return new OpenAiChatCompletionProvider(modelName, litellmConfig);
  }
}
