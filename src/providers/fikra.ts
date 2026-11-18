import { OpenAiChatCompletionProvider } from './openai/chat';
import { serializeProvider } from './serialization';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';

const FIKRA_API_BASE = 'https://api.fikraapi.co.ke/v1';

export class FikraProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || FIKRA_API_BASE,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'FIKRA_API_KEY',
      },
    });
  }

  override getOrganization(config = this.config): string | undefined {
    return config.organization;
  }

  id(): string {
    return `fikra:${this.modelName}`;
  }

  toString(): string {
    return `[Fikra Provider ${this.modelName}]`;
  }

  toJSON() {
    return serializeProvider(this, 'fikra');
  }
}

export function createFikraProvider(
  providerPath: string,
  options: { config?: ProviderOptions; env?: EnvOverrides } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(1).join(':');
  return new FikraProvider(modelName, {
    ...options.config,
    env: options.config?.env ?? options.env,
  });
}
