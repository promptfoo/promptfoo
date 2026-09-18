import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
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
  options: { config?: ProviderOptions; env?: EnvOverrides } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(1).join(':');
  return new AtlasCloudProvider(modelName, {
    ...options.config,
    env: options.config?.env ?? options.env,
  });
}
