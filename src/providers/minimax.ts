import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateCost } from './shared';

import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

type MiniMaxConfig = OpenAiCompletionOptions;

type MiniMaxProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: {
    config?: MiniMaxConfig;
  };
};

export const MINIMAX_CHAT_MODELS = [
  {
    id: 'MiniMax-M2.7',
    cost: {
      input: 0.3 / 1e6,
      output: 1.2 / 1e6,
      cache_read: 0.03 / 1e6,
    },
  },
  {
    id: 'MiniMax-M2.7-highspeed',
    cost: {
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      cache_read: 0.06 / 1e6,
    },
  },
  {
    id: 'MiniMax-M2.5',
    cost: {
      input: 0.3 / 1e6,
      output: 1.2 / 1e6,
      cache_read: 0.03 / 1e6,
    },
  },
  {
    id: 'MiniMax-M2.5-highspeed',
    cost: {
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      cache_read: 0.03 / 1e6,
    },
  },
];

/**
 * Calculate MiniMax cost based on model name and token usage
 */
export function calculateMiniMaxCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = MINIMAX_CHAT_MODELS.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return calculateCost(modelName, config, promptTokens, completionTokens, MINIMAX_CHAT_MODELS);
  }

  const uncachedPromptTokens = cachedTokens ? promptTokens - cachedTokens : promptTokens;
  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  const cacheReadCost = config.cacheReadCost ?? model.cost.cache_read;

  const inputCostTotal = inputCost * uncachedPromptTokens;
  const cacheReadCostTotal = cachedTokens ? cacheReadCost * cachedTokens : 0;
  const outputCostTotal = outputCost * completionTokens;

  logger.debug(
    `MiniMax cost calculation for ${modelName}: ` +
      `promptTokens=${promptTokens}, completionTokens=${completionTokens}, ` +
      `cachedTokens=${cachedTokens || 0}, ` +
      `inputCost=${inputCostTotal}, cacheReadCost=${cacheReadCostTotal}, outputCost=${outputCostTotal}`,
  );

  return inputCostTotal + cacheReadCostTotal + outputCostTotal;
}

class MiniMaxProvider extends OpenAiChatCompletionProvider {
  private originalConfig?: MiniMaxConfig;

  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  constructor(modelName: string, providerOptions: MiniMaxProviderOptions) {
    const minimaxConfig = providerOptions.config?.config;

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        ...minimaxConfig,
        apiKeyEnvar: 'MINIMAX_API_KEY',
        apiBaseUrl: 'https://api.minimax.io/v1',
      },
    });

    this.originalConfig = minimaxConfig;
  }

  id(): string {
    return `minimax:${this.modelName}`;
  }

  toString(): string {
    return `[MiniMax Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'minimax',
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
      response.cost = calculateMiniMaxCost(
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

export function createMiniMaxProvider(
  providerPath: string,
  options: MiniMaxProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':') || 'MiniMax-M2.7';
  return new MiniMaxProvider(modelName, options);
}
