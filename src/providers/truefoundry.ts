import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';
import type { OpenAiCompletionOptions } from './openai/types';

type TrueFoundryMetadata = Record<string, any>;

type TrueFoundryLoggingConfig = {
  enabled?: boolean;
  [key: string]: any;
};

type TrueFoundryMCPServer = {
  integration_fqn: string;
  enable_all_tools?: boolean;
  tools?: Array<{ name: string }>;
};

type TrueFoundryCompletionOptions = OpenAiCompletionOptions & {
  metadata?: TrueFoundryMetadata;
  loggingConfig?: TrueFoundryLoggingConfig;
  mcp_servers?: TrueFoundryMCPServer[];
  iteration_limit?: number;
};

type TrueFoundryProviderOptions = ProviderOptions & {
  config?: TrueFoundryCompletionOptions;
};

/**
 * TrueFoundry LLM Gateway Provider
 *
 * Provides access to 1000+ LLMs through TrueFoundry's unified gateway with
 * enterprise-grade security, observability, and governance.
 */
export class TrueFoundryProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: TrueFoundryProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'TRUEFOUNDRY_API_KEY',
        apiBaseUrl: providerOptions.config?.apiBaseUrl || 'https://llm-gateway.truefoundry.com',
      },
    });
  }

  /**
   * Override isReasoningModel to correctly detect GPT-5 and other reasoning models
   * despite TrueFoundry's provider-account/model-name format
   */
  protected isReasoningModel(): boolean {
    // Extract the actual model name after the provider prefix (e.g., "openai/gpt-5-nano" -> "gpt-5-nano")
    const actualModelName = this.modelName.split('/').pop() || this.modelName;
    return (
      actualModelName.startsWith('o1') ||
      actualModelName.startsWith('o3') ||
      actualModelName.startsWith('o4') ||
      actualModelName.startsWith('gpt-5')
    );
  }

  /**
   * Override getOpenAiBody to add TrueFoundry-specific headers and body parameters
   */
  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const { body, config } = await super.getOpenAiBody(prompt, context, callApiOptions);

    // Add TrueFoundry-specific headers
    const headers: Record<string, string> = {
      ...config.headers,
    };

    const tfConfig = this.config as TrueFoundryCompletionOptions;

    // Add metadata header if provided
    if (tfConfig.metadata) {
      headers['X-TFY-METADATA'] = JSON.stringify(tfConfig.metadata);
    }

    // Add logging config header if provided
    if (tfConfig.loggingConfig) {
      headers['X-TFY-LOGGING-CONFIG'] = JSON.stringify(tfConfig.loggingConfig);
    }

    // Add TrueFoundry-specific body parameters (MCP servers, iteration limit)
    const tfBody: Record<string, any> = {
      ...body,
    };

    // Remove metadata from body since it's sent as a header in TrueFoundry
    // The parent OpenAI class adds it to the body, but TrueFoundry uses X-TFY-METADATA header
    if (tfConfig.metadata && tfBody.metadata) {
      delete tfBody.metadata;
    }

    if (tfConfig.mcp_servers) {
      tfBody.mcp_servers = tfConfig.mcp_servers;
    }

    if (tfConfig.iteration_limit !== undefined) {
      tfBody.iteration_limit = tfConfig.iteration_limit;
    }

    return {
      body: tfBody,
      config: {
        ...config,
        headers,
      },
    };
  }

  id(): string {
    return `truefoundry:${this.modelName}`;
  }

  toString(): string {
    return `[TrueFoundry Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'truefoundry',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }
}

/**
 * TrueFoundry Embedding Provider
 *
 * Provides embedding capabilities through TrueFoundry's gateway
 */
export class TrueFoundryEmbeddingProvider extends OpenAiEmbeddingProvider {
  constructor(modelName: string, providerOptions: TrueFoundryProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'TRUEFOUNDRY_API_KEY',
        apiBaseUrl: providerOptions.config?.apiBaseUrl || 'https://llm-gateway.truefoundry.com',
      },
    });
  }

  /**
   * Override callEmbeddingApi to add TrueFoundry-specific headers
   */
  async callEmbeddingApi(text: string): Promise<ProviderResponse> {
    const tfConfig = this.config as TrueFoundryCompletionOptions;

    // Add TrueFoundry-specific headers
    const headers: Record<string, string> = {
      ...(this.config.headers || {}),
    };

    if (tfConfig.metadata) {
      headers['X-TFY-METADATA'] = JSON.stringify(tfConfig.metadata);
    }

    if (tfConfig.loggingConfig) {
      headers['X-TFY-LOGGING-CONFIG'] = JSON.stringify(tfConfig.loggingConfig);
    }

    // Temporarily set headers in config
    const originalHeaders = this.config.headers;
    this.config.headers = headers;

    try {
      // Call parent implementation
      return await super.callEmbeddingApi(text);
    } finally {
      // Restore original headers
      this.config.headers = originalHeaders;
    }
  }

  id(): string {
    return `truefoundry:${this.modelName}`;
  }

  toString(): string {
    return `[TrueFoundry Embedding Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'truefoundry',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }
}

/**
 * Creates a TrueFoundry provider
 *
 * @param providerPath - Provider path, e.g., "truefoundry:openai/gpt-4"
 * @param options - Provider options
 * @returns A TrueFoundry provider (chat or embedding based on model type)
 */
export function createTrueFoundryProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ApiProvider | ApiEmbeddingProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  // Determine if this is an embedding model based on model name
  const isEmbeddingModel = modelName.toLowerCase().includes('embedding');

  const providerOptions: TrueFoundryProviderOptions = {
    ...options.config,
    env: options.env,
  };

  if (isEmbeddingModel) {
    return new TrueFoundryEmbeddingProvider(modelName, providerOptions);
  }

  return new TrueFoundryProvider(modelName, providerOptions);
}
