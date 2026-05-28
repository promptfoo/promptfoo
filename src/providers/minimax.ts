import { getEnvString } from '../envars';
import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateCost } from './shared';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

const MINIMAX_API_BASE_URL = 'https://api.minimax.io/v1';
const MINIMAX_API_KEY_ENV_VAR = 'MINIMAX_API_KEY';

type MiniMaxConfig = OpenAiCompletionOptions & {
  cacheReadCost?: number;
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

export const MINIMAX_CHAT_MODELS = [
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

  const billableCachedTokens = Number.isFinite(cachedTokens)
    ? Math.min(Math.max(cachedTokens!, 0), promptTokens!)
    : 0;
  const uncachedPromptTokens = promptTokens! - billableCachedTokens;
  const inputCost = config.inputCost ?? config.cost ?? model.cost.input;
  const outputCost = config.outputCost ?? config.cost ?? model.cost.output;
  const cacheReadCost = config.cacheReadCost ?? model.cost.cache_read;

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

    // MiniMax's OpenAI-compatible API accepts max_completion_tokens, not max_tokens.
    const maxCompletionTokens = config.max_completion_tokens ?? config.max_tokens;
    if (maxCompletionTokens === undefined) {
      delete body.max_completion_tokens;
    } else {
      body.max_completion_tokens = maxCompletionTokens;
    }
    delete body.max_tokens;

    // The base provider defaults temperature to 0, but MiniMax requires (0, 1].
    if (config.temperature === undefined) {
      delete body.temperature;
    }

    // The base provider seeds top_p / presence_penalty / frequency_penalty from
    // OPENAI_TOP_P / OPENAI_PRESENCE_PENALTY / OPENAI_FREQUENCY_PENALTY whenever
    // those env vars are set, regardless of MiniMax config. Strip them so OpenAI
    // sampling defaults configured for another provider don't leak into MiniMax.
    if (config.top_p === undefined) {
      delete body.top_p;
    }
    if (config.presence_penalty === undefined) {
      delete body.presence_penalty;
    }
    if (config.frequency_penalty === undefined) {
      delete body.frequency_penalty;
    }

    return result;
  }

  override async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const response = await super.callApi(prompt, context, callApiOptions);

    if (!response || response.error) {
      return response;
    }

    // The inherited OpenAI adapter normalizes MiniMax prompt-cache usage into token metadata.
    let cachedTokens = response.tokenUsage?.completionDetails?.cacheReadInputTokens ?? 0;
    if (cachedTokens === 0 && typeof response.raw === 'string') {
      try {
        const rawData = JSON.parse(response.raw);
        if (typeof rawData?.usage?.prompt_tokens_details?.cached_tokens === 'number') {
          cachedTokens = rawData.usage.prompt_tokens_details.cached_tokens;
        }
      } catch (err) {
        logger.debug(`Failed to parse raw response for cache info: ${err}`);
      }
    } else if (cachedTokens === 0 && typeof response.raw === 'object' && response.raw !== null) {
      const rawData = response.raw;
      if (typeof rawData?.usage?.prompt_tokens_details?.cached_tokens === 'number') {
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
