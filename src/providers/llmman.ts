import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';

const LLMMAN_API_BASE = 'http://localhost:17434/v1';

export class LlmmanProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || LLMMAN_API_BASE,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'LLMMAN_API_KEY',
        // llmman is local and unauthenticated by default, but the OpenAI
        // client requires some key to be present.
        apiKey: providerOptions.config?.apiKey || 'llmman',
      },
    });
  }

  id(): string {
    return `llmman:${this.modelName}`;
  }

  toString(): string {
    return `[llmman Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'llmman',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }
}

export function createLlmmanProvider(
  providerPath: string,
  options: { config?: ProviderOptions; env?: EnvOverrides } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(1).join(':');
  return new LlmmanProvider(modelName, {
    ...options.config,
    env: options.config?.env ?? options.env,
  });
}
