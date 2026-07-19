import { getEnvString } from '../envars';
import { renderVarsInObject } from '../util/index';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { clampCachedTokens } from './shared';

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

const MOONSHOT_API_BASE_URL = 'https://api.moonshot.ai/v1';
const MOONSHOT_API_KEY_ENVAR = 'MOONSHOT_API_KEY';
const DEFAULT_MOONSHOT_MODEL = 'kimi-k3';

type MoonshotConfig = OpenAiCompletionOptions & {
  // Per-cached-token input rate; Moonshot returns prompt cache hits and they are
  // billed below the normal input rate. Optional, only used when the user also
  // supplies `cost`/`inputCost`/`outputCost`.
  cacheReadCost?: number;
};

type MoonshotProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: MoonshotConfig;
};

function getProviderEnvString(env: EnvOverrides | undefined, key: EnvVarKey): string | undefined {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    const value = env[key as keyof EnvOverrides];
    return value === undefined ? undefined : String(value);
  }
  return undefined;
}

// The Kimi models (kimi-k3, kimi-k2.5 / kimi-k2.6 / kimi-k2.7-code, …) are
// "thinking" models that pin temperature, top_p, n and the penalties to fixed
// values and reject any other value with a 400 ("invalid temperature: only 1
// is allowed for this model"). They emit `reasoning_content` (which counts
// against the output budget) and default to a large server-side budget (32k
// for K2.x, 131k for K3). The moonshot-v1 generation models accept arbitrary
// sampling params, so they keep promptfoo's defaults.
// https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
// https://platform.kimi.ai/docs/guide/use-kimi-k2-thinking-model
function pinsSamplingParams(modelName: string): boolean {
  return /^kimi-/i.test(modelName);
}

/**
 * Moonshot ships no built-in price table — Kimi pricing changes and is
 * documented per-model upstream — so cost is only computed when the user
 * supplies `cost` / `inputCost` / `outputCost`. `inputCost` and `outputCost`
 * take precedence over the flat `cost`. Cached prompt tokens are billed at
 * `cacheReadCost` when provided, otherwise at the input rate.
 */
export function calculateMoonshotCost(
  config: MoonshotConfig,
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): number | undefined {
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) {
    return undefined;
  }

  const inputCost = config.inputCost ?? config.cost;
  const outputCost = config.outputCost ?? config.cost;
  if (inputCost === undefined && outputCost === undefined) {
    return undefined;
  }

  const billableCachedTokens = clampCachedTokens(cachedTokens, promptTokens!);
  const uncachedPromptTokens = promptTokens! - billableCachedTokens;
  const cacheReadCost = config.cacheReadCost ?? inputCost;

  return (
    (inputCost ?? 0) * uncachedPromptTokens +
    (cacheReadCost ?? 0) * billableCachedTokens +
    (outputCost ?? 0) * completionTokens!
  );
}

// Moonshot AI (Kimi) exposes an OpenAI-compatible API, so the standard chat
// provider handles requests once the base URL and key envar are pointed at it.
// https://platform.kimi.ai/docs/api/chat
class MoonshotProvider extends OpenAiChatCompletionProvider {
  config: MoonshotConfig;

  constructor(modelName: string, providerOptions: MoonshotProviderOptions) {
    const moonshotConfig = providerOptions.config ?? {};
    const resolvedConfig: MoonshotConfig = {
      ...moonshotConfig,
      apiKeyEnvar: moonshotConfig.apiKeyEnvar ?? MOONSHOT_API_KEY_ENVAR,
      // Default to the global endpoint but let users point at the China-mainland
      // endpoint (https://api.moonshot.cn/v1) via `apiBaseUrl`.
      apiBaseUrl: moonshotConfig.apiBaseUrl ?? MOONSHOT_API_BASE_URL,
    };

    super(modelName, {
      ...providerOptions,
      config: resolvedConfig,
    });

    this.config = resolvedConfig;
  }

  // Resolve the key from the Moonshot config/envar only — unlike the OpenAI
  // base provider we do NOT fall back to OPENAI_API_KEY, which would send an
  // OpenAI key to Moonshot and 401.
  override getApiKey(): string | undefined {
    if (this.config.apiKey !== undefined) {
      return this.config.apiKey;
    }
    const apiKeyEnvar = this.config.apiKeyEnvar as EnvVarKey | undefined;
    return apiKeyEnvar
      ? (getProviderEnvString(this.env, apiKeyEnvar) ?? getEnvString(apiKeyEnvar))
      : undefined;
  }

  override getApiUrl(): string {
    return this.config.apiBaseUrl ?? MOONSHOT_API_BASE_URL;
  }

  // Moonshot has no concept of an OpenAI organization; suppress the header so a
  // stray OPENAI_ORGANIZATION env var doesn't leak onto Moonshot requests.
  override getOrganization(): undefined {
    return undefined;
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return (
      `Moonshot API key is not set. Set the ${this.config.apiKeyEnvar ?? MOONSHOT_API_KEY_ENVAR} ` +
      'environment variable or add `apiKey` to the provider config.'
    );
  }

  id(): string {
    return `moonshot:${this.modelName}`;
  }

  toString(): string {
    return `[Moonshot Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'moonshot',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }

  // Strip the sampling params promptfoo injects (temperature defaults to 0,
  // max_tokens to 1024, and top_p / penalties can leak from OPENAI_* env vars)
  // for Kimi models, which reject any non-default value and need the larger
  // server-side token budget for reasoning. Anything the user sets explicitly
  // is preserved and forwarded as-is.
  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);

    // reasoning_effort is K3-only per Moonshot's parameter matrix; fail fast on
    // other models instead of silently dropping it or sending it unsupported.
    // https://platform.kimi.ai/docs/api/models-overview
    if (result.config.reasoning_effort !== undefined) {
      if (!/^kimi-k3/i.test(this.modelName)) {
        throw new Error(
          `Moonshot model ${this.modelName} does not support reasoning_effort (kimi-k3 family only). ` +
            'Remove it, use `passthrough: { thinking: ... }` on K2.x, or force-send it via `passthrough: { reasoning_effort: ... }`.',
        );
      }
      result.body.reasoning_effort = renderVarsInObject(
        result.config.reasoning_effort,
        context?.vars,
      );
    }

    if (!pinsSamplingParams(this.modelName)) {
      return result;
    }

    const { body, config } = result;
    if (config.temperature === undefined) {
      delete body.temperature;
    }
    if (config.top_p === undefined) {
      delete body.top_p;
    }
    if (config.presence_penalty === undefined) {
      delete body.presence_penalty;
    }
    if (config.frequency_penalty === undefined) {
      delete body.frequency_penalty;
    }
    // Moonshot's canonical field is max_completion_tokens (max_tokens is a
    // deprecated alias). Honor an explicit value on either field — prompt-level
    // config beats provider-level regardless of which alias each layer used —
    // and drop the base provider's injected max_tokens: 1024 default so
    // reasoning can use Moonshot's server budget (32k for K2.x, 131k for K3).
    const promptConfig = (context?.prompt?.config ?? {}) as OpenAiCompletionOptions;
    const maxTokens =
      promptConfig.max_completion_tokens ??
      promptConfig.max_tokens ??
      config.max_completion_tokens ??
      config.max_tokens;
    delete body.max_tokens;
    if (maxTokens === undefined) {
      delete body.max_completion_tokens;
    } else {
      body.max_completion_tokens = maxTokens;
    }
    return result;
  }

  // promptfoo has no Moonshot price table, so cost comes from user-provided
  // rates. Cached tokens live in the documented top-level usage.cached_tokens;
  // the OpenAI-style prompt_tokens_details mirror is undocumented.
  // https://platform.kimi.ai/docs/api/chat
  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): number | undefined {
    if (cached) {
      return undefined;
    }
    const usage = data.usage as
      | (NonNullable<OpenAiChatCompletionCostData['usage']> & { cached_tokens?: number })
      | undefined;
    const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? usage?.cached_tokens;
    // config is the provider config merged with prompt-level overrides.
    return calculateMoonshotCost(
      config as MoonshotConfig,
      usage?.prompt_tokens,
      usage?.completion_tokens,
      typeof cachedTokens === 'number' ? cachedTokens : 0,
    );
  }
}

export function createMoonshotProvider(
  providerPath: string,
  options: MoonshotProviderOptions = {},
): ApiProvider {
  // Accept `moonshot:<model>` and `moonshot:chat:<model>`; everything after the
  // optional `chat:` segment is the model id (which can itself contain colons).
  const splits = providerPath.split(':');
  const rest = splits.slice(1);
  if (rest[0] === 'chat') {
    rest.shift();
  }
  const modelName = rest.join(':') || DEFAULT_MOONSHOT_MODEL;
  return new MoonshotProvider(modelName, options);
}
