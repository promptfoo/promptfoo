import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';

/**
 * Creates a Cerebras provider using OpenAI-compatible endpoints
 *
 * Documentation: https://docs.cerebras.ai
 *
 * Cerebras API supports the OpenAI API format and can be used as a drop-in replacement.
 * All parameters are automatically passed through to the Cerebras API.
 */
export function createCerebrasProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');

  const config = options.config?.config || {};
  const cerebrasConfig = {
    ...options,
    config: {
      apiBaseUrl: 'https://api.cerebras.ai/v1',
      apiKeyEnvar: 'CEREBRAS_API_KEY',
      passthrough: {
        ...config,
      },
    },
  };

  if (splits[1] === 'chat') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiChatCompletionProvider(modelName, cerebrasConfig);
  } else if (splits[1] === 'completion') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiCompletionProvider(modelName, cerebrasConfig);
  } else if (splits[1] === 'embedding' || splits[1] === 'embeddings') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiEmbeddingProvider(modelName, cerebrasConfig);
  } else {
    // If no specific type is provided, default to chat
    const modelName = splits.slice(1).join(':');
    return new OpenAiChatCompletionProvider(modelName, cerebrasConfig);
  }
} 