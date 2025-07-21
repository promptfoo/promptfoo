import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type { EnvOverrides } from '../types/env';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';
import type { OpenAiCompletionOptions } from './openai/types';

type LiteLLMCompletionOptions = OpenAiCompletionOptions;

interface LiteLLMProviderOptions {
  config?: ProviderOptions;
  id?: string;
  env?: EnvOverrides;
}

/**
 * Base class for LiteLLM providers that maintains LiteLLM identity
 */
abstract class LiteLLMProviderWrapper implements ApiProvider {
  protected provider: ApiProvider;
  protected providerType: string;

  constructor(provider: ApiProvider, providerType: string) {
    this.provider = provider;
    this.providerType = providerType;
  }

  get modelName(): string {
    return (this.provider as any).modelName;
  }

  get config(): any {
    return (this.provider as any).config;
  }

  id(): string {
    const typePrefix = this.providerType === 'chat' ? '' : `:${this.providerType}`;
    return `litellm${typePrefix}:${this.modelName}`;
  }

  toString(): string {
    const typeStr = this.providerType === 'chat' ? '' : ` ${this.providerType}`;
    return `[LiteLLM Provider${typeStr} ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'litellm',
      model: this.modelName,
      type: this.providerType,
      config: {
        ...this.config,
        ...(this.getApiKey && this.getApiKey() && { apiKey: undefined }),
      },
    };
  }

  // Delegate all other methods to the wrapped provider
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    return this.provider.callApi(prompt, context, options);
  }

  getApiKey?: () => string | undefined;
}

/**
 * LiteLLM Chat Provider
 */
class LiteLLMChatProvider extends LiteLLMProviderWrapper {
  constructor(modelName: string, options: ProviderOptions) {
    const provider = new OpenAiChatCompletionProvider(modelName, options);
    super(provider, 'chat');
    // Bind getApiKey if it exists
    if (provider.getApiKey) {
      this.getApiKey = provider.getApiKey.bind(provider);
    }
  }
}

/**
 * LiteLLM Completion Provider
 */
class LiteLLMCompletionProvider extends LiteLLMProviderWrapper {
  constructor(modelName: string, options: ProviderOptions) {
    const provider = new OpenAiCompletionProvider(modelName, options);
    super(provider, 'completion');
    if (provider.getApiKey) {
      this.getApiKey = provider.getApiKey.bind(provider);
    }
  }
}

/**
 * LiteLLM Embedding Provider
 */
class LiteLLMEmbeddingProvider extends LiteLLMProviderWrapper implements ApiEmbeddingProvider {
  private embeddingProvider: OpenAiEmbeddingProvider;

  constructor(modelName: string, options: ProviderOptions) {
    const provider = new OpenAiEmbeddingProvider(modelName, options);
    super(provider, 'embedding');
    this.embeddingProvider = provider;
    if (provider.getApiKey) {
      this.getApiKey = provider.getApiKey.bind(provider);
    }
  }

  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    return this.embeddingProvider.callEmbeddingApi(text);
  }
}

// For backward compatibility, export the chat provider as LiteLLMProvider
export class LiteLLMProvider extends LiteLLMChatProvider {}

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

  // Build the config object with proper defaults
  const litellmConfigDefaults: LiteLLMCompletionOptions = {
    apiKeyEnvar: 'LITELLM_API_KEY',
    apiKeyRequired: false,
    apiBaseUrl: 'http://0.0.0.0:4000',
  };

  // Merge configs, with explicit config values taking precedence
  const mergedConfig: LiteLLMCompletionOptions = {
    ...litellmConfigDefaults,
  };

  // Only override properties that are actually defined and not null in config
  Object.keys(config).forEach((key) => {
    if (config[key] !== undefined && config[key] !== null) {
      (mergedConfig as any)[key] = config[key];
    }
  });

  // Construct the provider options
  const litellmConfig: ProviderOptions = {
    id: options.config?.id,
    label: options.config?.label,
    prompts: options.config?.prompts,
    transform: options.config?.transform,
    delay: options.config?.delay,
    env: options.config?.env,
    config: mergedConfig,
  };

  // Create the appropriate provider based on type
  switch (providerType) {
    case 'completion':
      return new LiteLLMCompletionProvider(modelName, litellmConfig);

    case 'embedding':
    case 'embeddings':
      return new LiteLLMEmbeddingProvider(modelName, litellmConfig);

    case 'chat':
      return new LiteLLMProvider(modelName, litellmConfig);

    default:
      // Default to chat for backward compatibility (e.g., 'litellm:gpt-4')
      return new LiteLLMProvider(modelName, litellmConfig);
  }
}
