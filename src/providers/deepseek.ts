import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateCost } from './shared';

import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

type DeepSeekConfig = OpenAiCompletionOptions;

type DeepSeekProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: {
    config?: DeepSeekConfig;
  };
};

export const DEEPSEEK_CHAT_MODELS = [
  {
    id: 'deepseek-chat',
    cost: {
      input: 0.28 / 1e6,
      output: 0.42 / 1e6,
      cache_read: 0.028 / 1e6,
    },
  },
  {
    id: 'deepseek-reasoner',
    cost: {
      input: 0.28 / 1e6,
      output: 0.42 / 1e6,
      cache_read: 0.028 / 1e6,
    },
  },
];

/**
 * Calculate DeepSeek cost based on model name and token usage
 */
export function calculateDeepSeekCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = DEEPSEEK_CHAT_MODELS.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    // Use default pricing for unknown models
    return calculateCost(modelName, config, promptTokens, completionTokens, DEEPSEEK_CHAT_MODELS);
  }

  const uncachedPromptTokens = cachedTokens ? promptTokens - cachedTokens : promptTokens;
  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  const cacheReadCost = config.cacheReadCost ?? model.cost.cache_read;

  const inputCostTotal = inputCost * uncachedPromptTokens;
  const cacheReadCostTotal = cachedTokens ? cacheReadCost * cachedTokens : 0;
  const outputCostTotal = outputCost * completionTokens;

  logger.debug(
    `DeepSeek cost calculation for ${modelName}: ` +
      `promptTokens=${promptTokens}, completionTokens=${completionTokens}, ` +
      `cachedTokens=${cachedTokens || 0}, ` +
      `inputCost=${inputCostTotal}, cacheReadCost=${cacheReadCostTotal}, outputCost=${outputCostTotal}`,
  );

  return inputCostTotal + cacheReadCostTotal + outputCostTotal;
}

class DeepSeekProvider extends OpenAiChatCompletionProvider {
  private originalConfig?: DeepSeekConfig;

  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  constructor(modelName: string, providerOptions: DeepSeekProviderOptions) {
    // Extract the nested config
    const deepseekConfig = providerOptions.config?.config;

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        ...deepseekConfig,
        apiKeyEnvar: 'DEEPSEEK_API_KEY',
        apiBaseUrl: 'https://api.deepseek.com/v1',
      },
    });

    this.originalConfig = deepseekConfig;
  }

  id(): string {
    return `deepseek:${this.modelName}`;
  }

  toString(): string {
    return `[DeepSeek Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'deepseek',
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

    // Extract cache hit information if available
    let cachedTokens = 0;
    if (typeof response.raw === 'string') {
      try {
        const rawData = JSON.parse(response.raw);
        if (rawData?.usage?.prompt_tokens_details?.cached_tokens) {
          cachedTokens = rawData.usage.prompt_tokens_details.cached_tokens;
        }
      } catch (err) {
        logger.debug(`Failed to parse raw response for cache info: ${err}`);
      }
    } else if (typeof response.raw === 'object' && response.raw !== null) {
      const rawData = response.raw;
      if (rawData?.usage?.prompt_tokens_details?.cached_tokens) {
        cachedTokens = rawData.usage.prompt_tokens_details.cached_tokens;
      }
    }

    // Calculate cost with cache information
    if (response.tokenUsage && !response.cached) {
      response.cost = calculateDeepSeekCost(
        this.modelName,
        this.config || {},
        response.tokenUsage.prompt,
        response.tokenUsage.completion,
        cachedTokens,
      );
    }

    return response;
  }
}

export function createDeepSeekProvider(
  providerPath: string,
  options: DeepSeekProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':') || 'deepseek-chat';
  return new DeepSeekProvider(modelName, options);
}
