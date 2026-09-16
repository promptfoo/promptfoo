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

  // Top-level API parameters (siblings of `options`, not members of it).
  tools?: any[]; // Support for function calling/tools
  think?: boolean; // Top-level parameter for thinking/reasoning
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
  'tools',
  'think',
  'keep_alive',
  'truncate',
  'dimensions',
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
]);

/**
 * Builds the nested `options` object Ollama expects, dropping anything that belongs at
 * the top level. Shared by all three providers so they cannot drift: the chat provider
 * previously excluded only `tools`, so `think` and the whole `passthrough` object were
 * also sent as junk `options` members.
 */
function buildOllamaOptions(config: OllamaCompletionOptions): Record<string, any> {
  const dropped: string[] = [];
  const options = Object.keys(config).reduce<Record<string, any>>((acc, key) => {
    const optionName = key as keyof OllamaCompletionOptions;
    if (OllamaCompletionOptionKeys.has(optionName)) {
      if (!OllamaNonNestedOptionKeys.has(key)) {
        acc[optionName] = config[optionName];
      }
    } else if (key !== 'showThinking') {
      dropped.push(key);
    }
    return acc;
  }, {});

  if (dropped.length > 0) {
    // Unrecognized keys are silently discarded, which is how `max_tokens` (an OpenAI
    // key Ollama ignores) sat unnoticed in this repo's own redteam example.
    logger.debug('[Ollama] Ignoring unsupported config keys', {
      dropped,
      hint: 'Use `passthrough` to send arbitrary top-level fields to the Ollama API.',
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
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Collects tool calls from every chunk (they arrive one per chunk before `done: true`)
 * and normalizes them to the OpenAI shape, where `arguments` is a JSON string rather
 * than an object.
 */
function collectOllamaToolCalls(lines: OllamaChatJsonL[]) {
  return lines
    .flatMap((chunk: OllamaChatJsonL) => chunk.message?.tool_calls ?? [])
    .map((call: { function: { name: string; arguments: any } }) => ({
      function: {
        name: call.function.name,
        arguments:
          typeof call.function.arguments === 'string'
            ? call.function.arguments
            : JSON.stringify(call.function.arguments),
      },
    }));
}

/**
 * Extracts token usage from the chunk carrying `done: true`, following the repo-wide
 * convention that a cache hit reports only `cached`/`total` and no new request
 * (see getTokenUsage in src/providers/openai/util.ts).
 */
function extractOllamaTokenUsage(
  finalChunk: { prompt_eval_count?: number; eval_count?: number },
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
  // numRequests is intentionally omitted: tokenUsageUtils increments it by 1 when an
  // update does not specify it, so setting it here would be a no-op.
  return { prompt, completion, total };
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

    return withGenAISpan(spanContext, () => this.callApiInternal(prompt), resultExtractor);
  }

  private async callApiInternal(prompt: string): Promise<ProviderResponse> {
    const { passthroughOptions, passthroughRest } = splitOllamaPassthrough(this.config);
    const params = {
      model: this.modelName,
      prompt,
      stream: false,
      options: { ...buildOllamaOptions(this.config), ...passthroughOptions },
      ...(this.config.think === undefined ? {} : { think: this.config.think }),
      ...(this.config.keep_alive === undefined ? {} : { keep_alive: this.config.keep_alive }),
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
          if (parsed.response) {
            return parsed.response;
          }
          return null;
        })
        .filter((s: string | null) => s !== null)
        .join('');

      // Reasoning models stream their trace in `thinking`, separate from `response`.
      // Without this it is dropped, and a `num_predict` budget spent inside the thinking
      // block yields an empty output with no explanation.
      const thinking = lines
        .map((parsed: OllamaCompletionJsonL) => parsed.thinking ?? null)
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
    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const { passthroughOptions, passthroughRest } = splitOllamaPassthrough(this.config);
    const params: any = {
      model: this.modelName,
      messages,
      options: { ...buildOllamaOptions(this.config), ...passthroughOptions },
      ...(this.config.think === undefined ? {} : { think: this.config.think }),
      ...(this.config.keep_alive === undefined ? {} : { keep_alive: this.config.keep_alive }),
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
          if (parsed.message?.content) {
            return parsed.message.content;
          }
          return null;
        })
        .filter((s: string | null) => s !== null);

      const content = contentParts.join('');

      // Reasoning models stream their trace in `message.thinking`, separate from
      // `message.content`. Note qwen3 and friends emit this by default on Ollama 0.13+
      // with no `think` flag sent, so dropping it silently loses the entire answer
      // whenever a `num_predict` budget is spent inside the thinking block.
      const thinking = lines
        .map((parsed: OllamaChatJsonL) => parsed.message?.thinking ?? null)
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
      options: { ...buildOllamaOptions(this.config), ...passthroughOptions },
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
      const tokenUsage =
        promptTokens === undefined
          ? undefined
          : response.cached
            ? { cached: promptTokens, total: promptTokens }
            : { prompt: promptTokens, total: promptTokens };
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
