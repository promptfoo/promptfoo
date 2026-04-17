import { type FetchWithCacheResult, fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { maybeLoadToolsFromExternalFile } from '../util/index';
import { parseChatPrompt, REQUEST_TIMEOUT_MS, transformTools } from './shared';

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
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
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
      options: Object.keys(this.config).reduce(
        (options, key) => {
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
        },
        {} as Record<string, any>,
      ),
      ...(this.config.think !== undefined ? { think: this.config.think } : {}),
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
        REQUEST_TIMEOUT_MS,
        'text',
      );
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
    logger.debug(`\tOllama generate API response: ${response.data}`);
    if (typeof response.data === 'object' && response.data !== null && 'error' in response.data) {
      return {
        error: `Ollama error: ${(response.data as { error: string }).error}`,
      };
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
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
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
      options: Object.keys(this.config).reduce(
        (options, key) => {
          const optionName = key as keyof OllamaCompletionOptions;
          if (OllamaCompletionOptionKeys.has(optionName) && optionName !== 'tools') {
            options[optionName] = this.config[optionName];
          }
          return options;
        },
        {} as Record<string, any>,
      ),
      ...(this.config.think !== undefined ? { think: this.config.think } : {}),
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
        REQUEST_TIMEOUT_MS,
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

    if (typeof response.data === 'object' && response.data !== null && 'error' in response.data) {
      return {
        error: `Ollama error: ${(response.data as { error: string }).error}`,
      };
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

      // Find tool_calls from any chunk (they may appear before done: true)
      const chunkWithToolCalls = lines.find(
        (chunk: OllamaChatJsonL) =>
          chunk.message?.tool_calls && chunk.message.tool_calls.length > 0,
      );
      let tool_calls = chunkWithToolCalls?.message?.tool_calls;

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
        REQUEST_TIMEOUT_MS,
        'json',
      );
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
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
