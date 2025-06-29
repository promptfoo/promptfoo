import type { EnvVarKey } from '../envars';
import { getEnvString } from '../envars';
import type {
  ApiProvider,
  ProviderOptions,
} from '../types';
import type { EnvOverrides } from '../types/env';
import invariant from '../util/invariant';
import { OpenAiChatCompletionProvider } from './openai/chat';
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

export class CloudflareAiChatCompletionProvider extends OpenAiChatCompletionProvider {
  private cloudflareConfig: CloudflareAiConfig;

  constructor(modelName: string, providerOptions: CloudflareAiProviderOptions) {
    const { accountId } = getCloudflareApiConfig(providerOptions.config, providerOptions.env);

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'CLOUDFLARE_API_KEY',
        apiBaseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
      },
    });

    this.cloudflareConfig = providerOptions.config || {};
  }

  id(): string {
    return `cloudflare-ai:${this.modelName}`;
  }

  toString(): string {
    return `[Cloudflare AI Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    const { apiToken } = getCloudflareApiConfig(this.cloudflareConfig, this.env);
    return apiToken;
  }

  toJSON() {
    return {
      provider: 'cloudflare-ai',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.getApiKey() && { apiKey: undefined }),
      },
    };
  }
}

export class CloudflareAiEmbeddingProvider extends OpenAiEmbeddingProvider {
  private cloudflareConfig: CloudflareAiConfig;

  constructor(modelName: string, providerOptions: CloudflareAiProviderOptions) {
    const { accountId } = getCloudflareApiConfig(providerOptions.config, providerOptions.env);

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'CLOUDFLARE_API_KEY',
        apiBaseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
      },
    });

    this.cloudflareConfig = providerOptions.config || {};
  }

  id(): string {
    return `cloudflare-ai:${this.modelName}`;
  }

  toString(): string {
    return `[Cloudflare AI Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    const { apiToken } = getCloudflareApiConfig(this.cloudflareConfig, this.env);
    return apiToken;
  }

  toJSON() {
    return {
      provider: 'cloudflare-ai',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.getApiKey() && { apiKey: undefined }),
      },
    };
  }
}

// For backward compatibility, keep the old class names
export class CloudflareAiCompletionProvider extends CloudflareAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: CloudflareAiProviderOptions) {
    super(modelName, providerOptions);
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
