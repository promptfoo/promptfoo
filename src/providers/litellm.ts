import type { ProviderOptions } from '../types/providers';
import { OpenAiChatCompletionProvider } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

type LiteLLMCompletionOptions = OpenAiCompletionOptions;

type LiteLLMProviderOptions = ProviderOptions & {
  config?: LiteLLMCompletionOptions;
};

export class LiteLLMProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: LiteLLMProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'LITELLM_API_KEY',
        apiKeyRequired: false,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || 'http://0.0.0.0:4000',
      },
    });
  }

  id(): string {
    return `litellm:${this.modelName}`;
  }

  toString(): string {
    return `[LiteLLM Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'litellm',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.getApiKey() && { apiKey: undefined }),
      },
    };
  }
}
