import { getEnvString } from '../envars';
import { renderVarsInObject } from '../util';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { clampCachedTokens, getProviderEnvString } from './shared';

import type { EnvVarKey } from '../envars';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

// International Z.ai endpoint; mainland users can point `apiBaseUrl` at
// https://open.bigmodel.cn/api/paas/v4 instead.
const ZHIPU_API_BASE_URL = 'https://api.z.ai/api/paas/v4';
const ZHIPU_API_KEY_ENVAR = 'ZHIPU_API_KEY';
// Z.ai's own OpenAI-SDK examples use ZAI_API_KEY, so accept it too.
const ZAI_API_KEY_ENVAR = 'ZAI_API_KEY';
const DEFAULT_ZHIPU_MODEL = 'glm-5.2';

// Non-chat sub-types to reject up front, since the registry routes every
// `zhipu:*` path to this chat-only provider.
const NON_CHAT_SUBTYPES = new Set([
  'embedding',
  'embeddings',
  'image',
  'images',
  'audio',
  'transcription',
  'transcriptions',
  'video',
  'videos',
  'rerank',
  'reranker',
  'moderation',
  'moderations',
  'responses',
  'files',
  'batch',
  'batches',
]);

// Content-safety rejection (HTTP 400). https://docs.z.ai/api-reference/api-code
const ZHIPU_SAFETY_ERROR_CODE = 1301;
// finish_reason when generation is blocked. https://docs.z.ai/api-reference/llm/chat-completion
const ZHIPU_SENSITIVE_FINISH_REASON = 'sensitive';

type ZhipuConfig = OpenAiCompletionOptions & {
  cacheReadCost?: number;
  // GLM-native reasoning on/off toggle.
  thinking?: { type: 'enabled' | 'disabled' };
};

type ZhipuProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: ZhipuConfig;
};

// Built-in GLM pricing (USD per token), fallback when the user supplies no rates.
// https://docs.z.ai/guides/overview/pricing — update when upstream prices drift.
export const ZHIPU_CHAT_MODELS: {
  id: string;
  cost: { input: number; output: number; cacheRead?: number };
}[] = [
  { id: 'glm-5.2', cost: { input: 1.4 / 1e6, output: 4.4 / 1e6, cacheRead: 0.26 / 1e6 } },
  { id: 'glm-5.1', cost: { input: 1.4 / 1e6, output: 4.4 / 1e6, cacheRead: 0.26 / 1e6 } },
  { id: 'glm-5', cost: { input: 1.0 / 1e6, output: 3.2 / 1e6, cacheRead: 0.2 / 1e6 } },
  { id: 'glm-5-turbo', cost: { input: 1.2 / 1e6, output: 4.0 / 1e6, cacheRead: 0.24 / 1e6 } },
  { id: 'glm-4.7', cost: { input: 0.6 / 1e6, output: 2.2 / 1e6, cacheRead: 0.11 / 1e6 } },
  { id: 'glm-4.7-flashx', cost: { input: 0.07 / 1e6, output: 0.4 / 1e6, cacheRead: 0.01 / 1e6 } },
  { id: 'glm-4.7-flash', cost: { input: 0, output: 0, cacheRead: 0 } },
  { id: 'glm-4.6', cost: { input: 0.6 / 1e6, output: 2.2 / 1e6, cacheRead: 0.11 / 1e6 } },
  { id: 'glm-4.5', cost: { input: 0.6 / 1e6, output: 2.2 / 1e6, cacheRead: 0.11 / 1e6 } },
  { id: 'glm-4.5-x', cost: { input: 2.2 / 1e6, output: 8.9 / 1e6, cacheRead: 0.45 / 1e6 } },
  { id: 'glm-4.5-air', cost: { input: 0.2 / 1e6, output: 1.1 / 1e6, cacheRead: 0.03 / 1e6 } },
  { id: 'glm-4.5-airx', cost: { input: 1.1 / 1e6, output: 4.5 / 1e6, cacheRead: 0.22 / 1e6 } },
  { id: 'glm-4.5-flash', cost: { input: 0, output: 0, cacheRead: 0 } },
  { id: 'glm-4-32b-0414-128k', cost: { input: 0.1 / 1e6, output: 0.1 / 1e6 } },
  // Vision models are also served via /chat/completions.
  { id: 'glm-5v-turbo', cost: { input: 1.2 / 1e6, output: 4.0 / 1e6, cacheRead: 0.24 / 1e6 } },
  { id: 'glm-4.6v', cost: { input: 0.3 / 1e6, output: 0.9 / 1e6, cacheRead: 0.05 / 1e6 } },
  { id: 'glm-4.6v-flashx', cost: { input: 0.04 / 1e6, output: 0.4 / 1e6, cacheRead: 0.004 / 1e6 } },
  { id: 'glm-4.6v-flash', cost: { input: 0, output: 0, cacheRead: 0 } },
  { id: 'glm-4.5v', cost: { input: 0.6 / 1e6, output: 1.8 / 1e6, cacheRead: 0.11 / 1e6 } },
  { id: 'glm-ocr', cost: { input: 0.03 / 1e6, output: 0.03 / 1e6 } },
];

// User rates take precedence over the built-in table; unknown model + no rates => undefined.
export function calculateZhipuCost(
  modelName: string,
  config: ZhipuConfig,
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): number | undefined {
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) {
    return undefined;
  }

  const model = ZHIPU_CHAT_MODELS.find((m) => m.id === modelName);
  const userInputRate = config.inputCost ?? config.cost;
  const inputCost = userInputRate ?? model?.cost.input;
  const outputCost = config.outputCost ?? config.cost ?? model?.cost.output;
  if (inputCost === undefined && outputCost === undefined) {
    return undefined;
  }

  const billableCachedTokens = clampCachedTokens(cachedTokens, promptTokens!);
  const uncachedPromptTokens = promptTokens! - billableCachedTokens;
  // A user-supplied input rate applies to cached tokens too (unless cacheReadCost is set),
  // so an override isn't silently mixed with the table's cache rate.
  const cacheReadCost = config.cacheReadCost ?? userInputRate ?? model?.cost.cacheRead ?? inputCost;

  return (
    (inputCost ?? 0) * uncachedPromptTokens +
    (cacheReadCost ?? 0) * billableCachedTokens +
    (outputCost ?? 0) * completionTokens!
  );
}

// The OpenAI base serializes the 400 error body into the returned error string.
// `(?!\d)` guards against matching a longer code that happens to start with 1301.
// No `g` flag, so the shared instance carries no `lastIndex` state between calls.
const ZHIPU_SAFETY_ERROR_RE = new RegExp(`"code":\\s*"?${ZHIPU_SAFETY_ERROR_CODE}"?(?!\\d)`);

function isZhipuSafetyError(error: string): boolean {
  return ZHIPU_SAFETY_ERROR_RE.test(error);
}

// Zhipu AI (GLM) exposes an OpenAI-compatible API. https://docs.z.ai/
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

  // Resolve from the Zhipu config/envars only; do NOT fall back to OPENAI_API_KEY.
  override getApiKey(): string | undefined {
    if (this.config.apiKey !== undefined) {
      return this.config.apiKey;
    }
    const apiKeyEnvar = this.config.apiKeyEnvar as EnvVarKey | undefined;
    const fromConfiguredEnvar = apiKeyEnvar
      ? (getProviderEnvString(this.env, apiKeyEnvar) ?? getEnvString(apiKeyEnvar))
      : undefined;
    if (fromConfiguredEnvar !== undefined) {
      return fromConfiguredEnvar;
    }
    // Fall back to Z.ai's own ZAI_API_KEY convention.
    return (
      getProviderEnvString(this.env, ZAI_API_KEY_ENVAR as EnvVarKey) ??
      getEnvString(ZAI_API_KEY_ENVAR as EnvVarKey)
    );
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
      `(or ${ZAI_API_KEY_ENVAR}) environment variable or add \`apiKey\` to the provider config.`
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

    // GLM uses max_tokens; map max_completion_tokens across and drop the base's 1024 default.
    // Prompt-level config beats provider-level regardless of which alias each layer used.
    const promptConfig = (context?.prompt?.config ?? {}) as ZhipuConfig;
    const maxTokens =
      promptConfig.max_tokens ??
      promptConfig.max_completion_tokens ??
      this.config.max_tokens ??
      this.config.max_completion_tokens;
    if (maxTokens === undefined) {
      delete body.max_tokens;
    } else {
      body.max_tokens = maxTokens;
    }
    delete body.max_completion_tokens;

    // Z.ai names the end-user identifier `user_id`, not OpenAI's `user`.
    if (body.user !== undefined) {
      body.user_id = body.user;
      delete body.user;
    }

    return result;
  }

  override async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const response = await super.callApi(prompt, context, callApiOptions);

    if (!response) {
      return response;
    }

    // Map a 400 content-safety rejection (code 1301) to a guardrail block.
    if (response.error) {
      if (isZhipuSafetyError(response.error)) {
        return {
          ...response,
          error: undefined,
          output: response.output ?? response.error,
          isRefusal: true,
          guardrails: {
            ...response.guardrails,
            flagged: true,
            flaggedInput: true,
            reason: response.error,
          },
        };
      }
      return response;
    }

    // Map a generation blocked mid-stream (finish_reason "sensitive") to a guardrail block.
    if (response.finishReason === ZHIPU_SENSITIVE_FINISH_REASON && !response.guardrails?.flagged) {
      response.guardrails = {
        ...response.guardrails,
        flagged: true,
        flaggedOutput: true,
        reason: 'Zhipu flagged the generated content as sensitive',
      };
      response.isRefusal = true;
    }

    if (response.cached || response.cost !== undefined) {
      return response;
    }

    // Merge prompt-level overrides before pricing.
    if (response.tokenUsage) {
      const config = { ...this.config, ...(context?.prompt?.config as ZhipuConfig | undefined) };
      const cachedTokens =
        response.tokenUsage.completionDetails?.cacheReadInputTokens ??
        extractCachedTokens(response.raw);
      const cost = calculateZhipuCost(
        this.modelName,
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
  // Accept `zhipu:<model>` and `zhipu:chat:<model>`; fail fast on non-chat sub-types.
  const rest = providerPath.split(':').slice(1);
  if (NON_CHAT_SUBTYPES.has(rest[0]) || (rest.length > 1 && rest[0] !== 'chat')) {
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
