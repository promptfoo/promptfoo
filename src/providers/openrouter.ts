import { fetchWithCache } from '../cache';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { normalizeFinishReason } from '../util/finishReason';
import { OpenAiChatCompletionProvider } from './openai/chat';
import {
  calculateSafeOpenAICost,
  formatOpenAiError,
  getChatCompletionRefusal,
  getTokenUsageWithRequestCount,
  parseChatCompletionJsonOutput,
  type ValidatedChatCompletionMessage,
  validateChatCompletionMessage,
} from './openai/util';
import { getRequestTimeoutMs } from './shared';
import type OpenAI from 'openai';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

/**
 * Build retry metadata for a choice-level error returned inside an HTTP 200
 * envelope.
 *
 * `headers` are the *transport* response headers. OpenRouter still emits
 * `Retry-After` / `X-RateLimit-*` on these 200-wrapped rate limits, and the
 * scheduler only reads rate-limit headers off `metadata.http.headers`
 * (see `getProviderResponseHeaders`). Dropping them here would silently
 * downgrade the retry to blind exponential backoff and can re-issue the
 * request before the reset time OpenRouter asked for.
 */
function getChoiceErrorMetadata(
  code: unknown,
  headers?: Record<string, string>,
): ProviderResponse['metadata'] | undefined {
  const status =
    typeof code === 'number'
      ? code
      : typeof code === 'string' && /^\d{3}$/.test(code)
        ? Number(code)
        : undefined;
  if (status === 429) {
    return {
      rateLimitKind: 'rate_limit',
      http: { status, statusText: 'Too Many Requests', headers: headers ?? {} },
    };
  }
  if (status === 502 || status === 503 || status === 504) {
    return {
      retryableErrorKind: 'transient_availability',
      http: { status, statusText: 'OpenRouter generation error', headers: headers ?? {} },
    };
  }
  return undefined;
}

function getOpenRouterOutput(
  message: ValidatedChatCompletionMessage,
  showThinking: boolean,
): string | object {
  if (message.functionCall || message.toolCalls) {
    return message.functionCall ?? message.toolCalls!;
  }
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.reasoning && showThinking
      ? `Thinking: ${message.reasoning}\n\n${message.content}`
      : message.content;
  }
  if (message.structuredContent?.length) {
    return message.structuredContent;
  }
  return message.reasoning && showThinking ? message.reasoning : '';
}

/**
 * OpenRouter provider extends OpenAI chat completion provider with special handling
 * for models like Gemini that include thinking/reasoning tokens.
 *
 * For Gemini models, the base OpenAI provider incorrectly prioritizes the reasoning
 * field over content. This provider ensures content is the primary output with
 * reasoning shown as thinking content when showThinking is enabled.
 */
export class OpenRouterProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || 'https://openrouter.ai/api/v1',
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'OPENROUTER_API_KEY',
        passthrough: {
          // Pass through OpenRouter-specific options
          // https://openrouter.ai/docs/requests
          ...(providerOptions.config?.transforms && {
            transforms: providerOptions.config.transforms,
          }),
          ...(providerOptions.config?.models && { models: providerOptions.config.models }),
          ...(providerOptions.config?.route && { route: providerOptions.config.route }),
          ...(providerOptions.config?.provider && { provider: providerOptions.config.provider }),
          ...(providerOptions.config?.passthrough || {}),
        },
      },
    });
  }

  id(): string {
    return `openrouter:${this.modelName}`;
  }

  toString(): string {
    return `[OpenRouter Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'openrouter',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'openrouter',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      temperature: this.config.temperature,
      topP: this.config.top_p,
      maxTokens: this.config.max_tokens,
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
      if (response.finishReason) {
        result.finishReasons = [response.finishReason];
      }
      return result;
    };

    return withGenAISpan(
      spanContext,
      () => this.executeOpenRouterCall(prompt, context, callApiOptions),
      resultExtractor,
    );
  }

  private async executeOpenRouterCall(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Get the request body and config
    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);

    // Make the API call directly
    logger.debug(`Calling OpenRouter API: model=${this.modelName}`);

    // OpenAI SDK has APIError class for exceptions, but not a type for error responses
    // in the JSON body. This interface represents the structure when the API returns
    // an error object in the response body (not as an exception).
    interface OpenAIErrorResponse {
      error: {
        message: string;
        type?: string;
        code?: string;
      };
    }

    type OpenRouterChatCompletionResponse = Omit<OpenAI.ChatCompletion, 'choices'> & {
      choices: Array<
        OpenAI.ChatCompletion.Choice & {
          error?: {
            code?: number | string;
            message?: string;
          };
        }
      >;
      error?: {
        code?: string;
        message?: string;
      };
    };

    let data: OpenRouterChatCompletionResponse;
    let status: number;
    let statusText: string;
    let cached = false;
    let deleteFromCache: (() => Promise<void>) | undefined;
    let responseHeaders: Record<string, string> | undefined;

    try {
      ({
        data,
        cached,
        status,
        statusText,
        deleteFromCache,
        headers: responseHeaders,
      } = await fetchWithCache<OpenRouterChatCompletionResponse>(
        `${this.getApiUrl()}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
            ...config.headers,
          },
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug,
      ));

      if (status < 200 || status >= 300) {
        return {
          error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    if (data?.error) {
      return {
        error: formatOpenAiError(data as OpenAIErrorResponse),
      };
    }

    const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
    const finishReason = normalizeFinishReason(choice?.finish_reason);
    const tokenUsage = getTokenUsageWithRequestCount(data, cached);
    const cost = calculateSafeOpenAICost(this.modelName, config, data);

    if (choice?.error || finishReason === 'error') {
      await deleteFromCache?.();
      const errorMetadata = choice?.error
        ? getChoiceErrorMetadata(choice.error.code, responseHeaders)
        : undefined;
      return {
        error: 'API error: OpenRouter provider returned a generation error',
        tokenUsage,
        cached,
        cost,
        ...(finishReason && { finishReason }),
        ...(errorMetadata && { metadata: errorMetadata }),
      };
    }

    // Process the response with special handling for Gemini
    const message = validateChatCompletionMessage(choice?.message, {
      allowStructuredContent: true,
      finishReason,
    });
    if (!message) {
      await deleteFromCache?.();
      return {
        error: 'Malformed response data: expected choices[0].message',
        tokenUsage,
        cached,
        cost,
        ...(finishReason && { finishReason }),
      };
    }

    const refusal = getChatCompletionRefusal(message, finishReason);
    if (refusal) {
      return { ...refusal, tokenUsage, cached, cost, ...(finishReason && { finishReason }) };
    }

    let output = getOpenRouterOutput(message, this.config.showThinking ?? true);
    if (config.response_format?.type === 'json_schema') {
      output = parseChatCompletionJsonOutput(
        message,
        output,
        'Failed to parse JSON output for json_schema',
      );
    }

    return {
      output,
      tokenUsage,
      cached,
      cost,
      ...(finishReason && { finishReason }),
    };
  }
}

export function createOpenRouterProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  const providerOptions: ProviderOptions = options.config ? { ...options.config } : {};
  if (options.env && !providerOptions.env) {
    providerOptions.env = options.env as ProviderOptions['env'];
  }
  if (options.id && !providerOptions.id) {
    providerOptions.id = options.id;
  }

  return new OpenRouterProvider(modelName, providerOptions);
}
