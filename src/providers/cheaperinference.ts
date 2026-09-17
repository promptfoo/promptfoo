import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';

const CHEAPERINFERENCE_API_BASE = 'https://api.cheaperinference.com/v1';

export class CheaperInferenceProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || CHEAPERINFERENCE_API_BASE,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'CHEAPERINFERENCE_API_KEY',
      },
    });
  }

  id(): string {
    return `cheaperinference:${this.modelName}`;
  }

  toString(): string {
    return `[Cheaper Inference Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'cheaperinference',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }
}

export function createCheaperInferenceProvider(
  providerPath: string,
  options: { config?: ProviderOptions; env?: EnvOverrides } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(1).join(':');
  return new CheaperInferenceProvider(modelName, {
    ...options.config,
    env: options.config?.env ?? options.env,
  });
}
