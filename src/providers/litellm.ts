import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import type { OpenAiCompletionOptions } from './openai/types';

type LiteLLMCompletionOptions = OpenAiCompletionOptions;

type LiteLLMProviderOptions = ProviderOptions & {
  config?: LiteLLMCompletionOptions;
};

// Legacy provider class for backward compatibility
export class LiteLLMProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: LiteLLMProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'LITELLM_API_KEY',
        apiKeyRequired: false,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || 'http://0.0.0.0:4000',
      },
    });
  }

  id(): string {
    return `litellm:${this.modelName}`;
  }

  toString(): string {
    return `[LiteLLM Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'litellm',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.getApiKey() && { apiKey: undefined }),
      },
    };
  }
}

// Alias for backward compatibility
export class LiteLLMChatProvider extends LiteLLMProvider {}

/**
 * Creates a LiteLLM provider using OpenAI-compatible endpoints
 *
 * LiteLLM supports chat, completion, and embedding models through its proxy server.
 * All parameters are automatically passed through to the LiteLLM API.
 */
export function createLiteLLMProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');

  const config = options.config?.config || {};
  const litellmConfig = {
    ...options,
    config: {
      apiKeyEnvar: 'LITELLM_API_KEY',
      apiKeyRequired: false,
      apiBaseUrl: config.apiBaseUrl || 'http://0.0.0.0:4000',
      ...config,
    },
  };

  if (splits[1] === 'chat') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiChatCompletionProvider(modelName, litellmConfig);
  } else if (splits[1] === 'completion') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiCompletionProvider(modelName, litellmConfig);
  } else if (splits[1] === 'embedding' || splits[1] === 'embeddings') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiEmbeddingProvider(modelName, litellmConfig);
  } else {
    // If no specific type is provided, default to chat for backward compatibility
    const modelName = splits.slice(1).join(':');
    return new LiteLLMChatProvider(modelName, litellmConfig);
  }
}
