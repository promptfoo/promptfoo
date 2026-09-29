import { type FetchWithCacheResult, fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { normalizeFinishReason } from '../util/finishReason';
import { maybeLoadToolsFromExternalFile } from '../util/index';
import { getRequestTimeoutMs, parseChatPrompt, transformTools } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
  TokenUsage,
} from '../types/index';

interface OllamaCompletionOptions {
  // Nested `options` members, per Ollama's current Options/Runner structs:
  // https://github.com/ollama/ollama/blob/main/api/types.go
  num_predict?: number;
  num_keep?: number;
  seed?: number;
  top_k?: number;
  top_p?: number;
  min_p?: number;
  typical_p?: number;
  repeat_last_n?: number;
  temperature?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  stop?: string[];
  num_ctx?: number;
  num_batch?: number;
  num_gpu?: number;
  main_gpu?: number;
  use_mmap?: boolean;
  num_thread?: number;
  draft_num_predict?: number;

  // Removed from Ollama's Options struct in newer releases, but still forwarded so
  // configs pointed at an older OLLAMA_BASE_URL keep working. Modern servers ignore
  // them; promptfoo logs a deprecation notice when they are used.
  tfs_z?: number;
  num_gqa?: number;
  f16_kv?: boolean;
  logits_all?: boolean;
  vocab_only?: boolean;
  low_vram?: boolean;
  use_mlock?: boolean;
  embedding_only?: boolean;
  rope_frequency_base?: number;
  rope_frequency_scale?: number;
  penalize_newline?: boolean;
  mirostat?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;

  // Top-level API parameters (siblings of `options`, not members of it).
  tools?: any[]; // Support for function calling/tools
  // Ollama 0.34+ accepts a boolean or a thinking level.
  think?: boolean | 'low' | 'medium' | 'high' | 'max';
  // Structured outputs: 'json' or a JSON schema object.
  format?: 'json' | Record<string, any>;
  // /api/generate only.
  suffix?: string;
  system?: string;
  template?: string;
  raw?: boolean;
  keep_alive?: string | number;
  truncate?: boolean; // /api/embed only
  dimensions?: number; // /api/embed only
  passthrough?: Record<string, any>; // Pass arbitrary fields to the API

  // Promptfoo-side rendering option: prepend the model's reasoning to the output.
  // Deliberately absent from OllamaCompletionOptionKeys so it is never sent to Ollama.
  showThinking?: boolean;
}

const OllamaCompletionOptionKeys = new Set<keyof OllamaCompletionOptions>([
  'num_predict',
  'num_keep',
  'seed',
  'top_k',
  'top_p',
  'min_p',
  'typical_p',
  'repeat_last_n',
  'temperature',
  'repeat_penalty',
  'presence_penalty',
  'frequency_penalty',
  'stop',
  'num_ctx',
  'num_batch',
  'num_gpu',
  'main_gpu',
  'use_mmap',
  'num_thread',
  'draft_num_predict',
  'tfs_z',
  'num_gqa',
  'f16_kv',
  'logits_all',
  'vocab_only',
  'low_vram',
  'use_mlock',
  'embedding_only',
  'rope_frequency_base',
  'rope_frequency_scale',
  'penalize_newline',
  'mirostat',
  'mirostat_tau',
  'mirostat_eta',
  'tools',
  'think',
  'keep_alive',
  'truncate',
  'dimensions',
  'format',
  'suffix',
  'system',
  'template',
  'raw',
  'passthrough',
]);

/**
 * Keys that live in the config block but are NOT members of Ollama's nested `options`
 * object: they are either top-level API parameters or promptfoo-side settings.
 */
const OllamaNonNestedOptionKeys = new Set<string>([
  'tools',
  'think',
  'passthrough',
  'keep_alive',
  'truncate',
  'dimensions',
  'format',
  'suffix',
  'system',
  'template',
  'raw',
]);

/**
 * Which top-level (non-`options`) keys each endpoint actually accepts. Anything outside
 * its endpoint's set is reported as dropped rather than vanishing silently: `suffix` on
 * a chat provider, or `tools` on a completion provider, is a config mistake worth
 * surfacing.
 */
const OllamaEndpointTopLevelKeys: Record<'completion' | 'chat' | 'embedding', Set<string>> = {
  completion: new Set([
    'think',
    'keep_alive',
    'format',
    'truncate',
    'suffix',
    'system',
    'template',
    'raw',
  ]),
  chat: new Set(['think', 'keep_alive', 'format', 'truncate', 'tools']),
  // NOTE: every key listed here must actually be forwarded by that provider, otherwise
  // it is silently dropped instead of warned about. `format` is deliberately absent from
  // embedding: /api/embed returns vectors, so structured output is meaningless there and
  // callEmbeddingApi does not send it.
  embedding: new Set(['keep_alive', 'truncate', 'dimensions']),
};

/**
 * Keys that are never user-supplied Ollama options, so reporting them as "dropped" would
 * be noise. `basePath` is injected into every provider config by loadApiProvider
 * (src/providers/index.ts), and `showThinking` is a promptfoo-side rendering option.
 * src/providers/envoy.ts:44 strips `basePath` for the same reason.
 */
const OllamaInternalConfigKeys = new Set<string>(['showThinking', 'basePath']);

/**
 * Options Ollama has dropped from its Options struct. Still forwarded -- modern servers
 * ignore unknown option keys, and an older OLLAMA_BASE_URL may still honor them -- but
 * worth telling the user they are almost certainly doing nothing.
 */
const OllamaDeprecatedOptionKeys = new Set<string>([
  'tfs_z',
  'num_gqa',
  'f16_kv',
  'logits_all',
  'vocab_only',
  'low_vram',
  'use_mlock',
  'embedding_only',
  'rope_frequency_base',
  'rope_frequency_scale',
  'penalize_newline',
  'mirostat',
  'mirostat_tau',
  'mirostat_eta',
]);

/**
 * Builds the nested `options` object Ollama expects, dropping anything that belongs at
 * the top level. Shared by all three providers so they cannot drift: the chat provider
 * previously excluded only `tools`, so `think` and the whole `passthrough` object were
 * also sent as junk `options` members.
 */
function buildOllamaOptions(
  config: OllamaCompletionOptions,
  endpoint: 'completion' | 'chat' | 'embedding',
): Record<string, any> {
  const dropped: string[] = [];
  const wrongEndpoint: string[] = [];
  const deprecated: string[] = [];
  const supportedTopLevel = OllamaEndpointTopLevelKeys[endpoint];
  const options = Object.keys(config).reduce<Record<string, any>>((acc, key) => {
    const optionName = key as keyof OllamaCompletionOptions;
    if (OllamaCompletionOptionKeys.has(optionName)) {
      if (OllamaNonNestedOptionKeys.has(key)) {
        // A valid Ollama key, but not one this endpoint accepts -- it would otherwise be
        // neither forwarded nor reported.
        if (key !== 'passthrough' && !supportedTopLevel.has(key)) {
          wrongEndpoint.push(key);
        }
      } else {
        acc[optionName] = config[optionName];
        if (OllamaDeprecatedOptionKeys.has(key)) {
          deprecated.push(key);
        }
      }
    } else if (!OllamaInternalConfigKeys.has(key)) {
      dropped.push(key);
    }
    return acc;
  }, {});

  if (wrongEndpoint.length > 0) {
    logger.warn(
      `[Ollama] Ignoring config keys that the ${endpoint} endpoint does not accept: ${wrongEndpoint.join(', ')}`,
    );
  }

  if (dropped.length > 0) {
    // Unrecognized keys are silently discarded, which is how `max_tokens` (an OpenAI
    // key Ollama ignores) sat unnoticed in this repo's own redteam example.
    logger.debug('[Ollama] Ignoring unsupported config keys', {
      dropped,
      hint: 'Generation options belong under `passthrough.options`; other top-level API fields go directly under `passthrough`.',
    });
  }
  if (deprecated.length > 0) {
    logger.debug('[Ollama] Forwarding options that current Ollama releases ignore', {
      deprecated,
      hint: "These were removed from Ollama's Options struct and are kept only for older servers.",
    });
  }
  return options;
}

/**
 * Splits `passthrough` so a user-provided `options` object MERGES with the computed
 * one instead of replacing it. Spreading passthrough wholesale used to silently discard
 * temperature/num_predict whenever someone reached for `passthrough.options`.
 */
function splitOllamaPassthrough(config: OllamaCompletionOptions): {
  passthroughOptions: Record<string, any>;
  passthroughRest: Record<string, any>;
} {
  const { options: passthroughOptions, ...passthroughRest } = config.passthrough ?? {};
  return { passthroughOptions: passthroughOptions ?? {}, passthroughRest };
}

/**
 * Matches `fetchWithCache`'s own `!response.ok` check (src/cache.ts:762): anything
 * outside 2xx is a failure, including an unfollowed 3xx from a gateway.
 */
function isOllamaHttpFailure(status: number): boolean {
  return status < 200 || status >= 300;
}

/** Best-effort detail for an error body that carries no top-level `error` key. */
function stringifyOllamaErrorDetail(data: unknown): string {
  if (typeof data === 'string') {
    return data.trim().slice(0, 500);
  }
  if (data == null) {
    return '';
  }
  try {
    return JSON.stringify(data).slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Ollama reports failures as a JSON body like `{"error":"model 'x' not found"}`.
 * `fetchWithCache` resolves rather than throws on non-2xx, and for the `'text'` format
 * it always hands back a string, so the body has to be inspected explicitly. Otherwise
 * the error body parses as a one-line NDJSON stream with no `message.content` and the
 * caller sees an empty string instead of a failure.
 *
 * Streaming responses complicate this: `/api/chat` can return HTTP 200, stream several
 * records, and only then emit `{"error":"..."}`. The whole body is not parseable as a
 * single JSON value in that case, so scan record by record.
 */
function extractOllamaErrorMessage(data: unknown): string | undefined {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const { error } = data as { error: unknown };
    if (typeof error === 'string') {
      return error;
    }
    return error == null ? undefined : JSON.stringify(error);
  }
  if (typeof data === 'string') {
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      // Cheap pre-filter so long successful streams are not re-parsed record by record.
      if (!trimmed.startsWith('{') || !trimmed.includes('"error"')) {
        continue;
      }
      try {
        const message = extractOllamaErrorMessage(JSON.parse(trimmed));
        if (message !== undefined) {
          return message;
        }
      } catch {
        // Not a complete JSON record; keep scanning.
      }
    }
  }
  return undefined;
}

/**
 * Builds a user-facing error string for a failed Ollama response, or `undefined` when
 * the response looks successful.
 */
function getOllamaResponseError(response: {
  data: unknown;
  status: number;
  statusText: string;
}): string | undefined {
  const message = extractOllamaErrorMessage(response.data);
  if (isOllamaHttpFailure(response.status)) {
    const detail = message ?? stringifyOllamaErrorDetail(response.data);
    return `Ollama API error: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`;
  }
  if (message !== undefined) {
    return `Ollama error: ${message}`;
  }
  return undefined;
}

interface OllamaCompletionJsonL {
  model: string;
  created_at: string;
  response?: string;
  thinking?: string;
  done: boolean;
  done_reason?: string;
  context?: number[];

  total_duration?: number;
  load_duration?: number;
  sample_count?: number;
  sample_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_cached_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaChatJsonL {
  model: string;
  created_at: string;
  message?: {
    role: string;
    content: string;
    thinking?: string;
    images: null;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: any; // Ollama returns object, but we'll normalize to string for OpenAI compatibility
      };
    }>;
  };
  done: boolean;
  done_reason?: string;

  total_duration?: number;
  load_duration?: number;
  sample_count?: number;
  sample_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_cached_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Converts `function.arguments` back to an object on outgoing messages.
 *
 * Responses are normalized to the OpenAI shape, where `arguments` is a JSON *string*
 * (so `is-valid-openai-tools-call` works). Ollama's own /api/chat rejects that shape on
 * the way back in with HTTP 400, so feeding a previous turn's tool call into a multi-turn
 * conversation fails unless it is converted back.
 */
function normalizeOllamaRequestMessages(messages: unknown): unknown {
  // parseChatPrompt returns whatever the prompt parsed to, not necessarily an array. A
  // non-array is passed through untouched so Ollama's own validation reports it, rather
  // than this helper throwing an opaque TypeError first.
  if (!Array.isArray(messages)) {
    return messages;
  }
  return messages.map((message) => {
    const toolCalls = message?.tool_calls;
    if (!Array.isArray(toolCalls)) {
      return message;
    }
    return {
      ...message,
      tool_calls: toolCalls.map((call: any) => {
        const args = call?.function?.arguments;
        if (typeof args !== 'string') {
          return call;
        }
        try {
          const parsed = JSON.parse(args);
          // Only objects are valid here; leave anything else alone so Ollama can
          // report a meaningful error rather than us silently reshaping it.
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return call;
          }
          return { ...call, function: { ...call.function, arguments: parsed } };
        } catch {
          return call;
        }
      }),
    };
  });
}

/**
 * Collects tool calls from every chunk (they arrive one per chunk before `done: true`)
 * and normalizes them to the OpenAI shape, where `arguments` is a JSON string rather
 * than an object.
 */
function collectOllamaToolCalls(lines: OllamaChatJsonL[]) {
  return lines
    .flatMap((chunk: OllamaChatJsonL) => {
      const calls = chunk.message?.tool_calls;
      // A malformed or proxied response can put anything here. Skip what we cannot
      // read rather than throwing a TypeError that surfaces as an opaque parse error.
      return Array.isArray(calls) ? calls : [];
    })
    .filter((call: any) => typeof call?.function?.name === 'string')
    .map((call: { function: { name: string; arguments: any } }) => ({
      function: {
        name: call.function.name,
        arguments:
          typeof call.function.arguments === 'string'
            ? call.function.arguments
            : JSON.stringify(call.function.arguments ?? {}),
      },
    }));
}

/**
 * Extracts token usage from the chunk carrying `done: true`, following the repo-wide
 * convention that a cache hit reports only `cached`/`total` and no new request
 * (see getTokenUsage in src/providers/openai/util.ts).
 */
function extractOllamaTokenUsage(
  finalChunk: {
    prompt_eval_count?: number;
    prompt_eval_cached_count?: number;
    eval_count?: number;
  },
  cached: boolean,
): Partial<TokenUsage> | undefined {
  if (finalChunk.prompt_eval_count === undefined && finalChunk.eval_count === undefined) {
    return undefined;
  }
  const prompt = finalChunk.prompt_eval_count || 0;
  const completion = finalChunk.eval_count || 0;
  const total = prompt + completion;
  if (cached) {
    return { cached: total, total };
  }
  // Ollama 0.34+ reports prompt tokens served from its own KV cache. This is a server-side
  // prefix cache hit, not a promptfoo cache hit, so it belongs in completionDetails rather
  // than tokenUsage.cached (which would make the row look like a promptfoo cache hit).
  const cacheRead = finalChunk.prompt_eval_cached_count;
  if (cacheRead !== undefined) {
    return {
      prompt,
      completion,
      total,
      completionDetails: { cacheReadInputTokens: cacheRead },
      numRequests: 1,
    };
  }
  // Explicit: accumulateTokenUsage defaults incrementRequests to false, and matcher
  // paths (src/matchers/rag.ts, similarity.ts) call the two-arg form, so an omitted
  // count reports 0 grader requests. Verified this does not double-count on the
  // evaluator path, which infers 1 when absent.
  return { prompt, completion, total, numRequests: 1 };
}

/**
 * Prepends the reasoning trace to a string output, matching the `Thinking: ...`
 * convention used by the OpenAI and Anthropic providers. Non-string outputs (tool
 * calls) are returned untouched so their structure survives.
 */
function applyOllamaThinking(output: unknown, thinking: string, showThinking?: boolean) {
  if (!thinking || typeof output !== 'string' || !(showThinking ?? true)) {
    return output;
  }
  return output ? `Thinking: ${thinking}\n\n${output}` : `Thinking: ${thinking}`;
}

export class OllamaCompletionProvider implements ApiProvider {
  modelName: string;
  config: OllamaCompletionOptions;

  constructor(modelName: string, options: { id?: string; config?: OllamaCompletionOptions } = {}) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `ollama:completion:${this.modelName}`;
  }

  toString(): string {
    return `[Ollama Completion Provider ${this.modelName}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'ollama',
      operationName: 'completion',
      model: this.modelName,
      providerId: this.id(),
      temperature: this.config.temperature,
      topP: this.config.top_p,
      maxTokens: this.config.num_predict,
      stopSequences: this.config.stop,
      testIndex: context?.testIdx ?? (context?.test?.vars?.__testIdx as number | undefined),
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
    };

    // Result extractor to set response attributes on the span
    const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
      const result: GenAISpanResult = {};
      if (response.tokenUsage) {
        result.tokenUsage = {
          prompt: response.tokenUsage.prompt,
          completion: response.tokenUsage.completion,
          total: response.tokenUsage.total,
        };
      }
      if (response.finishReason) {
        result.finishReasons = [response.finishReason];
      }
      return result;
    };

    return withGenAISpan(spanContext, () => this.callApiInternal(prompt, context), resultExtractor);
  }

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const { passthroughOptions, passthroughRest } = splitOllamaPassthrough(this.config);
    const params = {
      model: this.modelName,
      prompt,
      stream: false,
      options: { ...buildOllamaOptions(this.config, 'completion'), ...passthroughOptions },
      ...(this.config.think === undefined ? {} : { think: this.config.think }),
      ...(this.config.keep_alive === undefined ? {} : { keep_alive: this.config.keep_alive }),
      ...(this.config.format === undefined ? {} : { format: this.config.format }),
      ...(this.config.truncate === undefined ? {} : { truncate: this.config.truncate }),
      ...(this.config.suffix === undefined ? {} : { suffix: this.config.suffix }),
      ...(this.config.system === undefined ? {} : { system: this.config.system }),
      ...(this.config.template === undefined ? {} : { template: this.config.template }),
      ...(this.config.raw === undefined ? {} : { raw: this.config.raw }),
      ...passthroughRest,
    };

    logger.debug('Calling Ollama API', { params });

    let response: FetchWithCacheResult<string> | undefined;
    try {
      response = await fetchWithCache<string>(
        `${getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434'}/api/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getEnvString('OLLAMA_API_KEY')
              ? { Authorization: `Bearer ${getEnvString('OLLAMA_API_KEY')}` }
              : {}),
          },
          body: JSON.stringify(params),
        },
        getRequestTimeoutMs(),
        'text',
        context?.bustCache ?? context?.debug,
      );
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
    logger.debug(`\tOllama generate API response: ${response.data}`);
    const responseError = getOllamaResponseError(response);
    if (responseError) {
      // fetchWithCache only detects error keys for the 'json' format, so an HTTP 200
      // error body would otherwise be replayed from cache for the full TTL.
      await response.deleteFromCache?.();
      return { error: responseError };
    }

    try {
      const lines = response.data
        .split('\n')
        .filter((line: string) => line.trim() !== '')
        .map((line: string) => JSON.parse(line) as OllamaCompletionJsonL);

      let output = lines
        .map((parsed: OllamaCompletionJsonL) => {
          // Only strings concatenate meaningfully; anything else would render as
          // "[object Object]" in the eval output.
          const response = parsed.response;
          return typeof response === 'string' && response ? response : null;
        })
        .filter((s: string | null) => s !== null)
        .join('');

      // Reasoning models stream their trace in `thinking`, separate from `response`.
      // Without this it is dropped, and a `num_predict` budget spent inside the thinking
      // block yields an empty output with no explanation.
      const thinking = lines
        .map((parsed: OllamaCompletionJsonL) => {
          const trace = parsed.thinking;
          return typeof trace === 'string' ? trace : null;
        })
        .filter((s: string | null) => s !== null)
        .join('');

      output = applyOllamaThinking(output, thinking, this.config.showThinking) as string;

      // Extract token usage from the final chunk (where done: true)
      const finalChunk = lines.find((chunk: OllamaCompletionJsonL) => chunk.done);
      const finishReason = normalizeFinishReason(finalChunk?.done_reason);
      const tokenUsage = finalChunk
        ? extractOllamaTokenUsage(finalChunk, response.cached)
        : undefined;

      return {
        output,
        ...(finishReason && { finishReason }),
        ...(tokenUsage && { tokenUsage }),
        ...(response.cached && { cached: true }),
      };
    } catch (err) {
      return {
        error: `Ollama API response error: ${String(err)}: ${JSON.stringify(response.data)}`,
      };
    }
  }
}

export class OllamaChatProvider implements ApiProvider {
  modelName: string;
  config: OllamaCompletionOptions;

  constructor(modelName: string, options: { id?: string; config?: OllamaCompletionOptions } = {}) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `ollama:chat:${this.modelName}`;
  }

  toString(): string {
    return `[Ollama Chat Provider ${this.modelName}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'ollama',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      temperature: this.config.temperature,
      topP: this.config.top_p,
      maxTokens: this.config.num_predict,
      stopSequences: this.config.stop,
      testIndex: context?.testIdx ?? (context?.test?.vars?.__testIdx as number | undefined),
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
    };

    // Result extractor to set response attributes on the span
    const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
      const result: GenAISpanResult = {};
      if (response.tokenUsage) {
        result.tokenUsage = {
          prompt: response.tokenUsage.prompt,
          completion: response.tokenUsage.completion,
          total: response.tokenUsage.total,
        };
      }
      if (response.finishReason) {
        result.finishReasons = [response.finishReason];
      }
      return result;
    };

    return withGenAISpan(spanContext, () => this.callApiInternal(prompt, context), resultExtractor);
  }

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const messages = normalizeOllamaRequestMessages(
      parseChatPrompt<unknown>(prompt, [{ role: 'user', content: prompt }]),
    );

    const { passthroughOptions, passthroughRest } = splitOllamaPassthrough(this.config);
    const params: any = {
      model: this.modelName,
      messages,
      options: { ...buildOllamaOptions(this.config, 'chat'), ...passthroughOptions },
      ...(this.config.think === undefined ? {} : { think: this.config.think }),
      ...(this.config.keep_alive === undefined ? {} : { keep_alive: this.config.keep_alive }),
      ...(this.config.format === undefined ? {} : { format: this.config.format }),
      ...(this.config.truncate === undefined ? {} : { truncate: this.config.truncate }),
      ...passthroughRest,
    };

    // Handle tools if configured
    if (this.config.tools) {
      const loadedTools = await maybeLoadToolsFromExternalFile(this.config.tools, context?.vars);
      if (loadedTools !== undefined) {
        // Transform tools to OpenAI format if needed (Ollama uses OpenAI format)
        params.tools = transformTools(loadedTools, 'openai');
      }
    }

    logger.debug('[Ollama Chat] Calling Ollama API', { params });

    let response: FetchWithCacheResult<string> | undefined;
    try {
      response = await fetchWithCache<string>(
        `${getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434'}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getEnvString('OLLAMA_API_KEY')
              ? { Authorization: `Bearer ${getEnvString('OLLAMA_API_KEY')}` }
              : {}),
          },
          body: JSON.stringify(params),
        },
        getRequestTimeoutMs(),
        'text',
        context?.bustCache ?? context?.debug,
      );
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
    logger.debug('[Ollama Chat] API response received', {
      status: response.status,
      dataLength: response.data?.length,
    });

    const responseError = getOllamaResponseError(response);
    if (responseError) {
      // fetchWithCache only detects error keys for the 'json' format, so an HTTP 200
      // error body would otherwise be replayed from cache for the full TTL.
      await response.deleteFromCache?.();
      return { error: responseError };
    }

    try {
      const lines = response.data
        .split('\n')
        .filter((line: string) => line.trim() !== '')
        .map((line: string) => JSON.parse(line) as OllamaChatJsonL);

      // Find the final chunk (with done: true)
      const finalChunk = lines.find((chunk: OllamaChatJsonL) => chunk.done);
      const finishReason = normalizeFinishReason(finalChunk?.done_reason);

      // Collect all content chunks
      const contentParts = lines
        .map((parsed: OllamaChatJsonL) => {
          // Only strings concatenate meaningfully; anything else would render as
          // "[object Object]" in the eval output.
          const content = parsed.message?.content;
          return typeof content === 'string' && content ? content : null;
        })
        .filter((s: string | null) => s !== null);

      const content = contentParts.join('');

      // Reasoning models stream their trace in `message.thinking`, separate from
      // `message.content`. Note qwen3 and friends emit this by default on Ollama 0.13+
      // with no `think` flag sent, so dropping it silently loses the entire answer
      // whenever a `num_predict` budget is spent inside the thinking block.
      const thinking = lines
        .map((parsed: OllamaChatJsonL) => {
          const trace = parsed.message?.thinking;
          return typeof trace === 'string' ? trace : null;
        })
        .filter((s: string | null) => s !== null)
        .join('');

      // Tool calls can arrive in multiple chunks before done: true.
      const tool_calls = collectOllamaToolCalls(lines);

      // Determine output based on message content and tool_calls
      let output: any;
      if (tool_calls.length > 0) {
        // If there are tool calls, return them (similar to OpenAI behavior)
        logger.debug('[Ollama Chat] Tool calls detected', {
          toolCallCount: tool_calls.length,
          hasContent: !!content.trim(),
        });
        // If there's also content, return the full message object
        output = content.trim() ? { content, tool_calls } : tool_calls;
      } else {
        // No tool calls, return the content
        output = content;
      }

      output = applyOllamaThinking(output, thinking, this.config.showThinking);

      // Extract token usage from the final chunk (where done: true)
      const tokenUsage = finalChunk
        ? extractOllamaTokenUsage(finalChunk, response.cached)
        : undefined;

      return {
        output,
        ...(finishReason && { finishReason }),
        ...(tokenUsage && { tokenUsage }),
        ...(response.cached && { cached: true }),
      };
    } catch (err) {
      return {
        error: `Ollama API response error: ${String(err)}: ${JSON.stringify(response.data)}`,
      };
    }
  }
}

export class OllamaEmbeddingProvider extends OllamaCompletionProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    const { passthroughOptions, passthroughRest } = splitOllamaPassthrough(this.config);
    const params = {
      model: this.modelName,
      input: text,
      // Ollama defaults this to true, which silently embeds only the first num_ctx
      // tokens and yields a plausible-but-wrong similarity score with no signal to
      // the user. For an eval tool a loud failure is strictly better, and it also
      // preserves the /api/embeddings behaviour this replaces, which errored.
      // Set `truncate: true` explicitly to opt into truncation.
      truncate: this.config.truncate ?? false,
      ...(this.config.dimensions === undefined ? {} : { dimensions: this.config.dimensions }),
      ...(this.config.keep_alive === undefined ? {} : { keep_alive: this.config.keep_alive }),
      options: { ...buildOllamaOptions(this.config, 'embedding'), ...passthroughOptions },
      ...passthroughRest,
    };

    logger.debug('Calling Ollama embeddings API', { params });

    interface OllamaEmbedResponse {
      embeddings?: number[][];
      prompt_eval_count?: number;
    }

    let response: FetchWithCacheResult<OllamaEmbedResponse>;
    try {
      response = await fetchWithCache<OllamaEmbedResponse>(
        `${getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434'}/api/embed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getEnvString('OLLAMA_API_KEY')
              ? { Authorization: `Bearer ${getEnvString('OLLAMA_API_KEY')}` }
              : {}),
          },
          body: JSON.stringify(params),
        },
        getRequestTimeoutMs(),
        'json',
      );
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    const responseError = getOllamaResponseError(response);
    if (responseError) {
      // fetchWithCache only detects error keys for the 'json' format, so an HTTP 200
      // error body would otherwise be replayed from cache for the full TTL.
      await response.deleteFromCache?.();
      // Ollama's context-length message does not say how to fix it.
      if (responseError.includes('input length exceeds the context length')) {
        return {
          error:
            `${responseError}. Raise \`config.num_ctx\` (up to the model's own maximum, ` +
            `shown by \`ollama show ${this.modelName}\`), or set \`config.truncate: true\` ` +
            `to embed only the first num_ctx tokens -- note that truncating silently ` +
            `changes similarity scores.`,
        };
      }
      return { error: responseError };
    }

    try {
      const embedding = response.data.embeddings?.[0];
      if (!embedding) {
        throw new Error('No embedding found in Ollama embeddings API response');
      }
      const promptTokens = response.data.prompt_eval_count;
      // A cache hit is not a new request: report the tokens as cached so repeated
      // similarity assertions are not counted as fresh usage (src/providers/AGENTS.md).
      const tokenUsage =
        promptTokens === undefined
          ? undefined
          : response.cached
            ? { cached: promptTokens, total: promptTokens }
            : // accumulateTokenUsage defaults incrementRequests to false, and the
              // similarity matcher calls it with two args, so an omitted numRequests
              // reports zero. Other embedding providers set it explicitly too
              // (src/providers/voyage.ts:119, src/providers/cohere.ts:211).
              { prompt: promptTokens, total: promptTokens, numRequests: 1 };
      return {
        embedding,
        ...(tokenUsage && { tokenUsage }),
        ...(response.cached && { cached: true }),
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response.data)}`,
      };
    }
  }
}
