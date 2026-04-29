import { OpenAiChatCompletionProvider } from './openai/chat';

import type { ApiProvider, ProviderOptions } from '../types/providers';

const ATLASCLOUD_API_BASE = 'https://api.atlascloud.ai/v1';

export class AtlasCloudProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || ATLASCLOUD_API_BASE,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'ATLASCLOUD_API_KEY',
      },
    });
  }

  id(): string {
    return `atlascloud:${this.modelName}`;
  }

  toString(): string {
    return `[Atlas Cloud Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'atlascloud',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }
}

export function createAtlasCloudProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  const providerOptions: ProviderOptions = options.config ? { ...options.config } : {};
  if (options.env && !providerOptions.env) {
    providerOptions.env = options.env as ProviderOptions['env'];
  }
  if (options.id && !providerOptions.id) {
    providerOptions.id = options.id;
  }

  return new AtlasCloudProvider(modelName, providerOptions);
}
