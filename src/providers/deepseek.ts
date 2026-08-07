import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateCost, clampCachedTokens } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../types/index';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

type DeepSeekConfig = OpenAiCompletionOptions;

type DeepSeekProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: {
    config?: DeepSeekConfig;
  };
};

function getNumericUsageValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

type DeepSeekUsage = NonNullable<OpenAiChatCompletionCostData['usage']> & {
  prompt_cache_hit_tokens?: unknown;
  prompt_cache_miss_tokens?: unknown;
};

function getDeepSeekCachedTokens(usage: DeepSeekUsage | undefined, promptTokens?: number): number {
  const nativeCacheHits = getNumericUsageValue(usage?.prompt_cache_hit_tokens);
  if (nativeCacheHits !== undefined) {
    return nativeCacheHits;
  }

  const nativeCacheMisses = getNumericUsageValue(usage?.prompt_cache_miss_tokens);
  if (nativeCacheMisses !== undefined && typeof promptTokens === 'number') {
    return promptTokens - nativeCacheMisses;
  }

  return getNumericUsageValue(usage?.prompt_tokens_details?.cached_tokens) ?? 0;
}

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
  if (!promptTokens || !completionTokens) {
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
  private originalConfig?: DeepSeekConfig;

  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  constructor(
    modelName: string,
    providerOptions: DeepSeekProviderOptions,
    private readonly usesBareModelDefault = false,
  ) {
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

  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    const hasExplicitModelOverride = Object.prototype.hasOwnProperty.call(
      result.config.passthrough ?? {},
      'model',
    );

    if (
      !this.usesBareModelDefault ||
      hasExplicitModelOverride ||
      Object.prototype.hasOwnProperty.call(result.body, 'thinking')
    ) {
      return result;
    }

    return {
      ...result,
      body: {
        ...result.body,
        thinking: { type: 'disabled' },
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

    const usage = data.usage as DeepSeekUsage | undefined;
    const passthroughModel = (config.passthrough as { model?: unknown } | undefined)?.model;
    const modelName = typeof passthroughModel === 'string' ? passthroughModel : this.modelName;
    return calculateDeepSeekCost(
      modelName,
      config,
      usage?.prompt_tokens,
      usage?.completion_tokens,
      getDeepSeekCachedTokens(usage, usage?.prompt_tokens),
    );
  }
}

export function createDeepSeekProvider(
  providerPath: string,
  options: DeepSeekProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const explicitModelName = splits.slice(1).join(':');
  const usesBareModelDefault = explicitModelName.length === 0;
  const modelName = explicitModelName || 'deepseek-v4-flash';
  return new DeepSeekProvider(modelName, options, usesBareModelDefault);
}
