import { fetchWithCache } from '../cache';
import { type EnvVarKey, getEnvString } from '../envars';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { normalizeFinishReason } from '../util/finishReason';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateOpenAICost, formatOpenAiError, getTokenUsage } from './openai/util';
import { getRequestTimeoutMs } from './shared';
import type OpenAI from 'openai';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

const REQUESTY_API_BASE = 'https://router.requesty.ai/v1';

/**
 * Requesty provider — OpenAI-compatible LLM router (https://requesty.ai).
 *
 * Mirrors the OpenRouter provider: it extends `OpenAiChatCompletionProvider` and
 * uses the same `provider/model` naming convention (e.g. `openai/gpt-4o-mini`),
 * so the base OpenAI request/response handling is reused. On top of that it adds
 * the same thinking/reasoning handling OpenRouter needs for models (like Gemini)
 * that return a `reasoning` field alongside `content`.
 *
 * What is customized relative to the base OpenAI provider:
 *  - `apiBaseUrl` and `apiKeyEnvar` default to Requesty rather than OpenAI.
 *  - `getApiKey()` does NOT fall back to `OPENAI_API_KEY` — sending an OpenAI key
 *    to Requesty is the wrong default.
 *  - `getApiUrl()` ignores `OPENAI_API_HOST` / `OPENAI_API_BASE_URL` /
 *    `OPENAI_BASE_URL` so Requesty traffic is not misrouted to whatever
 *    OpenAI-compatible host the user wired up for the OpenAI provider.
 *  - Attribution headers (`HTTP-Referer`, `X-Title`) are injected via
 *    `config.headers` (the same header names OpenRouter uses); user-supplied
 *    headers win.
 */
export class RequestyProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || REQUESTY_API_BASE,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'REQUESTY_API_KEY',
        headers: {
          // User-supplied headers win — they are spread after the defaults.
          'HTTP-Referer': 'https://promptfoo.dev/',
          'X-Title': 'promptfoo',
          ...providerOptions.config?.headers,
        },
        passthrough: {
          ...(providerOptions.config?.passthrough || {}),
        },
      },
    });
  }

  id(): string {
    return `requesty:${this.modelName}`;
  }

  toString(): string {
    return `[Requesty Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'requesty',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }

  /**
   * Resolve the API key without the base class's `OPENAI_API_KEY` fallback —
   * users should not accidentally send an OpenAI key to Requesty.
   */
  getApiKey(): string | undefined {
    const envar = this.config?.apiKeyEnvar || 'REQUESTY_API_KEY';
    return (
      this.config.apiKey ||
      this.env?.[envar as keyof EnvOverrides] ||
      getEnvString(envar as EnvVarKey)
    );
  }

  getOrganization(): undefined {
    return undefined;
  }

  protected getMissingApiKeyErrorMessage(): string {
    return `API key is not set. Set the ${this.config.apiKeyEnvar || 'REQUESTY_API_KEY'} environment variable or add \`apiKey\` to the provider config.`;
  }

  /**
   * Ignore `OPENAI_API_HOST` / `OPENAI_API_BASE_URL` / `OPENAI_BASE_URL` — those
   * env vars are meant for the OpenAI provider and would otherwise misroute
   * Requesty traffic. `apiBaseUrl` is always populated by the constructor
   * (default `https://router.requesty.ai/v1`) so we only need to consult that.
   */
  getApiUrl(): string {
    return this.config.apiBaseUrl || REQUESTY_API_BASE;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'requesty',
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
      () => this.executeRequestyCall(prompt, context, callApiOptions),
      resultExtractor,
    );
  }

  private async executeRequestyCall(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Get the request body and config
    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);

    // Make the API call directly
    logger.debug(`Calling Requesty API: model=${this.modelName}`);

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

    type RequestyChatCompletionResponse = OpenAI.ChatCompletion & {
      error?: {
        code?: string;
        message?: string;
      };
    };

    let data: RequestyChatCompletionResponse;
    let status: number;
    let statusText: string;
    let cached = false;

    try {
      ({ data, cached, status, statusText } = await fetchWithCache<RequestyChatCompletionResponse>(
        `${this.getApiUrl()}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
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

    if (data.error) {
      return {
        error: formatOpenAiError(data as OpenAIErrorResponse),
      };
    }

    // Process the response with special handling for reasoning models
    const message: any = data.choices[0].message;
    const finishReason = normalizeFinishReason(data.choices[0].finish_reason);

    // Prioritize tool calls over content and reasoning
    let output: string | object = '';
    const hasFunctionCall = !!(message.function_call && message.function_call.name);
    const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
    if (hasFunctionCall || hasToolCalls) {
      // Tool calls always take priority and never include thinking
      output = hasFunctionCall ? message.function_call! : message.tool_calls!;
    } else if (message.content && message.content.trim()) {
      output = message.content;
      // Add reasoning as thinking content if present and showThinking is enabled
      if (message.reasoning && (this.config.showThinking ?? true)) {
        output = `Thinking: ${message.reasoning}\n\n${output}`;
      }
    } else if (message.reasoning && (this.config.showThinking ?? true)) {
      // Fallback to reasoning if no content and showThinking is enabled
      output = message.reasoning;
    }
    // Handle structured output
    if (config.response_format?.type === 'json_schema') {
      // Prefer parsing the raw content to avoid the "Thinking:" prefix breaking JSON
      const jsonCandidate =
        typeof message?.content === 'string'
          ? message.content
          : typeof output === 'string'
            ? output
            : null;
      if (jsonCandidate) {
        try {
          output = JSON.parse(jsonCandidate);
        } catch (error) {
          // Keep the original output (which may include "Thinking:" prefix) if parsing fails
          logger.warn(`Failed to parse JSON output for json_schema: ${String(error)}`);
        }
      }
    }

    return {
      output,
      tokenUsage: getTokenUsage(data, cached),
      cached,
      cost: calculateOpenAICost(
        this.modelName,
        config,
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
      ),
      ...(finishReason && { finishReason }),
    };
  }
}

export function createRequestyProvider(
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

  return new RequestyProvider(modelName, providerOptions);
}
