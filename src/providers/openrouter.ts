import { fetchWithCache } from '../cache';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { FINISH_REASON_MAP, normalizeFinishReason } from '../util/finishReason';
import {
  getOpenAiGatewayRateLimitKind,
  getOpenAiRateLimitResponse,
  OpenAiChatCompletionProvider,
} from './openai/chat';
import {
  appendOpenAiApiPath,
  formatOpenAiError,
  getOpenAiChatChoiceError,
  getOpenAiPartialOutput,
  getOpenAiPolicyRefusal,
  getTokenUsageWithRequestCount,
  validateChatCompletionMessage,
} from './openai/util';
import { calculateOpenRouterResponseCost, getOpenRouterBillingMetadata } from './openrouterBilling';
import { getRequestTimeoutMs } from './shared';
import type OpenAI from 'openai';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

/**
 * Classify a choice-level error code arriving in a 200 envelope. The
 * gateway-level classifiers only see the transport status; a 429 or 5xx
 * hidden in `choices[0].error.code` would otherwise read as a permanent
 * failure and the scheduler would not retry it.
 */
function getChoiceErrorKind(
  code: unknown,
): { rateLimitKind: 'rate_limit' } | { retryableErrorKind: 'transient_availability' } | undefined {
  const status =
    typeof code === 'number'
      ? code
      : typeof code === 'string' && /^\d{3}$/.test(code)
        ? Number(code)
        : undefined;
  if (status === 429) {
    return { rateLimitKind: 'rate_limit' };
  }
  if (status === 502 || status === 503 || status === 504) {
    return { retryableErrorKind: 'transient_availability' };
  }
  return undefined;
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

  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
  ): number | undefined {
    return calculateOpenRouterResponseCost(data, config);
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

    let prepared: Awaited<ReturnType<OpenAiChatCompletionProvider['getOpenAiBody']>>;
    try {
      prepared = await this.getOpenAiBody(prompt, context, callApiOptions);
    } catch (error) {
      return withGenAISpan(
        spanContext,
        async () => {
          throw error;
        },
        resultExtractor,
      );
    }
    return withGenAISpan(
      { ...spanContext, ...this.getChatTracingRequest(prepared.body) },
      () => this.executeOpenRouterCall(prepared, context),
      resultExtractor,
    );
  }

  private async executeOpenRouterCall(
    prepared: Awaited<ReturnType<OpenAiChatCompletionProvider['getOpenAiBody']>>,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const { body, config } = prepared;

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

    type OpenRouterChatCompletionResponse = OpenAI.ChatCompletion & {
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
        appendOpenAiApiPath(this.getApiUrl(), 'chat/completions'),
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

      const policy = getOpenAiPolicyRefusal(data, true);
      if (policy) {
        return {
          output:
            policy.partialOutput === undefined
              ? policy.message
              : getOpenAiPartialOutput(
                  policy.partialOutput,
                  config.response_format?.type === 'json_schema',
                ),
          ...(data.usage ? { tokenUsage: getTokenUsageWithRequestCount(data, cached) } : {}),
          cached,
          cost: this.calculateResponseCost(data, config),
          isRefusal: true,
          guardrails: {
            flagged: true,
            ...(policy.flaggedInput ? { flaggedInput: true } : {}),
            reason: policy.message,
          },
          raw: data,
          metadata: {
            ...getOpenRouterBillingMetadata(data),
            ...(policy.code ? { providerPolicy: { code: policy.code } } : {}),
            http: { status, statusText, headers: responseHeaders ?? {} },
          },
        };
      }
      const choiceError = data?.error ? undefined : getOpenAiChatChoiceError(data);
      if (choiceError) {
        await deleteFromCache?.();
        const rateLimitKind = getOpenAiGatewayRateLimitKind(data);
        return {
          error: `API error: ${choiceError.error.message}`,
          ...(data.usage ? { tokenUsage: getTokenUsageWithRequestCount(data, cached) } : {}),
          cached,
          cost: this.calculateResponseCost(data, config),
          raw: data,
          finishReason: 'error',
          metadata: {
            ...getOpenRouterBillingMetadata(data),
            ...(rateLimitKind ? { rateLimitKind } : {}),
            ...getChoiceErrorKind(choiceError.error.code),
            http: { status, statusText, headers: responseHeaders ?? {} },
          },
        };
      }
      if (status < 200 || status >= 300) {
        const rateLimitKind = getOpenAiGatewayRateLimitKind(data);
        return {
          error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
          metadata: {
            ...(rateLimitKind ? { rateLimitKind } : {}),
            http: { status, statusText, headers: responseHeaders ?? {} },
          },
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      const rateLimitResponse = getOpenAiRateLimitResponse(err, responseHeaders);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    if (data?.error) {
      return {
        error: formatOpenAiError(data as OpenAIErrorResponse),
      };
    }

    // Guard against a 200 response with an empty or missing `choices` array
    // (soft moderation block, upstream hiccup, or n>1 edge cases). Without this,
    // `data.choices[0]` is undefined and `.message` throws an opaque TypeError.
    // Mirrors the sibling OpenAI-compatible providers (mistral.ts, ai21.ts).
    // The error string stays bounded: the raw payload can be large and is
    // provider-controlled.
    if (!Array.isArray(data?.choices) || !data.choices[0]?.message) {
      // A malformed 200 must not be cached and replayed as if it were the
      // provider's answer.
      await deleteFromCache?.();
      return {
        error: 'Malformed response data: expected choices[0].message',
        tokenUsage: getTokenUsageWithRequestCount(data, cached),
        cached,
        // error paths can reach here with a null body; no data, no cost
        cost: data ? this.calculateResponseCost(data, config) : undefined,
        metadata: data ? getOpenRouterBillingMetadata(data) : undefined,
      };
    }

    // Process the response with special handling for Gemini
    const finishReason = normalizeFinishReason(data.choices[0].finish_reason);
    if (finishReason === 'error') {
      // A failed generation carries partial output that must not be graded;
      // the choice-level error object above can be absent on this path.
      await deleteFromCache?.();
      return {
        error: 'API error: OpenRouter provider returned a generation error',
        tokenUsage: getTokenUsageWithRequestCount(data, cached),
        cached,
        cost: this.calculateResponseCost(data, config),
        metadata: getOpenRouterBillingMetadata(data),
        finishReason,
      };
    }
    const message = validateChatCompletionMessage(data.choices[0].message, {
      allowStructuredContent: true,
      finishReason,
    });
    if (!message) {
      // A malformed 200 must not be cached and replayed as if it were the
      // provider's answer.
      await deleteFromCache?.();
      return {
        error: 'Malformed response data: expected choices[0].message',
        tokenUsage: getTokenUsageWithRequestCount(data, cached),
        cached,
        cost: this.calculateResponseCost(data, config),
        metadata: getOpenRouterBillingMetadata(data),
        ...(finishReason && { finishReason }),
      };
    }
    if (message.refusal || finishReason === FINISH_REASON_MAP.content_filter) {
      return {
        output: message.content
          ? getOpenAiPartialOutput(message.content, config.response_format?.type === 'json_schema')
          : message.refusal || 'Content filtered by the model provider.',
        tokenUsage: getTokenUsageWithRequestCount(data, cached),
        cached,
        cost: this.calculateResponseCost(data, config),
        isRefusal: true,
        guardrails: { flagged: true },
        raw: data,
        metadata: getOpenRouterBillingMetadata(data),
        ...(finishReason && { finishReason }),
      };
    }

    // Prioritize tool calls over content and reasoning
    let output: string | object = '';
    if (message.functionCall || (message.toolCalls && message.toolCalls.length > 0)) {
      // Tool calls always take priority and never include thinking
      output = message.functionCall ?? message.toolCalls!;
    } else if (message.structuredContent?.length) {
      // OpenRouter can return content as an array of parts (e.g. Gemini text
      // plus image); keep the parts intact instead of throwing on .trim().
      output = message.structuredContent;
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
      tokenUsage: getTokenUsageWithRequestCount(data, cached),
      cached,
      cost: this.calculateResponseCost(data, config),
      metadata: getOpenRouterBillingMetadata(data),
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
