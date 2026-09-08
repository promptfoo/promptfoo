import { getEnvString } from '../envars';
import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateCost, clampCachedTokens } from './shared';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../types/index';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

const MINIMAX_API_BASE_URL = 'https://api.minimax.io/v1';
const MINIMAX_API_KEY_ENV_VAR = 'MINIMAX_API_KEY';

type MiniMaxConfig = OpenAiCompletionOptions & {
  cacheReadCost?: number;
};

type MiniMaxModelCost = {
  input: number;
  output: number;
  cache_read: number;
  longContext?: {
    threshold: number;
    input: number;
    output: number;
    cache_read: number;
  };
};

type MiniMaxModel = {
  id: string;
  cost: MiniMaxModelCost;
};

type MiniMaxProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: {
    config?: MiniMaxConfig;
    id?: string;
    env?: EnvOverrides;
  };
};

function getProviderEnvString(env: EnvOverrides | undefined, key: EnvVarKey): string | undefined {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    const value = env[key as keyof EnvOverrides];
    return value === undefined ? undefined : String(value);
  }
  return undefined;
}

export const MINIMAX_CHAT_MODELS: MiniMaxModel[] = [
  {
    id: 'MiniMax-M3',
    cost: {
      input: 0.3 / 1e6,
      output: 1.2 / 1e6,
      cache_read: 0.06 / 1e6,
      longContext: {
        threshold: 512_000,
        input: 0.6 / 1e6,
        output: 2.4 / 1e6,
        cache_read: 0.12 / 1e6,
      },
    },
  },
  {
    id: 'MiniMax-M2.7',
    cost: {
      input: 0.3 / 1e6,
      output: 1.2 / 1e6,
      cache_read: 0.06 / 1e6,
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
];

/**
 * Calculate MiniMax cost based on model name and token usage
 */
export function calculateMiniMaxCost(
  modelName: string,
  config: MiniMaxConfig,
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): number | undefined {
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) {
    return undefined;
  }

  const model = MINIMAX_CHAT_MODELS.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return calculateCost(modelName, config, promptTokens, completionTokens, MINIMAX_CHAT_MODELS);
  }

  const billableCachedTokens = clampCachedTokens(cachedTokens, promptTokens!);
  const uncachedPromptTokens = promptTokens! - billableCachedTokens;
  const modelCost =
    model.cost.longContext && promptTokens! > model.cost.longContext.threshold
      ? model.cost.longContext
      : model.cost;
  const tierMultiplier = modelName === 'MiniMax-M3' && config.service_tier === 'priority' ? 1.5 : 1;
  const inputCost = config.inputCost ?? config.cost ?? modelCost.input * tierMultiplier;
  const outputCost = config.outputCost ?? config.cost ?? modelCost.output * tierMultiplier;
  const cacheReadCost = config.cacheReadCost ?? modelCost.cache_read * tierMultiplier;

  const inputCostTotal = inputCost * uncachedPromptTokens;
  const cacheReadCostTotal = cacheReadCost * billableCachedTokens;
  const outputCostTotal = outputCost * completionTokens!;

  logger.debug(
    `MiniMax cost calculation for ${modelName}: ` +
      `promptTokens=${promptTokens}, completionTokens=${completionTokens}, ` +
      `cachedTokens=${billableCachedTokens}, ` +
      `inputCost=${inputCostTotal}, cacheReadCost=${cacheReadCostTotal}, outputCost=${outputCostTotal}`,
  );

  return inputCostTotal + cacheReadCostTotal + outputCostTotal;
}

class MiniMaxProvider extends OpenAiChatCompletionProvider {
  config: MiniMaxConfig;

  constructor(modelName: string, providerOptions: MiniMaxProviderOptions) {
    const minimaxConfig = providerOptions.config?.config ?? {};

    super(modelName, {
      id: providerOptions.config?.id ?? providerOptions.id,
      env: providerOptions.config?.env ?? providerOptions.env,
      config: {
        ...minimaxConfig,
        apiKeyEnvar: minimaxConfig.apiKeyEnvar ?? MINIMAX_API_KEY_ENV_VAR,
        apiBaseUrl: minimaxConfig.apiBaseUrl ?? MINIMAX_API_BASE_URL,
      },
    });

    this.config = {
      ...minimaxConfig,
      apiKeyEnvar: minimaxConfig.apiKeyEnvar ?? MINIMAX_API_KEY_ENV_VAR,
      apiBaseUrl: minimaxConfig.apiBaseUrl ?? MINIMAX_API_BASE_URL,
    };
  }

  override getApiKey(): string | undefined {
    if (this.config.apiKey !== undefined) {
      return this.config.apiKey;
    }

    const apiKeyEnvar = this.config.apiKeyEnvar as EnvVarKey | undefined;
    return apiKeyEnvar
      ? (getProviderEnvString(this.env, apiKeyEnvar) ?? getEnvString(apiKeyEnvar))
      : undefined;
  }

  override getOrganization(): undefined {
    return undefined;
  }

  override getApiUrl(): string {
    return this.config.apiBaseUrl ?? MINIMAX_API_BASE_URL;
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return (
      `MiniMax API key is not set. Set the ${this.config.apiKeyEnvar ?? MINIMAX_API_KEY_ENV_VAR} ` +
      'environment variable or add `apiKey` to the provider config.'
    );
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
        ...(this.config.apiKey && { apiKey: undefined }),
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

    if (body.function_call !== undefined) {
      throw new Error(
        'MiniMax does not support function_call. Use tools and tool_choice for tool calling instead.',
      );
    }

    // Normalize explicit token limits without letting a provider-level alias
    // override a prompt-level limit. Passthrough wins within each layer.
    const promptConfig = (context?.prompt?.config ?? {}) as OpenAiCompletionOptions;
    const promptPassthrough = promptConfig.passthrough as
      | { max_completion_tokens?: unknown; max_tokens?: unknown }
      | undefined;
    const maxCompletionTokens =
      promptPassthrough?.max_completion_tokens ??
      promptPassthrough?.max_tokens ??
      promptConfig.max_completion_tokens ??
      promptConfig.max_tokens ??
      config.passthrough?.max_completion_tokens ??
      config.passthrough?.max_tokens ??
      config.max_completion_tokens ??
      config.max_tokens;
    if (maxCompletionTokens === undefined) {
      delete body.max_completion_tokens;
    } else {
      body.max_completion_tokens = maxCompletionTokens;
    }
    delete body.max_tokens;

    // Let MiniMax apply its sampling default unless temperature is configured.
    if (config.temperature === undefined && config.passthrough?.temperature === undefined) {
      delete body.temperature;
    }

    // The base provider seeds top_p / presence_penalty / frequency_penalty from
    // OPENAI_TOP_P / OPENAI_PRESENCE_PENALTY / OPENAI_FREQUENCY_PENALTY whenever
    // those env vars are set, regardless of MiniMax config. Strip them so OpenAI
    // sampling defaults configured for another provider don't leak into MiniMax.
    if (config.top_p === undefined && config.passthrough?.top_p === undefined) {
      delete body.top_p;
    }
    if (
      config.presence_penalty === undefined &&
      config.passthrough?.presence_penalty === undefined
    ) {
      delete body.presence_penalty;
    }
    if (
      config.frequency_penalty === undefined &&
      config.passthrough?.frequency_penalty === undefined
    ) {
      delete body.frequency_penalty;
    }

    return result;
  }

  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): number | undefined {
    if (cached) {
      return 0;
    }
    const passthroughModel = (config.passthrough as { model?: unknown } | undefined)?.model;
    const modelName = typeof passthroughModel === 'string' ? passthroughModel : this.modelName;
    return calculateMiniMaxCost(
      modelName,
      {
        ...config,
        service_tier:
          (data.service_tier ?? config.service_tier) === 'priority' ? 'priority' : undefined,
      },
      data.usage?.prompt_tokens,
      data.usage?.completion_tokens,
      data.usage?.prompt_tokens_details?.cached_tokens,
    );
  }
}

export function createMiniMaxProvider(
  providerPath: string,
  options: MiniMaxProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':') || 'MiniMax-M3';
  return new MiniMaxProvider(modelName, options);
}
