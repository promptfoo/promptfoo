import { resolveProviderApiKey } from './credentials';
import { resolveProviderEnv } from './env';
import { type OpenAiChatCompletionCostData, OpenAiChatCompletionProvider } from './openai/chat';
import { sanitizeProviderObject } from './providerLogging';
import { clampCachedTokens } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../types/index';
import type { OpenAiBillingConfig, OpenAiChatConfig } from './openai/config';

type VolcengineConfig = OpenAiChatConfig & { cacheReadCost?: number };
const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3';

/**
 * Volcengine Ark publishes prices in CNY per 1M tokens.
 * Exchange rate: 1 USD = 6.737012 CNY (2026-08-26, source: https://open.er-api.com/v6/latest/USD)
 * Price source: https://www.volcengine.com/docs/82379/1544106
 *
 * Ark tiers several models by input length (32k / 128k / 256k); the base tier is
 * used here.
 *
 * Every ID below was verified against POST /api/v3/chat/completions on 2026-08-26.
 * Ark only resolves fully versioned IDs -- the short names shown in the console
 * (e.g. "doubao-seed-2.1-pro") return InvalidEndpointOrModel.NotFound.
 * "doubao-seed-evolving" is the sole unversioned alias that resolves.
 */
export const VOLCENGINE_CHAT_MODELS = [
  // Rolling alias, 1024k context
  {
    id: 'doubao-seed-evolving',
    cost: {
      input: 6.0 / 6.737012 / 1e6,
      output: 30.0 / 6.737012 / 1e6,
      cache_read: 1.2 / 6.737012 / 1e6,
    },
  },
  // Flagship, 256k context
  {
    id: 'doubao-seed-2-1-pro-260628',
    cost: {
      input: 6.0 / 6.737012 / 1e6,
      output: 30.0 / 6.737012 / 1e6,
      cache_read: 1.2 / 6.737012 / 1e6,
    },
  },
  // Faster tier, 256k context
  {
    id: 'doubao-seed-2-1-turbo-260628',
    cost: {
      input: 3.0 / 6.737012 / 1e6,
      output: 15.0 / 6.737012 / 1e6,
      cache_read: 0.6 / 6.737012 / 1e6,
    },
  },
  // 256k context
  {
    id: 'doubao-seed-2-0-pro-260215',
    cost: {
      input: 3.2 / 6.737012 / 1e6,
      output: 16.0 / 6.737012 / 1e6,
      cache_read: 0.64 / 6.737012 / 1e6,
    },
  },
  // 256k context
  {
    id: 'doubao-seed-2-0-lite-260428',
    cost: {
      input: 0.6 / 6.737012 / 1e6,
      output: 3.6 / 6.737012 / 1e6,
      cache_read: 0.12 / 6.737012 / 1e6,
    },
  },
  // 256k context
  {
    id: 'doubao-seed-2-0-lite-260215',
    cost: {
      input: 0.6 / 6.737012 / 1e6,
      output: 3.6 / 6.737012 / 1e6,
      cache_read: 0.12 / 6.737012 / 1e6,
    },
  },
  // 256k context
  {
    id: 'doubao-seed-2-0-mini-260428',
    cost: {
      input: 0.2 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.04 / 6.737012 / 1e6,
    },
  },
  // 256k context
  {
    id: 'doubao-seed-2-0-mini-260215',
    cost: {
      input: 0.2 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.04 / 6.737012 / 1e6,
    },
  },
  // Coding preview, 256k context
  {
    id: 'doubao-seed-2-0-code-preview-260215',
    cost: {
      input: 3.2 / 6.737012 / 1e6,
      output: 16.0 / 6.737012 / 1e6,
      cache_read: 0.64 / 6.737012 / 1e6,
    },
  },
  // Roleplay-tuned, 128k context
  {
    id: 'doubao-seed-character-260628',
    cost: {
      input: 0.8 / 6.737012 / 1e6,
      output: 2.0 / 6.737012 / 1e6,
      cache_read: 0.16 / 6.737012 / 1e6,
    },
  },
  // Zhipu GLM hosted on Ark, 1024k context
  {
    id: 'glm-5-2-260617',
    cost: {
      input: 8.0 / 6.737012 / 1e6,
      output: 28.0 / 6.737012 / 1e6,
      cache_read: 2.0 / 6.737012 / 1e6,
    },
  },
  // DeepSeek hosted on Ark, 1024k context
  {
    id: 'deepseek-v4-pro-ga-260813',
    cost: {
      input: 9.0 / 6.737012 / 1e6,
      output: 27.0 / 6.737012 / 1e6,
      cache_read: 0.3 / 6.737012 / 1e6,
    },
  },
  // DeepSeek hosted on Ark, 1024k context
  {
    id: 'deepseek-v4-pro-260425',
    cost: {
      input: 12.0 / 6.737012 / 1e6,
      output: 24.0 / 6.737012 / 1e6,
      cache_read: 1.0 / 6.737012 / 1e6,
    },
  },
  // DeepSeek hosted on Ark, 1024k context
  {
    id: 'deepseek-v4-flash-ga-260731',
    cost: {
      input: 3.0 / 6.737012 / 1e6,
      output: 9.0 / 6.737012 / 1e6,
      cache_read: 0.1 / 6.737012 / 1e6,
    },
  },
  // DeepSeek hosted on Ark, 1024k context
  {
    id: 'deepseek-v4-flash-260425',
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
  config: Pick<VolcengineConfig, 'cost' | 'inputCost' | 'outputCost' | 'cacheReadCost'>,
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): number | undefined {
  // 0 is a valid token count (e.g. a response that stops before emitting any
  // completion), so only missing / non-finite values should skip pricing.
  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens)
  ) {
    return undefined;
  }

  const rates = VOLCENGINE_CHAT_MODELS.find((model) => model.id === modelName)?.cost;
  const cached = clampCachedTokens(cachedTokens, promptTokens);
  const fresh = promptTokens - cached;
  const inputRate = config.inputCost ?? config.cost ?? rates?.input;
  const outputRate = config.outputCost ?? config.cost ?? rates?.output;
  const cacheRate = config.cacheReadCost ?? config.inputCost ?? config.cost ?? rates?.cache_read;
  if (
    (inputRate == null && outputRate == null && cacheRate == null) ||
    (fresh > 0 && inputRate == null) ||
    (cached > 0 && cacheRate == null) ||
    (completionTokens > 0 && outputRate == null)
  ) {
    return undefined;
  }
  return (
    fresh * (inputRate ?? 0) + cached * (cacheRate ?? 0) + completionTokens * (outputRate ?? 0)
  );
}

export class VolcengineProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, options: ProviderOptions<VolcengineConfig> = {}) {
    const { config, env } = options;
    super(modelName, {
      ...options,
      config: {
        ...config,
        apiKeyEnvar: config?.apiKeyEnvar || 'ARK_API_KEY',
        apiBaseUrl:
          config?.apiBaseUrl ||
          resolveProviderEnv(env, ['ARK_API_BASE_URL'])?.value ||
          ARK_ENDPOINT,
      },
    });
  }

  override getOrganization(): undefined {
    return undefined;
  }

  override getApiUrl(config = this.config): string {
    if (config.apiHost) {
      return `https://${config.apiHost}/v1`;
    }
    return config.apiBaseUrl || this.config.apiBaseUrl || ARK_ENDPOINT;
  }

  override getApiKey(config = this.config): string | undefined {
    return resolveProviderApiKey(config, this.env, ['ARK_API_KEY']);
  }

  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const prepared = await super.getOpenAiBody(prompt, context, callApiOptions);
    const { config, body } = prepared;
    // Ark supplies its own defaults. Only emit options set by the user.
    for (const field of [
      'max_tokens',
      'max_completion_tokens',
      'temperature',
      'top_p',
      'presence_penalty',
      'frequency_penalty',
    ] as const) {
      const value = config.passthrough?.[field] ?? config[field];
      if (value == null) {
        delete body[field];
      } else {
        Object.assign(body, { [field]: value });
      }
    }
    if (body.max_completion_tokens != null) {
      delete body.max_tokens;
    }
    return prepared;
  }

  id(): string {
    return `volcengine:${this.modelName}`;
  }

  toString(): string {
    return `[Volcengine Provider ${this.modelName}]`;
  }

  toJSON() {
    const { apiKey: _apiKey, ...config } = this.config;
    return {
      provider: 'volcengine',
      model: this.modelName,
      config: sanitizeProviderObject(config, 'Ark provider config', true) as Record<
        string,
        unknown
      >,
    };
  }

  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiBillingConfig & { cacheReadCost?: number },
    cached: boolean,
  ): number | undefined {
    const usage = data.usage;
    const cost = calculateVolcengineCost(
      this.getBillingModelName(config),
      config,
      usage?.prompt_tokens,
      usage?.completion_tokens,
      usage?.prompt_tokens_details?.cached_tokens,
    );
    return cached && cost !== undefined ? 0 : cost;
  }
}

// Sub-types this provider does not implement. Ark's embedding and image endpoints
// have different request shapes, so route them to a clear error instead of silently
// POSTing to /chat/completions.
const UNSUPPORTED_SUBTYPES = new Set([
  'embedding',
  'embeddings',
  'image',
  'images',
  'moderation',
  'realtime',
  'responses',
]);

export function createVolcengineProvider(
  providerPath: string,
  options: ProviderOptions<VolcengineConfig> = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const rest = splits.slice(1);

  if (UNSUPPORTED_SUBTYPES.has(rest[0])) {
    throw new Error(
      `Unsupported Volcengine provider type: ${rest[0]}. The volcengine provider only ` +
        `supports chat models, e.g. volcengine:doubao-seed-2-1-pro-260628`,
    );
  }

  // `volcengine` and `volcengine:` both fall back to the default chat model.
  const modelName = rest.join(':') || 'doubao-seed-2-1-pro-260628';
  return new VolcengineProvider(modelName, options);
}
