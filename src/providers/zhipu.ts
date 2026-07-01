import { getEnvString } from '../envars';
import { renderVarsInObject } from '../util';
import { OpenAiChatCompletionProvider } from './openai/chat';

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

// Default to the international Z.ai endpoint (the English-facing brand); mainland
// users can point `apiBaseUrl` at https://open.bigmodel.cn/api/paas/v4 instead.
const ZHIPU_API_BASE_URL = 'https://api.z.ai/api/paas/v4';
const ZHIPU_API_KEY_ENVAR = 'ZHIPU_API_KEY';
const DEFAULT_ZHIPU_MODEL = 'glm-5.2';

type ZhipuConfig = OpenAiCompletionOptions & {
  // Per-cached-token input rate, used only when the user also supplies cost rates.
  cacheReadCost?: number;
  // GLM-native reasoning on/off toggle (`reasoning_effort` sets the budget when on).
  thinking?: { type: 'enabled' | 'disabled' };
};

type ZhipuProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: ZhipuConfig;
};

function getProviderEnvString(env: EnvOverrides | undefined, key: EnvVarKey): string | undefined {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    const value = env[key as keyof EnvOverrides];
    return value === undefined ? undefined : String(value);
  }
  return undefined;
}

// No built-in GLM price table (pricing changes upstream), so cost is only
// computed from user-supplied `cost` / `inputCost` / `outputCost` rates.
export function calculateZhipuCost(
  config: ZhipuConfig,
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

  const billableCachedTokens = Number.isFinite(cachedTokens)
    ? Math.min(Math.max(cachedTokens!, 0), promptTokens!)
    : 0;
  const uncachedPromptTokens = promptTokens! - billableCachedTokens;
  const cacheReadCost = config.cacheReadCost ?? inputCost;

  return (
    (inputCost ?? 0) * uncachedPromptTokens +
    (cacheReadCost ?? 0) * billableCachedTokens +
    (outputCost ?? 0) * completionTokens!
  );
}

// Zhipu AI (GLM) exposes an OpenAI-compatible API, so the chat provider handles
// requests once the base URL and key envar point at it. https://docs.z.ai/
class ZhipuProvider extends OpenAiChatCompletionProvider {
  config: ZhipuConfig;

  constructor(modelName: string, providerOptions: ZhipuProviderOptions) {
    const zhipuConfig = providerOptions.config ?? {};
    const resolvedConfig: ZhipuConfig = {
      ...zhipuConfig,
      apiKeyEnvar: zhipuConfig.apiKeyEnvar ?? ZHIPU_API_KEY_ENVAR,
      apiBaseUrl: zhipuConfig.apiBaseUrl ?? ZHIPU_API_BASE_URL,
    };

    super(modelName, {
      ...providerOptions,
      config: resolvedConfig,
    });

    this.config = resolvedConfig;
  }

  // Resolve from the Zhipu config/envar only; do NOT fall back to OPENAI_API_KEY.
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
    return this.config.apiBaseUrl ?? ZHIPU_API_BASE_URL;
  }

  // No OpenAI organization concept; suppress the header so OPENAI_ORGANIZATION can't leak.
  override getOrganization(): undefined {
    return undefined;
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return (
      `Zhipu API key is not set. Set the ${this.config.apiKeyEnvar ?? ZHIPU_API_KEY_ENVAR} ` +
      'environment variable or add `apiKey` to the provider config.'
    );
  }

  id(): string {
    return `zhipu:${this.modelName}`;
  }

  toString(): string {
    return `[Zhipu Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'zhipu',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }

  // Forward GLM's `thinking` / `reasoning_effort` from the merged config; the base skips GLM.
  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    const { body } = result;
    const config = result.config as ZhipuConfig;

    const thinking = config.thinking
      ? renderVarsInObject(config.thinking, context?.vars)
      : undefined;
    if (thinking) {
      body.thinking = thinking;
    }

    // Drop reasoning_effort when reasoning is off, so GLM gets no contradictory controls.
    if (config.reasoning_effort !== undefined) {
      if (thinking?.type === 'disabled') {
        delete body.reasoning_effort;
      } else {
        body.reasoning_effort = renderVarsInObject(config.reasoning_effort, context?.vars);
      }
    }

    // The base injects a 1024 max_tokens default and only forwards max_completion_tokens for
    // OpenAI reasoning models; GLM uses max_tokens, so map it across and drop the default.
    const maxTokens = config.max_tokens ?? config.max_completion_tokens;
    if (maxTokens === undefined) {
      delete body.max_tokens;
    } else {
      body.max_tokens = maxTokens;
    }
    delete body.max_completion_tokens;

    return result;
  }

  override async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const response = await super.callApi(prompt, context, callApiOptions);

    if (!response || response.error || response.cached || response.cost !== undefined) {
      return response;
    }

    // Fill in cost from user rates (merged with prompt-level overrides).
    if (response.tokenUsage) {
      const config = { ...this.config, ...(context?.prompt?.config as ZhipuConfig | undefined) };
      const cachedTokens =
        response.tokenUsage.completionDetails?.cacheReadInputTokens ??
        extractCachedTokens(response.raw);
      const cost = calculateZhipuCost(
        config,
        response.tokenUsage.prompt,
        response.tokenUsage.completion,
        cachedTokens,
      );
      if (cost !== undefined) {
        response.cost = cost;
      }
    }

    return response;
  }
}

export function extractCachedTokens(raw: unknown): number {
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return 0;
    }
  }
  const cached = parsed?.usage?.prompt_tokens_details?.cached_tokens;
  return typeof cached === 'number' ? cached : 0;
}

export function createZhipuProvider(
  providerPath: string,
  options: ZhipuProviderOptions = {},
): ApiProvider {
  // Chat-only provider: accept `zhipu:<model>` and `zhipu:chat:<model>`, reject other sub-types.
  const rest = providerPath.split(':').slice(1);
  if (rest.length > 1 && rest[0] !== 'chat') {
    throw new Error(
      `Unsupported Zhipu sub-type "${rest[0]}": the Zhipu provider only supports chat models (use "zhipu:<model>").`,
    );
  }
  if (rest[0] === 'chat') {
    rest.shift();
  }
  const modelName = rest.join(':') || DEFAULT_ZHIPU_MODEL;
  return new ZhipuProvider(modelName, options);
}
