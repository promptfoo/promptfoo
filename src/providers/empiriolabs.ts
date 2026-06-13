import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateCost } from './shared';

import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

type EmpirioLabsConfig = OpenAiCompletionOptions;

type EmpirioLabsProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: {
    config?: EmpirioLabsConfig;
  };
};

// Pricing in USD per token (list price / 1e6 per 1M tokens).
// Only models with published pricing are listed here; other models still
// work and simply report no cost estimate.
export const EMPIRIOLABS_CHAT_MODELS = [
  {
    id: 'deepseek-v4-pro',
    cost: {
      input: 0.55 / 1e6,
      output: 2.2 / 1e6,
    },
  },
  {
    id: 'deepseek-v4-flash',
    cost: {
      input: 0.14 / 1e6,
      output: 0.28 / 1e6,
    },
  },
  {
    id: 'kimi-k2-7-code',
    cost: {
      input: 0.95 / 1e6,
      output: 4.0 / 1e6,
    },
  },
];

/**
 * Calculate EmpirioLabs cost based on model name and token usage.
 */
export function calculateEmpirioLabsCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  return calculateCost(modelName, config, promptTokens, completionTokens, EMPIRIOLABS_CHAT_MODELS);
}

class EmpirioLabsProvider extends OpenAiChatCompletionProvider {
  private originalConfig?: EmpirioLabsConfig;

  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  constructor(modelName: string, providerOptions: EmpirioLabsProviderOptions) {
    // Extract the nested config
    const empirioLabsConfig = providerOptions.config?.config;

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        ...empirioLabsConfig,
        apiKeyEnvar: 'EMPIRIOLABS_API_KEY',
        apiBaseUrl: 'https://api.empiriolabs.ai/v1',
      },
    });

    this.originalConfig = empirioLabsConfig;
  }

  id(): string {
    return `empiriolabs:${this.modelName}`;
  }

  toString(): string {
    return `[EmpirioLabs Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'empiriolabs',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.apiKey && { apiKey: undefined }),
      },
    };
  }

  async callApi(prompt: string, context?: any, callApiOptions?: any): Promise<any> {
    const response = await super.callApi(prompt, context, callApiOptions);

    if (!response || response.error) {
      return response;
    }

    if (response.tokenUsage && !response.cached) {
      response.cost = calculateEmpirioLabsCost(
        this.modelName,
        this.config || {},
        response.tokenUsage.prompt,
        response.tokenUsage.completion,
      );
    }

    return response;
  }
}

export function createEmpirioLabsProvider(
  providerPath: string,
  options: EmpirioLabsProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');
  return new EmpirioLabsProvider(modelName, options);
}
