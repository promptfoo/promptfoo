import { getEnvString } from '../envars';
import {
  type ApiEmbeddingProvider,
  type ApiProvider,
  type CallApiContextParams,
  type CallApiOptionsParams,
  inheritProviderCapabilities,
  type ProviderOptions,
  type ProviderResponse,
} from '../types/providers';
import { resolveProviderCreatorInput } from './creator';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type { ProviderCreatorOptions } from './creator';
import type { OpenAiCompletionOptions } from './openai/types';

/**
 * Base class for LiteLLM providers that maintains LiteLLM identity
 */
type LiteLLMDelegate =
  | OpenAiChatCompletionProvider
  | OpenAiCompletionProvider
  | OpenAiEmbeddingProvider;

abstract class LiteLLMProviderWrapper<TProvider extends LiteLLMDelegate>
  implements ApiProvider<OpenAiCompletionOptions>
{
  static readonly declaredProviderCapabilities = {
    text: ['callApi'],
    embedding: ['callEmbeddingApi'],
  } as const;
  declare readonly promptfooCapabilities: readonly ('callApi' | 'callEmbeddingApi')[];
  readonly getApiKey: () => string | undefined;
  declare readonly cleanup?: ApiProvider['cleanup'];
  declare readonly validateFunctionToolCall?: OpenAiChatCompletionProvider['validateFunctionToolCall'];

  constructor(
    protected readonly provider: TProvider,
    protected readonly providerType: 'chat' | 'completion' | 'embedding',
    private readonly customId?: string,
  ) {
    this.getApiKey = provider.getApiKey.bind(provider);
    Object.defineProperty(this, 'promptfooCapabilities', {
      value: inheritProviderCapabilities(
        LiteLLMProviderWrapper.declaredProviderCapabilities[
          providerType === 'embedding' ? 'embedding' : 'text'
        ],
      ),
      configurable: true,
      writable: true,
    });
    if ('cleanup' in provider && !('cleanup' in Object.getPrototypeOf(this))) {
      this.cleanup = provider.cleanup.bind(provider);
    }
    if (
      'validateFunctionToolCall' in provider &&
      !('validateFunctionToolCall' in Object.getPrototypeOf(this))
    ) {
      this.validateFunctionToolCall = provider.validateFunctionToolCall.bind(provider);
    }
  }

  get modelName(): string {
    return this.provider.modelName;
  }
  get config(): TProvider['config'] {
    return this.provider.config;
  }

  id(): string {
    const typePrefix = this.providerType === 'chat' ? '' : `:${this.providerType}`;
    return this.customId || `litellm${typePrefix}:${this.modelName}`;
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
      config: { ...this.config, ...(this.getApiKey() && { apiKey: undefined }) },
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    return this.provider.callApi(prompt, context, options);
  }
}

class LiteLLMChatProvider extends LiteLLMProviderWrapper<OpenAiChatCompletionProvider> {
  constructor(modelName: string, options: ProviderOptions = {}) {
    super(new OpenAiChatCompletionProvider(modelName, options), 'chat', options.id);
  }
}

class LiteLLMCompletionProvider extends LiteLLMProviderWrapper<OpenAiCompletionProvider> {
  constructor(modelName: string, options: ProviderOptions) {
    super(new OpenAiCompletionProvider(modelName, options), 'completion', options.id);
  }
}

class LiteLLMEmbeddingProvider
  extends LiteLLMProviderWrapper<OpenAiEmbeddingProvider>
  implements ApiEmbeddingProvider
{
  constructor(modelName: string, options: ProviderOptions) {
    super(new OpenAiEmbeddingProvider(modelName, options), 'embedding', options.id);
  }

  callEmbeddingApi(...args: Parameters<ApiEmbeddingProvider['callEmbeddingApi']>) {
    return this.provider.callEmbeddingApi(...args);
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
  options: ProviderCreatorOptions = {},
): ApiProvider {
  const providerOptions = resolveProviderCreatorInput({
    ...options,
    id: options.config?.id ?? options.id,
  });
  const splits = providerPath.split(':');
  const providerType = splits[1];

  // Extract model name based on provider type
  const modelName = ['chat', 'completion', 'embedding', 'embeddings'].includes(providerType)
    ? splits.slice(2).join(':')
    : splits.slice(1).join(':');

  // Prepare LiteLLM-specific configuration
  const config = providerOptions.config || {};

  // Resolve apiBaseUrl: config > provider env > context env > process env > default
  const resolvedApiBaseUrl =
    config.apiBaseUrl ||
    providerOptions.env?.LITELLM_API_BASE ||
    getEnvString('LITELLM_API_BASE') ||
    'http://0.0.0.0:4000';

  // Build the config object with proper defaults
  // omitDefaults: true ensures temperature/max_tokens are not sent unless explicitly
  // configured, allowing the LiteLLM proxy to apply its own model-specific defaults.
  const litellmConfigDefaults: OpenAiCompletionOptions = {
    apiKeyEnvar: 'LITELLM_API_KEY',
    apiKeyRequired: false,
    apiBaseUrl: resolvedApiBaseUrl,
    omitDefaults: true,
  };

  // Merge configs, with explicit config values taking precedence
  const mergedConfig: OpenAiCompletionOptions = {
    ...litellmConfigDefaults,
    ...Object.fromEntries(Object.entries(config).filter(([, value]) => value != null)),
  };

  // Construct the provider options
  const litellmConfig: ProviderOptions = {
    ...providerOptions,
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
