import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { getOpenAICompletionTokenDetails } from './openai/util';
import { calculateCost, clampCachedTokens } from './shared';

import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

type DeepSeekConfig = OpenAiCompletionOptions;

type DeepSeekProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: {
    config?: DeepSeekConfig;
  };
};

export const DEEPSEEK_CHAT_MODELS = [
  {
    id: 'deepseek-v4-flash',
    cost: {
      input: 0.14 / 1e6,
      output: 0.28 / 1e6,
      cache_read: 0.0028 / 1e6,
    },
  },
  {
    id: 'deepseek-v4-pro',
    cost: {
      input: 0.435 / 1e6,
      output: 0.87 / 1e6,
      cache_read: 0.003625 / 1e6,
    },
  },
  // Legacy aliases retained for compatibility.
  {
    id: 'deepseek-chat',
    cost: {
      input: 0.14 / 1e6,
      output: 0.28 / 1e6,
      cache_read: 0.0028 / 1e6,
    },
  },
  {
    id: 'deepseek-reasoner',
    cost: {
      input: 0.14 / 1e6,
      output: 0.28 / 1e6,
      cache_read: 0.0028 / 1e6,
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
  if (
    typeof promptTokens !== 'number' ||
    !Number.isFinite(promptTokens) ||
    promptTokens < 0 ||
    typeof completionTokens !== 'number' ||
    !Number.isFinite(completionTokens) ||
    completionTokens < 0
  ) {
    return undefined;
  }

  const model = DEEPSEEK_CHAT_MODELS.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    // Use default pricing for unknown models
    return calculateCost(modelName, config, promptTokens, completionTokens, DEEPSEEK_CHAT_MODELS);
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
    `DeepSeek cost calculation for ${modelName}: ` +
      `promptTokens=${promptTokens}, completionTokens=${completionTokens}, ` +
      `cachedTokens=${billableCachedTokens}, ` +
      `inputCost=${inputCostTotal}, cacheReadCost=${cacheReadCostTotal}, outputCost=${outputCostTotal}`,
  );

  return inputCostTotal + cacheReadCostTotal + outputCostTotal;
}

class DeepSeekProvider extends OpenAiChatCompletionProvider {
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

  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): number | undefined {
    if (cached) {
      return 0;
    }
    return calculateDeepSeekCost(
      this.modelName,
      config,
      data.usage?.prompt_tokens,
      data.usage?.completion_tokens,
      getOpenAICompletionTokenDetails(data.usage ?? {})?.cacheReadInputTokens,
    );
  }
}

export function createDeepSeekProvider(
  providerPath: string,
  options: DeepSeekProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  // Preserve the historical non-thinking default for `deepseek` while the
  // compatibility alias remains available upstream.
  const modelName = splits.slice(1).join(':') || 'deepseek-chat';
  return new DeepSeekProvider(modelName, options);
}
