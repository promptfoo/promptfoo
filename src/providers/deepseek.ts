import { getEnvString } from '../envars';
import logger from '../logger';
import { renderVarsInObject } from '../util/index';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { clampCachedTokens } from './shared';

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
  config?: DeepSeekConfig & {
    config?: DeepSeekConfig;
    env?: ProviderOptions['env'];
  };
};

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
  const cacheReadCost = config.cacheReadCost ?? model?.cost.cache_read ?? inputCost;
  if (
    (uncachedPromptTokens > 0 && inputCost === undefined) ||
    (billableCachedTokens > 0 && cacheReadCost === undefined) ||
    (completionTokens > 0 && outputCost === undefined)
  ) {
    return undefined;
  }

  const inputCostTotal = (inputCost ?? 0) * uncachedPromptTokens;
  const cacheReadCostTotal = (cacheReadCost ?? 0) * billableCachedTokens;
  const outputCostTotal = (outputCost ?? 0) * completionTokens;

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
    return {
      provider: 'deepseek',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.apiKey && { apiKey: undefined }),
      },
    };
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
    return result;
  }

  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): number | undefined {
    if (cached) {
      return undefined;
    }
    const usage = data.usage as
      | (NonNullable<OpenAiChatCompletionCostData['usage']> & { prompt_cache_hit_tokens?: number })
      | undefined;
    const passthrough = config.passthrough as { model?: string } | undefined;
    return calculateDeepSeekCost(
      passthrough?.model ?? this.modelName,
      config,
      usage?.prompt_tokens,
      usage?.completion_tokens,
      usage?.prompt_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens,
    );
  }
}

export function createDeepSeekProvider(
  providerPath: string,
  options: DeepSeekProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');
  if (modelName) {
    return new DeepSeekProvider(modelName, options);
  }

  // The retired shorthand used non-thinking mode; the replacement defaults to thinking.
  const config = options.config?.config;
  return new DeepSeekProvider('deepseek-flash', {
    ...options,
    config: {
      ...options.config,
      config: {
        ...config,
        passthrough: { thinking: { type: 'disabled' }, ...config?.passthrough },
      },
    },
  });
}
