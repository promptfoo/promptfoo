import { OpenAiChatCompletionProvider } from './openai/chat';
import { serializeProvider } from './serialization';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';

const POPNOW_API_BASE = 'https://api.popnow.ai/v1';

export class PopNowProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || POPNOW_API_BASE,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'POPNOW_API_KEY',
      },
    });
  }

  id(): string {
    return `popnow:${this.modelName}`;
  }

  toString(): string {
    return `[PopNow Provider ${this.modelName}]`;
  }

  toJSON() {
    return serializeProvider(this, 'popnow');
  }
}

export function createPopNowProvider(
  providerPath: string,
  options: { config?: ProviderOptions; env?: EnvOverrides } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(1).join(':');
  return new PopNowProvider(modelName, {
    ...options.config,
    env: options.config?.env ?? options.env,
  });
}
