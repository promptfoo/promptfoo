import { createHmac } from 'crypto';

import {
  fetchWithCache,
  getAbortSignalScopedKey,
  getCache,
  getScopedCacheKey,
  isCacheEnabled,
} from '../cache';
import { getEnvString, getProviderEnvString } from '../envars';
import logger from '../logger';
import { extractGenAIResponse, type GenAISpanContext, withGenAISpan } from '../tracing/genaiTracer';
import { maybeLoadToolsFromExternalFile } from '../util';
import { isSafeTokenCount } from '../util/numeric';
import { resolveProviderEnv } from './env';
import { calculateCost, clampCachedTokens, getRequestTimeoutMs, parseChatPrompt } from './shared';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
  TokenUsage,
} from '../types/index';

// `cacheRead` is the per-token price of prompt tokens served from Mistral's prompt cache, as
// listed on https://docs.mistral.ai/inference/pricing. Models without a listed rate use
// MISTRAL_DEFAULT_CACHE_READ_RATIO of the input price.
function modelsWithCost(
  ids: string[],
  cost: { input: number; output: number; cacheRead?: number },
) {
  return ids.map((id) => ({ id, cost: { ...cost } }));
}

// Mistral bills cached prompt tokens at 10% of the input price:
// https://docs.mistral.ai/inference/conversations/advanced/prompt-caching
const MISTRAL_DEFAULT_CACHE_READ_RATIO = 0.1;

function getMistralApiUrl(
  config: { apiHost?: string; apiBaseUrl?: string },
  env: EnvOverrides | undefined,
  defaultUrl: string,
): string {
  if (config.apiHost) {
    return `https://${config.apiHost}/v1`;
  }
  if (config.apiBaseUrl) {
    return config.apiBaseUrl;
  }
  const endpoint = resolveProviderEnv(env, ['MISTRAL_API_HOST', 'MISTRAL_API_BASE_URL']);
  return endpoint
    ? endpoint.name === 'MISTRAL_API_HOST'
      ? `https://${endpoint.value}/v1`
      : endpoint.value
    : defaultUrl;
}

const MISTRAL_CHAT_MODELS = [
  // Z.ai GLM 5.3 hosted by Mistral: https://docs.mistral.ai/models/zai-glm-5-3
  ...modelsWithCost(['zai-glm-5-3', 'zai-glm-5', 'zai-glm-latest'], {
    input: 1.4 / 1000000,
    output: 4.4 / 1000000,
    cacheRead: 0.14 / 1000000,
  }),
  // Z.ai GLM 5.3 Flash hosted by Mistral: https://docs.mistral.ai/models/zai-glm-5-3-flash
  ...modelsWithCost(['zai-glm-5-3-flash'], {
    input: 0.15 / 1000000,
    output: 0.5 / 1000000,
    cacheRead: 0.03 / 1000000,
  }),
  // DeepSeek V4.1 Flash 1017 hosted by Mistral: https://docs.mistral.ai/models/deepseek-v4-flash-1017
  ...modelsWithCost(['deepseek-v4-1-flash-1017'], {
    input: 0.3 / 1000000,
    output: 1.2 / 1000000,
    cacheRead: 0.007 / 1000000,
  }),
  ...modelsWithCost(['open-mistral-7b', 'mistral-tiny', 'mistral-tiny-2312'], {
    input: 0.25 / 1000000,
    output: 0.25 / 1000000,
  }),
  // Mistral NeMo (deprecated 2026-05-22) — retained for historical cost scoring.
  ...modelsWithCost(
    ['open-mistral-nemo', 'open-mistral-nemo-2407', 'mistral-tiny-2407', 'mistral-tiny-latest'],
    {
      input: 0.15 / 1000000,
      output: 0.15 / 1000000,
    },
  ),
  ...modelsWithCost(['mistral-small-2402'], {
    input: 1 / 1000000,
    output: 3 / 1000000,
  }),
  // Mistral Small 3.2 (deprecated 2026-04-30) — historical pricing for cached results
  ...modelsWithCost(['mistral-small-2506'], {
    input: 0.1 / 1000000,
    output: 0.3 / 1000000,
  }),
  // Mistral Small 4 — `mistral-small-latest` resolves to `mistral-small-2603`.
  ...modelsWithCost(['mistral-small-2603', 'mistral-small-latest'], {
    input: 0.15 / 1000000,
    output: 0.6 / 1000000,
    cacheRead: 0.015 / 1000000,
  }),
  // Mistral Medium 1 (retired) — historical pricing for cached results.
  ...modelsWithCost(['mistral-medium-2312'], {
    input: 2.7 / 1000000,
    output: 8.1 / 1000000,
  }),
  // Mistral Medium 3 / 3.1 (deprecated) — historical pricing for cached results
  ...modelsWithCost(['mistral-medium-2505', 'mistral-medium-2508'], {
    input: 0.4 / 1000000,
    output: 2 / 1000000,
  }),
  // Mistral Medium 3.5 published aliases plus compatibility IDs retained from
  // live API/catalog verification for existing configs and cached-result costs.
  ...modelsWithCost(
    [
      'mistral-medium-3-5',
      'mistral-medium-3',
      'mistral-medium-latest',
      'mistral-medium',
      'mistral-medium-3.5',
      'mistral-medium-2604',
    ],
    {
      input: 1.5 / 1000000,
      output: 7.5 / 1000000,
    },
  ),
  ...modelsWithCost(['mistral-large-2402'], {
    input: 4 / 1000000,
    output: 12 / 1000000,
  }),
  ...modelsWithCost(['mistral-large-2407'], {
    input: 3 / 1000000,
    output: 9 / 1000000,
  }),
  // Mistral Large 3 (deprecated 2026-10-31) — historical pricing for cached results.
  ...modelsWithCost(['mistral-large-2512'], {
    input: 0.5 / 1000000,
    output: 1.5 / 1000000,
  }),
  // Mistral Large 4 — `mistral-large-latest` resolves to it.
  ...modelsWithCost(['mistral-large-4', 'mistral-large-4-0', 'mistral-large-latest'], {
    input: 0.7 / 1000000,
    output: 2.1 / 1000000,
    cacheRead: 0.07 / 1000000,
  }),
  ...modelsWithCost(['codestral-2405'], {
    input: 1 / 1000000,
    output: 3 / 1000000,
  }),
  // Codestral — also aliased by the Mistral Code product ids
  ...modelsWithCost(
    ['codestral-2508', 'codestral-latest', 'mistral-code-latest', 'mistral-code-fim-latest'],
    {
      input: 0.3 / 1000000,
      output: 0.9 / 1000000,
      cacheRead: 0.03 / 1000000,
    },
  ),
  ...modelsWithCost(['codestral-mamba-2407', 'open-codestral-mamba', 'codestral-mamba-latest'], {
    input: 0.25 / 1000000,
    output: 0.25 / 1000000,
  }),
  ...modelsWithCost(['open-mixtral-8x7b', 'mistral-small', 'mistral-small-2312'], {
    input: 0.7 / 1000000,
    output: 0.7 / 1000000,
  }),
  ...modelsWithCost(['open-mixtral-8x22b', 'open-mixtral-8x22b-2404'], {
    input: 2 / 1000000,
    output: 6 / 1000000,
  }),
  // Magistral Small standalone reasoning snapshots. The deprecated
  // `magistral-small-latest` alias still resolves to the 2509 snapshot.
  ...modelsWithCost(
    [
      'magistral-small-2506',
      'magistral-small-2507',
      'magistral-small-2509',
      'magistral-small-latest',
    ],
    {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000,
    },
  ),
  ...modelsWithCost(
    [
      'magistral-medium-2506',
      'magistral-medium-2507',
      'magistral-medium-2509',
      'magistral-medium-latest',
    ],
    {
      input: 2 / 1000000,
      output: 5 / 1000000,
    },
  ),
  ...modelsWithCost(['ministral-3b-2512', 'ministral-3b-latest'], {
    input: 0.1 / 1000000,
    output: 0.1 / 1000000,
    cacheRead: 0.01 / 1000000,
  }),
  ...modelsWithCost(['ministral-8b-2512', 'ministral-8b-latest'], {
    input: 0.15 / 1000000,
    output: 0.15 / 1000000,
    cacheRead: 0.015 / 1000000,
  }),
  ...modelsWithCost(['ministral-14b-2512', 'ministral-14b-latest'], {
    input: 0.2 / 1000000,
    output: 0.2 / 1000000,
    cacheRead: 0.02 / 1000000,
  }),
  // Leanstral 1.5 public preview (retires 2026-09-30).
  ...modelsWithCost(['labs-leanstral-1-5'], {
    input: 0,
    output: 0,
  }),
  // Voxtral Small token pricing. Mistral bills audio input separately per minute.
  ...modelsWithCost(['voxtral-small-2507'], {
    input: 0.1 / 1000000,
    output: 0.4 / 1000000,
  }),
  // Devstral 2 (deprecated 2026-05-22) — retained for historical cost scoring.
  ...modelsWithCost(
    ['devstral-2512', 'devstral-latest', 'devstral-medium-latest', 'mistral-code-agent-latest'],
    {
      input: 0.4 / 1000000,
      output: 2 / 1000000,
    },
  ),
  // Legacy multimodal model
  ...modelsWithCost(['pixtral-12b'], {
    input: 0.15 / 1000000,
    output: 0.15 / 1000000,
  }),
];

// Models that always reason: they reject `reasoning_effort: none` and return a thinking chunk
// before the answer, so the default 1024-token cap can be spent before any answer text.
// https://docs.mistral.ai/inference/conversations/reasoning
const MISTRAL_ALWAYS_REASONING_MODELS = new Set([
  'mistral-large-4',
  'mistral-large-4-0',
  'mistral-large-latest',
  'zai-glm-5-3',
  'zai-glm-5',
  'zai-glm-latest',
  'zai-glm-5-3-flash',
]);

const MISTRAL_EMBEDDING_MODELS = [
  ...modelsWithCost(['mistral-embed', 'mistral-embed-2312'], {
    input: 0.1 / 1000000,
    output: 0.1 / 1000000,
  }),
  ...modelsWithCost(['codestral-embed', 'codestral-embed-2505'], {
    input: 0.15 / 1000000,
    output: 0.15 / 1000000,
  }),
];

// Accepted values vary by model: Mistral Small 4 and Medium 3.5 take `none | high`, Mistral
// Large 4 takes `low | medium | high`, and Z.ai GLM 5.3 takes `low | high | max`.
type MistralReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'max';

interface MistralChatCompletionOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  tools?: unknown;
  tool_choice?:
    | 'none'
    | 'auto'
    | 'any'
    | 'required'
    | { type: 'function'; function?: { name: string } };
  parallel_tool_calls?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  n?: number;
  safe_prompt?: boolean;
  random_seed?: number;
  response_format?:
    | { type: 'text' }
    | { type: 'json_object' }
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          schema: Record<string, unknown>;
        };
      };
  prompt_mode?: 'reasoning' | null;
  reasoning_effort?: MistralReasoningEffort;
  prompt_cache_key?: string;
  prediction?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  guardrails?: Array<Record<string, unknown>> | null;
  cost?: number;
  inputCost?: number;
  outputCost?: number;
  /** Per-token price for prompt tokens Mistral reports as served from its prompt cache. */
  cacheReadCost?: number;
}

const MISTRAL_CACHE_HASH_KEY = 'promptfoo:mistral:cache-key:v1';
const MISTRAL_INFLIGHT_REQUESTS = new Map<string, Promise<MistralFetchResult>>();

type MistralFetchResult = { data: any; cached: boolean; status?: number; statusText?: string };

function hashMistralCacheValue(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return createHmac('sha256', MISTRAL_CACHE_HASH_KEY)
    .update(serialized ?? String(value))
    .digest('hex');
}

function getMistralCacheKey(
  kind: 'chat' | 'embedding',
  model: string,
  apiUrl: string,
  apiKey: string,
  request: unknown,
): string {
  const prefix = `mistral:${kind}:${model}`;
  const endpointHash = hashMistralCacheValue({ apiUrl });
  const authNamespace = createHmac('sha256', apiKey).update(MISTRAL_CACHE_HASH_KEY).digest('hex');
  return `${prefix}:${endpointHash}:${authNamespace}:${hashMistralCacheValue(request)}`;
}

function fetchMistralWithDedupe(
  cacheKey: string,
  fetcher: () => Promise<MistralFetchResult>,
  abortSignal?: AbortSignal,
): Promise<MistralFetchResult> {
  const inflightCacheKey = getAbortSignalScopedKey(getScopedCacheKey(cacheKey), abortSignal);
  let inflightRequest = MISTRAL_INFLIGHT_REQUESTS.get(inflightCacheKey);
  if (!inflightRequest) {
    inflightRequest = fetcher().finally(() => {
      MISTRAL_INFLIGHT_REQUESTS.delete(inflightCacheKey);
    });
    MISTRAL_INFLIGHT_REQUESTS.set(inflightCacheKey, inflightRequest);
  }
  return inflightRequest;
}

function getMistralUrlMetadata(url: string) {
  try {
    const parsedUrl = new URL(url);
    return {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      pathnameLength: parsedUrl.pathname.length,
      hasSearch: parsedUrl.search.length > 0,
    };
  } catch {
    return {
      valid: false,
      length: url.length,
    };
  }
}

function getSafeToolChoice(toolChoice: MistralChatCompletionOptions['tool_choice'] | undefined) {
  if (typeof toolChoice === 'string') {
    return ['none', 'auto', 'any', 'required'].includes(toolChoice) ? toolChoice : 'other';
  }
  if (toolChoice && typeof toolChoice === 'object') {
    return toolChoice.type === 'function' ? 'function' : 'object';
  }
  return undefined;
}

function getMistralRequestMetadata(params: {
  model: string;
  messages?: unknown;
  tools?: unknown;
  tool_choice?: MistralChatCompletionOptions['tool_choice'];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  n?: number;
  safe_prompt?: boolean;
  random_seed?: number | null;
  prompt_mode?: 'reasoning' | null;
  reasoning_effort?: MistralReasoningEffort;
  prediction?: unknown;
  metadata?: unknown;
  guardrails?: unknown;
  parallel_tool_calls?: boolean;
  response_format?: unknown;
}) {
  return {
    model: params.model,
    messageCount: Array.isArray(params.messages) ? params.messages.length : undefined,
    temperature: params.temperature,
    top_p: params.top_p,
    max_tokens: params.max_tokens,
    frequency_penalty: params.frequency_penalty,
    presence_penalty: params.presence_penalty,
    stopCount: Array.isArray(params.stop) ? params.stop.length : params.stop ? 1 : undefined,
    n: params.n,
    safe_prompt: params.safe_prompt,
    random_seed: params.random_seed,
    prompt_mode: params.prompt_mode,
    reasoning_effort: params.reasoning_effort,
    toolCount: Array.isArray(params.tools) ? params.tools.length : undefined,
    hasTools: params.tools !== undefined,
    tool_choice: getSafeToolChoice(params.tool_choice),
    parallel_tool_calls: params.parallel_tool_calls,
    hasResponseFormat: params.response_format !== undefined,
    hasPrediction: params.prediction !== undefined,
    hasMetadata: params.metadata !== undefined,
    guardrailCount: Array.isArray(params.guardrails) ? params.guardrails.length : undefined,
  };
}

function getMistralResponseMetadata(data: any) {
  const usage = data?.usage;
  return {
    choiceCount: Array.isArray(data?.choices) ? data.choices.length : undefined,
    hasError: data?.error !== undefined,
    hasUsage: usage !== undefined,
    totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : undefined,
    promptTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
    completionTokens:
      typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined,
  };
}

function getMistralEmbeddingResponseMetadata(data: any) {
  const usage = data?.usage;
  return {
    embeddingCount: Array.isArray(data?.data) ? data.data.length : undefined,
    hasError: data?.error !== undefined,
    hasUsage: usage !== undefined,
    totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : undefined,
    promptTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
  };
}

const MAX_MISTRAL_ERROR_DETAIL_LENGTH = 500;

function isHttpFailure(status: number | undefined): status is number {
  return status !== undefined && (status < 200 || status >= 300);
}

/**
 * Human-readable message from a Mistral error body. Shapes per
 * https://docs.mistral.ai/resources/error-glossary:
 * - most errors: `{ object: 'error', message, type, param, code, raw_status_code }`
 * - 401: `{ detail: 'Invalid API Key' }`
 * - 422: `{ detail: [{ loc, msg, ... }] }`
 * - OpenAI-compatible endpoint: the error object wrapped in `error`
 */
function getMistralErrorMessage(data: unknown): string | undefined {
  if (typeof data === 'string') {
    return data.trim().slice(0, MAX_MISTRAL_ERROR_DETAIL_LENGTH) || undefined;
  }
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const body = data as Record<string, any>;
  if (typeof body.error === 'string') {
    return body.error;
  }
  const error = body.error && typeof body.error === 'object' ? body.error : body;
  if (typeof error.message === 'string') {
    const details = [
      typeof error.type === 'string' ? error.type : undefined,
      typeof error.code === 'string' || typeof error.code === 'number'
        ? `code ${error.code}`
        : undefined,
    ].filter(Boolean);
    return details.length > 0 ? `${error.message} (${details.join(', ')})` : error.message;
  }
  if (typeof body.detail === 'string') {
    return body.detail;
  }
  if (Array.isArray(body.detail)) {
    // Only field locations and messages: a 422 item's `input` echoes the request.
    const issues = body.detail
      .map((issue: any) => {
        const location = Array.isArray(issue?.loc) ? issue.loc.join('.') : undefined;
        const message = typeof issue?.msg === 'string' ? issue.msg : undefined;
        return location && message ? `${location}: ${message}` : message;
      })
      .filter(Boolean);
    if (issues.length > 0) {
      return issues.join('; ');
    }
  }
  return undefined;
}

function formatMistralHttpError(status: number, statusText: string | undefined, data: unknown) {
  const detail = getMistralErrorMessage(data);
  return `Mistral API error ${status}${statusText ? ` ${statusText}` : ''}${detail ? `: ${detail}` : ''}`;
}

function getMistralErrorMetadata(error: any) {
  return {
    code:
      typeof error?.code === 'string' || typeof error?.code === 'number' ? error.code : undefined,
    hasMessage: typeof error?.message === 'string',
    type: typeof error?.type === 'string' ? error.type : undefined,
  };
}

function buildMistralChatParams(
  modelName: string,
  messages: unknown,
  config: MistralChatCompletionOptions,
  loadedTools: unknown,
) {
  const hasTools = Array.isArray(loadedTools) ? loadedTools.length > 0 : loadedTools !== undefined;
  const maxTokens =
    config.max_tokens ?? (MISTRAL_ALWAYS_REASONING_MODELS.has(modelName) ? undefined : 1024);

  return {
    model: modelName,
    messages,
    temperature: config.temperature,
    top_p: config.top_p ?? 1,
    ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
    ...(config.frequency_penalty === undefined
      ? {}
      : { frequency_penalty: config.frequency_penalty }),
    ...(config.presence_penalty === undefined ? {} : { presence_penalty: config.presence_penalty }),
    ...(config.stop === undefined ? {} : { stop: config.stop }),
    ...(config.n === undefined ? {} : { n: config.n }),
    ...(config.safe_prompt === undefined ? {} : { safe_prompt: config.safe_prompt }),
    random_seed: config.random_seed ?? null,
    ...('prompt_mode' in config ? { prompt_mode: config.prompt_mode } : {}),
    ...(config.reasoning_effort === undefined ? {} : { reasoning_effort: config.reasoning_effort }),
    ...(config.prompt_cache_key === undefined ? {} : { prompt_cache_key: config.prompt_cache_key }),
    ...('prediction' in config ? { prediction: config.prediction } : {}),
    ...('metadata' in config ? { metadata: config.metadata } : {}),
    ...('guardrails' in config ? { guardrails: config.guardrails } : {}),
    ...(hasTools ? { tools: loadedTools } : {}),
    ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
    ...('parallel_tool_calls' in config
      ? { parallel_tool_calls: Boolean(config.parallel_tool_calls) }
      : {}),
    ...(config.response_format ? { response_format: config.response_format } : {}),
  };
}

/** Prompt tokens Mistral served from its prompt cache (`usage.prompt_tokens_details.cached_tokens`). */
function getMistralCachedPromptTokens(usage: any): number | undefined {
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens;
  return isSafeTokenCount(cachedTokens) ? cachedTokens : undefined;
}

function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    if (cached) {
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens, numRequests: 1 };
    } else {
      // A prompt-cache hit is server-side usage, not a promptfoo response-cache hit, so it is
      // reported like other OpenAI-compatible providers rather than in `tokenUsage.cached`.
      const cacheReadInputTokens = getMistralCachedPromptTokens(data.usage);
      return {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
        numRequests: 1,
        ...(cacheReadInputTokens ? { completionDetails: { cacheReadInputTokens } } : {}),
      };
    }
  }
  return {};
}

type MistralNormalizedContent = string | object | null | undefined;

function normalizeMistralContent(content: unknown): MistralNormalizedContent {
  if (!Array.isArray(content)) {
    return content as MistralNormalizedContent;
  }

  const onlyReasoningAndTextChunks = content.every(
    (chunk) => chunk?.type === 'thinking' || chunk?.type === 'text',
  );
  if (!onlyReasoningAndTextChunks) {
    return content;
  }

  const textChunks = content
    .filter(
      (chunk): chunk is { type: 'text'; text: string } =>
        chunk?.type === 'text' && typeof chunk.text === 'string',
    )
    .map((chunk) => chunk.text);

  return textChunks.length > 0 ? textChunks.join('') : content;
}

function calculateMistralCost(
  modelName: string,
  config: MistralChatCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
  promptAudioSeconds?: unknown,
  cachedPromptTokens?: number,
): number | undefined {
  const models = [...MISTRAL_CHAT_MODELS, ...MISTRAL_EMBEDDING_MODELS];
  const billableCachedTokens =
    typeof promptTokens === 'number' && Number.isFinite(promptTokens)
      ? clampCachedTokens(cachedPromptTokens, promptTokens)
      : 0;
  let tokenCost = calculateCost(
    modelName,
    config,
    typeof promptTokens === 'number' ? promptTokens - billableCachedTokens : promptTokens,
    completionTokens,
    models,
  );
  const model = models.find((m) => m.id === modelName);
  if (tokenCost !== undefined && model && billableCachedTokens > 0) {
    const modelCost: { input: number; cacheRead?: number } = model.cost;
    const cacheReadCost =
      config.cacheReadCost ??
      config.inputCost ??
      config.cost ??
      modelCost.cacheRead ??
      modelCost.input * MISTRAL_DEFAULT_CACHE_READ_RATIO;
    tokenCost += cacheReadCost * billableCachedTokens;
  }
  if (modelName !== 'voxtral-small-2507' || promptAudioSeconds == null) {
    return tokenCost;
  }
  if (
    tokenCost === undefined ||
    typeof promptAudioSeconds !== 'number' ||
    !Number.isFinite(promptAudioSeconds) ||
    promptAudioSeconds < 0
  ) {
    return undefined;
  }
  return tokenCost + (promptAudioSeconds / 60) * 0.004;
}

function resolveMistralApiKey(
  provider: MistralChatCompletionProvider | MistralEmbeddingProvider,
): string | undefined {
  const namedKey = provider.config.apiKeyEnvar
    ? (getProviderEnvString(provider.env, provider.config.apiKeyEnvar) ??
      getEnvString(provider.config.apiKeyEnvar as EnvVarKey))
    : undefined;
  return (
    provider.config.apiKey ||
    (namedKey ??
      getProviderEnvString(provider.env, 'MISTRAL_API_KEY') ??
      getEnvString('MISTRAL_API_KEY'))
  );
}

export class MistralChatCompletionProvider implements ApiProvider {
  modelName: string;
  config: MistralChatCompletionOptions;
  env?: EnvOverrides;

  static MISTRAL_CHAT_MODELS = MISTRAL_CHAT_MODELS;

  static MISTRAL_CHAT_MODELS_NAMES = MISTRAL_CHAT_MODELS.map((model) => model.id);

  constructor(
    modelName: string,
    options: { id?: string; config?: MistralChatCompletionOptions; env?: EnvOverrides } = {},
  ) {
    if (!MistralChatCompletionProvider.MISTRAL_CHAT_MODELS_NAMES.includes(modelName)) {
      logger.warn(`Using unknown Mistral chat model: ${modelName}`);
    }
    const { id, config, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `mistral:${this.modelName}`;
  }

  toString(): string {
    return `[Mistral Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    return 'https://api.mistral.ai/v1';
  }

  getApiUrl(): string {
    return getMistralApiUrl(this.config, this.env, this.getApiUrlDefault());
  }

  requiresApiKey(): boolean {
    return true;
  }

  getApiKey(): string | undefined {
    return resolveMistralApiKey(this);
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'mistral',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      temperature: config?.temperature,
      topP: config?.top_p,
      maxTokens: config?.max_tokens,
      testIndex: context?.testIdx ?? (context?.test?.vars?.__testIdx as number | undefined),
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
    };

    return withGenAISpan(
      spanContext,
      () => this.callApiInternal(prompt, context, config),
      extractGenAIResponse,
    );
  }

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
    config: MistralChatCompletionOptions = {},
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Mistral API key is not set. Set the MISTRAL_API_KEY environment variable or add `apiKey` or `apiKeyEnvar` to the provider config.',
      );
    }
    const apiUrl = this.getApiUrl();

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
    const loadedTools = config.tools
      ? await maybeLoadToolsFromExternalFile(config.tools, context?.vars)
      : undefined;
    const params = buildMistralChatParams(this.modelName, messages, config, loadedTools);

    const cacheKey = getMistralCacheKey('chat', this.modelName, apiUrl, apiKey, params);
    if (isCacheEnabled()) {
      const cache = getCache();
      if (cache) {
        const cachedResult = await cache.get<ProviderResponse>(cacheKey);
        if (cachedResult) {
          logger.debug('Returning cached Mistral response', { model: this.modelName });
          return {
            ...cachedResult,
            cached: true,
            tokenUsage: {
              ...cachedResult.tokenUsage,
              cached: cachedResult.tokenUsage?.total,
            },
          };
        }
      }
    }

    const url = `${apiUrl}/chat/completions`;
    logger.debug('Mistral API request', {
      endpoint: getMistralUrlMetadata(url),
      params: getMistralRequestMetadata(params),
    });

    let data,
      cached = false,
      status: number | undefined,
      statusText: string | undefined;

    try {
      ({ data, cached, status, statusText } = await fetchMistralWithDedupe(cacheKey, async () => {
        return (await fetchWithCache(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-promptfoo-silent': 'true',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(params),
          },
          getRequestTimeoutMs(),
          'json',
          true,
        )) as unknown as MistralFetchResult;
      }));
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug('Mistral API response', getMistralResponseMetadata(data));

    if (isHttpFailure(status)) {
      logger.debug('Mistral API error', { status, ...getMistralErrorMetadata(data) });
      return {
        error: formatMistralHttpError(status, statusText, data),
        metadata: { http: { status, statusText: statusText ?? '' } },
      };
    }
    if (data.error) {
      return {
        error: `API call error: ${getMistralErrorMessage(data) ?? JSON.stringify(data.error)}`,
      };
    }
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return {
        error: `Malformed response data: ${JSON.stringify(data)}`,
      };
    }

    const message = data.choices[0].message;
    const normalizedContent = normalizeMistralContent(message.content);
    let output: MistralNormalizedContent;
    if (normalizedContent && message.tool_calls?.length) {
      output = { ...message, content: normalizedContent };
    } else if (message.tool_calls?.length) {
      output = message.tool_calls;
    } else {
      output = normalizedContent;
    }

    const result: ProviderResponse = {
      output,
      tokenUsage: getTokenUsage(data, cached),
      cached,
      cost: calculateMistralCost(
        this.modelName,
        config,
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
        data.usage?.prompt_audio_seconds,
        getMistralCachedPromptTokens(data.usage),
      ),
      ...(data.choices.length > 1 && {
        metadata: {
          choices: data.choices,
        },
      }),
    };

    if (isCacheEnabled()) {
      try {
        await getCache().set(cacheKey, result);
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }

    return result;
  }
}

export class MistralEmbeddingProvider implements ApiProvider {
  readonly supportsEmbeddingCancellation = true;

  modelName: string;
  config: MistralChatCompletionOptions;
  env?: EnvOverrides;

  static MISTRAL_EMBEDDING_MODELS_NAMES = MISTRAL_EMBEDDING_MODELS.map((model) => model.id);

  constructor(
    options: {
      modelName?: string;
      config?: MistralChatCompletionOptions;
      id?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    const { modelName, config, env, id } = options;
    this.modelName = modelName || 'mistral-embed';
    this.id = id ? () => id : this.id;
    if (!MistralEmbeddingProvider.MISTRAL_EMBEDDING_MODELS_NAMES.includes(this.modelName)) {
      logger.warn(`Using unknown Mistral embedding model: ${this.modelName}`);
    }
    this.config = config || {};
    this.env = env;
  }

  id(): string {
    return `mistral:embedding:${this.modelName}`;
  }

  toString(): string {
    return `[Mistral Embedding Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    return 'https://api.mistral.ai/v1';
  }

  getApiUrl(): string {
    return getMistralApiUrl(this.config, this.env, this.getApiUrlDefault());
  }

  requiresApiKey(): boolean {
    return true;
  }

  getApiKey(): string | undefined {
    return resolveMistralApiKey(this);
  }

  async callApi(text: string): Promise<ProviderResponse> {
    try {
      const embeddingResponse = await this.callEmbeddingApi(text);
      return {
        output: JSON.stringify(embeddingResponse.embedding),
        tokenUsage: embeddingResponse.tokenUsage,
        cost: embeddingResponse.cost,
        ...(embeddingResponse.cached ? { cached: true } : {}),
      };
    } catch (err) {
      return {
        error: `Embedding API call error: ${String(err)}`,
      };
    }
  }

  async callEmbeddingApi(
    text: string,
    _context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderEmbeddingResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Mistral API key must be set for embedding');
    }

    const body = {
      model: this.modelName,
      input: text,
    };

    const apiUrl = this.getApiUrl();
    const url = `${apiUrl}/embeddings`;
    const cacheKey = getMistralCacheKey('embedding', this.modelName, apiUrl, apiKey, body);

    let data;
    let cached = false;
    let status: number | undefined;
    let statusText: string | undefined;
    const cache = isCacheEnabled() ? getCache() : undefined;
    if (cache) {
      try {
        const cachedData = await cache.get<any>(cacheKey);
        if (cachedData) {
          logger.debug('Returning cached Mistral embedding response', { model: this.modelName });
          data = cachedData;
          cached = true;
        }
      } catch (err) {
        logger.error(`Failed to read Mistral embedding cache: ${String(err)}`);
      }
    }

    if (!cached) {
      logger.debug('Mistral embeddings API request', {
        endpoint: getMistralUrlMetadata(url),
        params: {
          model: body.model,
          inputCount: 1,
        },
      });

      try {
        ({ data, cached, status, statusText } = await fetchMistralWithDedupe(
          cacheKey,
          async () => {
            return (await fetchWithCache(
              url,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-promptfoo-silent': 'true',
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                ...(options?.abortSignal && { signal: options.abortSignal }),
              },
              getRequestTimeoutMs(),
              'json',
              true,
            )) as unknown as MistralFetchResult;
          },
          options?.abortSignal,
        ));
      } catch (err) {
        options?.abortSignal?.throwIfAborted();
        logger.error(`API call error: ${err}`);
        throw err;
      }

      if (isHttpFailure(status)) {
        const detail = getMistralErrorMessage(data);
        throw new Error(
          `Mistral embeddings API error: ${status} ${statusText}${detail ? `: ${detail}` : ''}`,
        );
      }
    }

    logger.debug('Mistral embeddings API response', getMistralEmbeddingResponseMetadata(data));

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in Mistral Embedding API response');
      }
      const tokenUsage = getTokenUsage(data, cached);
      const promptTokens = tokenUsage.prompt || 0;
      const completionTokens = 0; // Embeddings don't have completion tokens
      const result = {
        embedding,
        tokenUsage: {
          ...tokenUsage,
          completion: completionTokens,
        },
        cost: calculateMistralCost(this.modelName, this.config, promptTokens, completionTokens),
        ...(cached ? { cached: true } : {}),
      };
      if (!cached && cache) {
        try {
          await cache.set(cacheKey, data);
        } catch (err) {
          logger.error(`Failed to cache Mistral embedding response: ${String(err)}`);
        }
      }
      return result;
    } catch (err) {
      logger.error('Mistral embeddings API error', getMistralErrorMetadata(data?.error));
      throw err;
    }
  }
}
