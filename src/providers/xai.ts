import type { ApiProvider, ProviderOptions } from '../types';
import invariant from '../util/invariant';
import { OpenAiChatCompletionProvider } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

type XAIConfig = {
  region?: string;
  reasoning_effort?: 'low' | 'high';
} & OpenAiCompletionOptions;

type XAIProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: {
    config?: XAIConfig;
  };
};

const GROK_3_MINI_MODELS = ['grok-3-mini-beta', 'grok-3-mini-fast-beta'];

class XAIProvider extends OpenAiChatCompletionProvider {
  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  protected isReasoningModel(): boolean {
    // Only Grok-3 mini models support reasoning
    return GROK_3_MINI_MODELS.includes(this.modelName);
  }

  protected supportsTemperature(): boolean {
    return true; // All Grok models support temperature
  }

  constructor(modelName: string, providerOptions: XAIProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'XAI_API_KEY',
        apiBaseUrl: providerOptions.config?.config?.region
          ? `https://${providerOptions.config.config.region}.api.x.ai/v1`
          : 'https://api.x.ai/v1',
      },
    });
  }

  id(): string {
    return `xai:${this.modelName}`;
  }

  toString(): string {
    return `[xAI Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'xai',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.apiKey && { apiKey: undefined }),
      },
    };
  }
}

export function createXAIProvider(
  providerPath: string,
  options: XAIProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');
  invariant(modelName, 'Model name is required');
  return new XAIProvider(modelName, options);
}
