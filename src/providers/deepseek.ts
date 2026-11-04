import { getEnvString } from '../envars';
import logger from '../logger';
import { renderVarsInObject } from '../util/render';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { serializeProvider } from './serialization';
import { clampCachedTokens } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../types/index';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

type DeepSeekConfig = OpenAiCompletionOptions & { cacheReadCost?: number };

type DeepSeekProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: DeepSeekConfig & {
    config?: DeepSeekConfig;
    env?: ProviderOptions['env'];
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
  // Peak-hour estimates; off-peak rates are half. https://api-docs.deepseek.com/quick_start/pricing/
  ...['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'].map((id) => ({
    id,
    cost: {
      input: 0.3 / 1e6,
      output: 1.2 / 1e6,
      cache_read: 0.006 / 1e6,
    },
  })),
  {
    id: 'deepseek-v4-pro',
    cost: {
      input: 1.32 / 1e6,
      output: 3.96 / 1e6,
      cache_read: 0.044 / 1e6,
    },
  },
  // Retired models retain their historical rates.
  ...['deepseek-chat', 'deepseek-reasoner'].map((id) => ({
    id,
    cost: {
      input: 0.14 / 1e6,
      output: 0.28 / 1e6,
      cache_read: 0.0028 / 1e6,
    },
  })),
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
  if (
    !model &&
    config.inputCost === undefined &&
    config.outputCost === undefined &&
    config.cost === undefined &&
    config.cacheReadCost === undefined
  ) {
    return undefined;
  }

  const billableCachedTokens = clampCachedTokens(cachedTokens, promptTokens);
  const uncachedPromptTokens = promptTokens - billableCachedTokens;
  const inputCost = config.inputCost ?? config.cost ?? model?.cost.input;
  const outputCost = config.outputCost ?? config.cost ?? model?.cost.output;
  const cacheReadCost =
    config.cacheReadCost ?? config.inputCost ?? config.cost ?? model?.cost.cache_read ?? inputCost;
  const ratesAndTokens = [
    [inputCost, uncachedPromptTokens],
    [cacheReadCost, billableCachedTokens],
    [outputCost, completionTokens],
  ];
  if (
    ratesAndTokens.some(
      ([rate, tokens]) =>
        tokens > 0 && (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0),
    )
  ) {
    return undefined;
  }

  const inputCostTotal = uncachedPromptTokens > 0 ? inputCost * uncachedPromptTokens : 0;
  const cacheReadCostTotal = billableCachedTokens > 0 ? cacheReadCost * billableCachedTokens : 0;
  const outputCostTotal = completionTokens > 0 ? outputCost * completionTokens : 0;

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

  constructor(
    modelName: string,
    providerOptions: DeepSeekProviderOptions,
    private readonly usesBareModelDefault = false,
  ) {
    // Extract the nested config
    const deepseekConfig = providerOptions.config?.config;

    super(modelName, {
      ...providerOptions,
      env: providerOptions.config?.env ?? providerOptions.env,
      config: {
        ...providerOptions.config,
        ...deepseekConfig,
        apiKeyEnvar: 'DEEPSEEK_API_KEY',
        apiBaseUrl:
          deepseekConfig?.apiBaseUrl ??
          providerOptions.config?.apiBaseUrl ??
          'https://api.deepseek.com/v1',
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
    return serializeProvider(this, 'deepseek', () => this.apiKey);
  }

  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    const { body, config } = result;
    // Let DeepSeek choose its reasoning budget instead of the inherited 1,024-token limit.
    if (
      config.max_tokens === undefined &&
      config.passthrough?.max_tokens === undefined &&
      getEnvString('OPENAI_MAX_TOKENS') === undefined
    ) {
      delete body.max_tokens;
    }
    if (config.reasoning_effort !== undefined) {
      body.reasoning_effort = renderVarsInObject(config.reasoning_effort, context?.vars);
    }
    if (
      this.usesBareModelDefault &&
      !Object.prototype.hasOwnProperty.call(config.passthrough ?? {}, 'model') &&
      !Object.prototype.hasOwnProperty.call(body, 'thinking')
    ) {
      Object.assign(body, { thinking: { type: 'disabled' } });
    }
    return result;
  }

  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData & { usage?: { prompt_cache_hit_tokens?: number } },
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
  const modelName = explicitModelName || 'deepseek-flash';
  return new DeepSeekProvider(modelName, options, usesBareModelDefault);
}
