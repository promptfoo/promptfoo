import { type FetchWithCacheResult, fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
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
  // From https://github.com/jmorganca/ollama/blob/v0.1.0/api/types.go#L161
  num_predict?: number;
  top_k?: number;
  top_p?: number;
  tfs_z?: number;
  seed?: number;
  useNUMA?: boolean;
  num_ctx?: number;
  num_keep?: number;
  num_batch?: number;
  num_gqa?: number;
  num_gpu?: number;
  main_gpu?: number;
  low_vram?: boolean;
  f16_kv?: boolean;
  logits_all?: boolean;
  vocab_only?: boolean;
  use_mmap?: boolean;
  use_mlock?: boolean;
  embedding_only?: boolean;
  rope_frequency_base?: number;
  rope_frequency_scale?: number;
  typical_p?: number;
  repeat_last_n?: number;
  temperature?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  mirostat?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;
  penalize_newline?: boolean;
  stop?: string[];
  num_thread?: number;
  tools?: any[]; // Support for function calling/tools
  think?: boolean; // Top-level parameter for thinking/reasoning
  passthrough?: Record<string, any>; // Pass arbitrary fields to the API
}

const OllamaCompletionOptionKeys = new Set<keyof OllamaCompletionOptions>([
  'num_predict',
  'top_k',
  'top_p',
  'tfs_z',
  'seed',
  'useNUMA',
  'num_ctx',
  'num_keep',
  'num_batch',
  'num_gqa',
  'num_gpu',
  'main_gpu',
  'low_vram',
  'f16_kv',
  'logits_all',
  'vocab_only',
  'use_mmap',
  'use_mlock',
  'embedding_only',
  'rope_frequency_base',
  'rope_frequency_scale',
  'typical_p',
  'repeat_last_n',
  'temperature',
  'repeat_penalty',
  'presence_penalty',
  'frequency_penalty',
  'mirostat',
  'mirostat_tau',
  'mirostat_eta',
  'penalize_newline',
  'stop',
  'num_thread',
  'tools',
  'think',
  'passthrough',
]);

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
  done: boolean;
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
    images: null;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: any; // Ollama returns object, but we'll normalize to string for OpenAI compatibility
      };
    }>;
  };
  done: boolean;

  total_duration?: number;
  load_duration?: number;
  sample_count?: number;
  sample_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
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
      return result;
    };

    return withGenAISpan(spanContext, () => this.callApiInternal(prompt), resultExtractor);
  }

  private async callApiInternal(prompt: string): Promise<ProviderResponse> {
    const params = {
      model: this.modelName,
      prompt,
      stream: false,
      options: Object.keys(this.config).reduce<Record<string, any>>((options, key) => {
        const optionName = key as keyof OllamaCompletionOptions;
        if (
          OllamaCompletionOptionKeys.has(optionName) &&
          optionName !== 'think' &&
          optionName !== 'tools' &&
          optionName !== 'passthrough'
        ) {
          options[optionName] = this.config[optionName];
        }
        return options;
      }, {}),
      ...(this.config.think === undefined ? {} : { think: this.config.think }),
      ...(this.config.passthrough || {}),
    };

    if (this.config.think !== undefined) {
      params.think = this.config.think;
    }

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

      const output = lines
        .map((parsed: OllamaCompletionJsonL) => {
          if (parsed.response) {
            return parsed.response;
          }
          return null;
        })
        .filter((s: string | null) => s !== null)
        .join('');

      // Extract token usage from the final chunk (where done: true)
      const finalChunk = lines.find((chunk: OllamaCompletionJsonL) => chunk.done);
      let tokenUsage: Partial<TokenUsage> | undefined;

      if (
        finalChunk &&
        (finalChunk.prompt_eval_count !== undefined || finalChunk.eval_count !== undefined)
      ) {
        const promptTokens = finalChunk.prompt_eval_count || 0;
        const completionTokens = finalChunk.eval_count || 0;
        tokenUsage = {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens,
        };
      }

      return {
        output,
        ...(tokenUsage && { tokenUsage }),
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
      return result;
    };

    return withGenAISpan(spanContext, () => this.callApiInternal(prompt, context), resultExtractor);
  }

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const params: any = {
      model: this.modelName,
      messages,
      options: Object.keys(this.config).reduce<Record<string, any>>((options, key) => {
        const optionName = key as keyof OllamaCompletionOptions;
        if (OllamaCompletionOptionKeys.has(optionName) && optionName !== 'tools') {
          options[optionName] = this.config[optionName];
        }
        return options;
      }, {}),
      ...(this.config.think === undefined ? {} : { think: this.config.think }),
      ...(this.config.passthrough || {}),
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

      // Tool calls can arrive in multiple chunks before done: true.
      let tool_calls = lines.flatMap((chunk: OllamaChatJsonL) => chunk.message?.tool_calls ?? []);

      // Normalize tool_calls to match OpenAI format (arguments as JSON string, not object)
      if (tool_calls && tool_calls.length > 0) {
        tool_calls = tool_calls.map((call: { function: { name: string; arguments: any } }) => ({
          function: {
            name: call.function.name,
            arguments:
              typeof call.function.arguments === 'string'
                ? call.function.arguments
                : JSON.stringify(call.function.arguments),
          },
        }));
      }

      // Determine output based on message content and tool_calls
      let output: any;
      if (tool_calls && tool_calls.length > 0) {
        // If there are tool calls, return them (similar to OpenAI behavior)
        logger.debug('[Ollama Chat] Tool calls detected', {
          toolCallCount: tool_calls.length,
          hasContent: !!(content && content.trim()),
        });
        if (content && content.trim()) {
          // If there's also content, return the full message object
          output = { content, tool_calls };
        } else {
          // If only tool calls, return just the tool calls
          output = tool_calls;
        }
      } else {
        // No tool calls, return the content
        output = content;
      }

      // Extract token usage from the final chunk (where done: true)
      let tokenUsage: Partial<TokenUsage> | undefined;

      if (
        finalChunk &&
        (finalChunk.prompt_eval_count !== undefined || finalChunk.eval_count !== undefined)
      ) {
        const promptTokens = finalChunk.prompt_eval_count || 0;
        const completionTokens = finalChunk.eval_count || 0;
        tokenUsage = {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens,
        };
      }

      return {
        output,
        ...(tokenUsage && { tokenUsage }),
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
    const params = {
      model: this.modelName,
      prompt: text,
    };

    logger.debug('Calling Ollama API', { params });

    interface OllamaEmbeddingResponse {
      embedding: number[];
    }

    let response: FetchWithCacheResult<OllamaEmbeddingResponse>;
    try {
      response = await fetchWithCache<OllamaEmbeddingResponse>(
        `${getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434'}/api/embeddings`,
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
      return { error: responseError };
    }

    try {
      const embedding = response.data.embedding as number[];
      if (!embedding) {
        throw new Error('No embedding found in Ollama embeddings API response');
      }
      return {
        embedding,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response.data)}`,
      };
    }
  }
}
