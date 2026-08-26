import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateCost, clampCachedTokens } from './shared';

import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

type VolcengineConfig = OpenAiCompletionOptions;

type VolcengineProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: VolcengineConfig & {
    config?: VolcengineConfig;
  };
};

/**
 * Exchange rate: 1 USD = 6.737012 CNY (as of 2026-08-26, source: https://open.er-api.com/v6/latest/USD)
 * Volcengine Ark charges in CNY per 1M tokens.
 * For models with tiered pricing by context length (e.g. 32k/128k/256k), base tier pricing is used.
 */
export const VOLCENGINE_CHAT_MODELS = [
  // Doubao Seed Evolving (Coding & Agent model, 1024k context)
  {
    id: 'doubao-seed-evolving',
    cost: {
      input: 6.0 / 6.737012 / 1e6,
      output: 30.0 / 6.737012 / 1e6,
      cache_read: 1.2 / 6.737012 / 1e6,
    },
  },
  // Doubao Seed 2.1 Pro (Flagship pro model, 256k context)
  {
    id: 'doubao-seed-2-1-pro-260628',
    cost: {
      input: 6.0 / 6.737012 / 1e6,
      output: 30.0 / 6.737012 / 1e6,
      cache_read: 1.2 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2-1-pro',
    cost: {
      input: 6.0 / 6.737012 / 1e6,
      output: 30.0 / 6.737012 / 1e6,
      cache_read: 1.2 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2.1-pro',
    cost: {
      input: 6.0 / 6.737012 / 1e6,
      output: 30.0 / 6.737012 / 1e6,
      cache_read: 1.2 / 6.737012 / 1e6,
    },
  },
  // Doubao Seed 2.1 Turbo (Fast turbo model, 256k context)
  {
    id: 'doubao-seed-2-1-turbo-260628',
    cost: {
      input: 3.0 / 6.737012 / 1e6,
      output: 15.0 / 6.737012 / 1e6,
      cache_read: 0.6 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2-1-turbo',
    cost: {
      input: 3.0 / 6.737012 / 1e6,
      output: 15.0 / 6.737012 / 1e6,
      cache_read: 0.6 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2.1-turbo',
    cost: {
      input: 3.0 / 6.737012 / 1e6,
      output: 15.0 / 6.737012 / 1e6,
      cache_read: 0.6 / 6.737012 / 1e6,
    },
  },
  // Doubao Seed 2.0 Pro (256k context)
  {
    id: 'doubao-seed-2-0-pro-260215',
    cost: {
      input: 3.2 / 6.737012 / 1e6,
      output: 16.0 / 6.737012 / 1e6,
      cache_read: 0.64 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2-0-pro',
    cost: {
      input: 3.2 / 6.737012 / 1e6,
      output: 16.0 / 6.737012 / 1e6,
      cache_read: 0.64 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2.0-pro',
    cost: {
      input: 3.2 / 6.737012 / 1e6,
      output: 16.0 / 6.737012 / 1e6,
      cache_read: 0.64 / 6.737012 / 1e6,
    },
  },
  // Doubao Seed 2.0 Lite (Lightweight, 256k context, high throughput)
  {
    id: 'doubao-seed-2-0-lite-260428',
    cost: {
      input: 0.6 / 6.737012 / 1e6,
      output: 3.6 / 6.737012 / 1e6,
      cache_read: 0.12 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2-0-lite-260215',
    cost: {
      input: 0.6 / 6.737012 / 1e6,
      output: 3.6 / 6.737012 / 1e6,
      cache_read: 0.12 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2-0-lite',
    cost: {
      input: 0.6 / 6.737012 / 1e6,
      output: 3.6 / 6.737012 / 1e6,
      cache_read: 0.12 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2.0-lite',
    cost: {
      input: 0.6 / 6.737012 / 1e6,
      output: 3.6 / 6.737012 / 1e6,
      cache_read: 0.12 / 6.737012 / 1e6,
    },
  },
  // Doubao Seed 2.0 Mini (Ultra-lightweight, 256k context)
  {
    id: 'doubao-seed-2-0-mini-260428',
    cost: {
      input: 0.2 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.04 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2-0-mini-260215',
    cost: {
      input: 0.2 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.04 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2-0-mini',
    cost: {
      input: 0.2 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.04 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2.0-mini',
    cost: {
      input: 0.2 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.04 / 6.737012 / 1e6,
    },
  },
  // Doubao Seed 2.0 Code (Code specialization, 256k context)
  {
    id: 'doubao-seed-2-0-code-preview-260215',
    cost: {
      input: 3.2 / 6.737012 / 1e6,
      output: 16.0 / 6.737012 / 1e6,
      cache_read: 0.64 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2-0-code',
    cost: {
      input: 3.2 / 6.737012 / 1e6,
      output: 16.0 / 6.737012 / 1e6,
      cache_read: 0.64 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-2.0-code',
    cost: {
      input: 3.2 / 6.737012 / 1e6,
      output: 16.0 / 6.737012 / 1e6,
      cache_read: 0.64 / 6.737012 / 1e6,
    },
  },
  // Doubao Seed Character (Role-play specialization, 128k context)
  {
    id: 'doubao-seed-character-260628',
    cost: {
      input: 0.8 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.16 / 6.737012 / 1e6,
    },
  },
  {
    id: 'doubao-seed-character',
    cost: {
      input: 0.8 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.16 / 6.737012 / 1e6,
    },
  },
  // GLM-5.2 hosted on Volcengine Ark (1024k context)
  {
    id: 'glm-5-2-260617',
    cost: {
      input: 8.0 / 6.737012 / 1e6,
      output: 28.0 / 6.737012 / 1e6,
      cache_read: 2.0 / 6.737012 / 1e6,
    },
  },
  {
    id: 'glm-5.2',
    cost: {
      input: 8.0 / 6.737012 / 1e6,
      output: 28.0 / 6.737012 / 1e6,
      cache_read: 2.0 / 6.737012 / 1e6,
    },
  },
  {
    id: 'glm-5-2',
    cost: {
      input: 8.0 / 6.737012 / 1e6,
      output: 28.0 / 6.737012 / 1e6,
      cache_read: 2.0 / 6.737012 / 1e6,
    },
  },
  // DeepSeek-V4-Pro hosted on Volcengine Ark (1024k context)
  {
    id: 'deepseek-v4-pro-ga-260813',
    cost: {
      input: 9.0 / 6.737012 / 1e6,
      output: 27.0 / 6.737012 / 1e6,
      cache_read: 0.3 / 6.737012 / 1e6,
    },
  },
  {
    id: 'deepseek-v4-pro-260425',
    cost: {
      input: 9.0 / 6.737012 / 1e6,
      output: 27.0 / 6.737012 / 1e6,
      cache_read: 0.3 / 6.737012 / 1e6,
    },
  },
  {
    id: 'deepseek-v4-pro',
    cost: {
      input: 9.0 / 6.737012 / 1e6,
      output: 27.0 / 6.737012 / 1e6,
      cache_read: 0.3 / 6.737012 / 1e6,
    },
  },
  // DeepSeek-V4-Flash hosted on Volcengine Ark (1024k context)
  {
    id: 'deepseek-v4-flash-ga-260731',
    cost: {
      input: 1.0 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.2 / 6.737012 / 1e6,
    },
  },
  {
    id: 'deepseek-v4-flash-260425',
    cost: {
      input: 1.0 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.2 / 6.737012 / 1e6,
    },
  },
  {
    id: 'deepseek-v4-flash',
    cost: {
      input: 1.0 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.2 / 6.737012 / 1e6,
    },
  },
];

/**
 * Calculate Volcengine Ark cost based on model name and token usage
 */
export function calculateVolcengineCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    // Use default pricing for unknown models
    return calculateCost(modelName, config, promptTokens, completionTokens, VOLCENGINE_CHAT_MODELS);
  }

  const billableCachedTokens = clampCachedTokens(cachedTokens, promptTokens);
  const uncachedPromptTokens = promptTokens - billableCachedTokens;
  const inputCost = config.inputCost ?? config.cost ?? model.cost.input;
  const outputCost = config.outputCost ?? config.cost ?? model.cost.output;
  const cacheReadCost = config.cacheReadCost ?? model.cost.cache_read;

  const inputCostTotal = inputCost * uncachedPromptTokens;
  const cacheReadCostTotal = cacheReadCost * billableCachedTokens;
  const outputCostTotal = outputCost * completionTokens;

  logger.debug(
    `Volcengine cost calculation for ${modelName}: ` +
      `promptTokens=${promptTokens}, completionTokens=${completionTokens}, ` +
      `cachedTokens=${billableCachedTokens}, ` +
      `inputCost=${inputCostTotal}, cacheReadCost=${cacheReadCostTotal}, outputCost=${outputCostTotal}`,
  );

  return inputCostTotal + cacheReadCostTotal + outputCostTotal;
}

export class VolcengineProvider extends OpenAiChatCompletionProvider {
  private originalConfig?: VolcengineConfig;

  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  constructor(modelName: string, providerOptions: VolcengineProviderOptions) {
    // Extract the nested config
    const volcengineConfig = providerOptions.config?.config;

    super(modelName, {
      ...providerOptions,
      config: {
        apiKeyEnvar: 'ARK_API_KEY',
        apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        ...providerOptions.config,
        ...volcengineConfig,
      },
    });

    this.originalConfig = volcengineConfig;
  }

  id(): string {
    return `volcengine:${this.modelName}`;
  }

  toString(): string {
    return `[Volcengine Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'volcengine',
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
      response.cost = calculateVolcengineCost(
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

export function createVolcengineProvider(
  providerPath: string,
  options: VolcengineProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':') || 'doubao-seed-2-1-pro-260628';
  return new VolcengineProvider(modelName, options);
}
