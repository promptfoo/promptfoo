import type { EnvVarKey } from '../envars';
import { getEnvString } from '../envars';
import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import invariant from '../util/invariant';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import type { OpenAiCompletionOptions } from './openai/types';

export interface CloudflareAiConfig extends OpenAiCompletionOptions {
  accountId?: string;
  accountIdEnvar?: string;
  apiKey?: string;
  apiKeyEnvar?: string;
  apiBaseUrl?: string;
}

export interface CloudflareAiProviderOptions extends ProviderOptions {
  config?: CloudflareAiConfig;
}

function getCloudflareApiConfig(
  config?: CloudflareAiConfig,
  env?: EnvOverrides,
): { accountId: string; apiToken: string } {
  const apiTokenCandidate =
    config?.apiKey ||
    (config?.apiKeyEnvar
      ? getEnvString(config.apiKeyEnvar as EnvVarKey) ||
        env?.[config.apiKeyEnvar as keyof EnvOverrides]
      : undefined) ||
    env?.CLOUDFLARE_API_KEY ||
    getEnvString('CLOUDFLARE_API_KEY');

  invariant(
    apiTokenCandidate,
    'Cloudflare API token required. Supply it via config apiKey or apiKeyEnvar, or the CLOUDFLARE_API_KEY environment variable',
  );

  const accountIdCandidate =
    config?.accountId ||
    (config?.accountIdEnvar
      ? getEnvString(config.accountIdEnvar as EnvVarKey) ||
        env?.[config.accountIdEnvar as keyof EnvOverrides]
      : undefined) ||
    env?.CLOUDFLARE_ACCOUNT_ID ||
    getEnvString('CLOUDFLARE_ACCOUNT_ID');

  invariant(
    accountIdCandidate,
    'Cloudflare account ID required. Supply it via config accountId or accountIdEnvar, or the CLOUDFLARE_ACCOUNT_ID environment variable',
  );

  return {
    apiToken: apiTokenCandidate,
    accountId: accountIdCandidate,
  };
}

function getApiBaseUrl(config?: CloudflareAiConfig, env?: EnvOverrides): string {
  // If custom API base URL is provided, use it
  if (config?.apiBaseUrl) {
    return config.apiBaseUrl;
  }

  // Otherwise, construct the default Cloudflare AI API URL
  const { accountId } = getCloudflareApiConfig(config, env);
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
}

function getPassthroughConfig(config?: CloudflareAiConfig) {
  // Extract Cloudflare-specific config keys that shouldn't be passed through
  const {
    accountId: _accountId,
    accountIdEnvar: _accountIdEnvar,
    apiKey: _apiKey,
    apiKeyEnvar: _apiKeyEnvar,
    apiBaseUrl: _apiBaseUrl,
    ...passthrough
  } = config || {};
  return passthrough;
}

export class CloudflareAiChatCompletionProvider extends OpenAiChatCompletionProvider {
  private cloudflareConfig: CloudflareAiConfig;
  private modelType = 'chat';

  constructor(modelName: string, providerOptions: CloudflareAiProviderOptions) {
    const apiBaseUrl = getApiBaseUrl(providerOptions.config, providerOptions.env);
    const passthrough = getPassthroughConfig(providerOptions.config);

    const config: OpenAiCompletionOptions = {
      ...providerOptions.config,
      apiKeyEnvar: 'CLOUDFLARE_API_KEY',
      apiBaseUrl,
      passthrough,
    };

    super(modelName, {
      ...providerOptions,
      config,
    });

    this.cloudflareConfig = providerOptions.config || {};
  }

  id(): string {
    return `cloudflare-ai:${this.modelType}:${this.modelName}`;
  }

  toString(): string {
    return `[Cloudflare AI ${this.modelType} Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    const { apiToken } = getCloudflareApiConfig(this.cloudflareConfig, this.env);
    return apiToken;
  }

  toJSON() {
    return {
      provider: 'cloudflare-ai',
      model: this.modelName,
      modelType: this.modelType,
      config: {
        ...this.config,
        ...(this.getApiKey() && { apiKey: undefined }),
      },
    };
  }
}

export class CloudflareAiCompletionProvider extends OpenAiCompletionProvider {
  private cloudflareConfig: CloudflareAiConfig;
  private modelType = 'completion';

  constructor(modelName: string, providerOptions: CloudflareAiProviderOptions) {
    const apiBaseUrl = getApiBaseUrl(providerOptions.config, providerOptions.env);
    const passthrough = getPassthroughConfig(providerOptions.config);

    const config: OpenAiCompletionOptions = {
      ...providerOptions.config,
      apiKeyEnvar: 'CLOUDFLARE_API_KEY',
      apiBaseUrl,
      passthrough,
    };

    super(modelName, {
      ...providerOptions,
      config,
    });

    this.cloudflareConfig = providerOptions.config || {};
  }

  id(): string {
    return `cloudflare-ai:${this.modelType}:${this.modelName}`;
  }

  toString(): string {
    return `[Cloudflare AI ${this.modelType} Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    const { apiToken } = getCloudflareApiConfig(this.cloudflareConfig, this.env);
    return apiToken;
  }

  toJSON() {
    return {
      provider: 'cloudflare-ai',
      model: this.modelName,
      modelType: this.modelType,
      config: {
        ...this.config,
        ...(this.getApiKey() && { apiKey: undefined }),
      },
    };
  }
}

export class CloudflareAiEmbeddingProvider extends OpenAiEmbeddingProvider {
  private cloudflareConfig: CloudflareAiConfig;
  private modelType = 'embedding';

  constructor(modelName: string, providerOptions: CloudflareAiProviderOptions) {
    const apiBaseUrl = getApiBaseUrl(providerOptions.config, providerOptions.env);
    const passthrough = getPassthroughConfig(providerOptions.config);

    const config: OpenAiCompletionOptions = {
      ...providerOptions.config,
      apiKeyEnvar: 'CLOUDFLARE_API_KEY',
      apiBaseUrl,
      passthrough,
    };

    super(modelName, {
      ...providerOptions,
      config,
    });

    this.cloudflareConfig = providerOptions.config || {};
  }

  id(): string {
    return `cloudflare-ai:${this.modelType}:${this.modelName}`;
  }

  toString(): string {
    return `[Cloudflare AI ${this.modelType} Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    const { apiToken } = getCloudflareApiConfig(this.cloudflareConfig, this.env);
    return apiToken;
  }

  toJSON() {
    return {
      provider: 'cloudflare-ai',
      model: this.modelName,
      modelType: this.modelType,
      config: {
        ...this.config,
        ...(this.getApiKey() && { apiKey: undefined }),
      },
    };
  }
}

export function createCloudflareAiProvider(
  providerPath: string,
  options: CloudflareAiProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelType = splits[1];
  const modelName = splits.slice(2).join(':');

  invariant(modelName, 'Model name is required');

  switch (modelType) {
    case 'chat':
      return new CloudflareAiChatCompletionProvider(modelName, options);
    case 'completion':
      return new CloudflareAiCompletionProvider(modelName, options);
    case 'embedding':
    case 'embeddings':
      return new CloudflareAiEmbeddingProvider(modelName, options);
    default:
      throw new Error(`Unknown Cloudflare AI model type: ${modelType}`);
  }
}
