import { fetchWithCache } from '../cache';
import logger from '../logger';
import { extractGenAIResponse, type GenAISpanContext, withGenAISpan } from '../tracing/genaiTracer';
import { isCallerAbortError } from '../util/fetch/requestSignal';
import {
  isResponseHeadersObserverError,
  preserveResponseHeadersObserverError,
} from '../util/fetch/responseHeadersObserver';
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
  isOpenAiErrorOnlyResponse,
  validateChatCompletionMessage,
} from './openai/util';
import { calculateOpenRouterResponseCost, getOpenRouterBillingMetadata } from './openrouterBilling';
import { serializeProvider } from './serialization';
import { getRequestTimeoutMs, throwIfAborted, waitForPromiseWithAbort } from './shared';
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

// OpenRouter's canonical error_type vocabulary (see
// https://openrouter.ai/docs/api_reference/errors-and-debugging). The
// availability types recover on their own; the permanent set describes a
// request that fails identically on retry, so the scheduler must not replay
// it with backoff.
const TRANSIENT_ERROR_TYPES = new Set([
  'provider_overloaded',
  'provider_unavailable',
  'timeout',
  'server',
]);

const PERMANENT_ERROR_TYPES = new Set([
  'authentication',
  'permission_denied',
  'payment_required',
  'invalid_request',
  'invalid_prompt',
  'not_found',
  'precondition_failed',
  'payload_too_large',
  'unprocessable',
  'content_policy_violation',
  'refusal',
  'context_length_exceeded',
  'max_tokens_exceeded',
  'token_limit_exceeded',
  'string_too_long',
  'invalid_image',
  'image_too_large',
  'image_too_small',
  'unsupported_image_format',
  'image_not_found',
  'image_download_failed',
]);

/**
 * Classify a choice-level error code arriving in a 200 envelope. The
 * gateway-level classifiers only see the transport status; a 429 or 5xx
 * hidden in `choices[0].error.code` would otherwise read as a permanent
 * failure and the scheduler would not retry it.
 */
function getChoiceErrorKind(
  error: unknown,
): { rateLimitKind?: 'rate_limit'; retryableErrorKind?: 'transient_availability' } | undefined {
  const record =
    error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
  const metadata =
    record?.metadata && typeof record.metadata === 'object'
      ? (record.metadata as Record<string, unknown>)
      : undefined;
  const errorType = typeof metadata?.error_type === 'string' ? metadata.error_type : undefined;
  if (errorType && errorType !== 'rate_limit_exceeded') {
    if (TRANSIENT_ERROR_TYPES.has(errorType)) {
      // A documented provider-side availability failure: not a rate limit even
      // when the code says 429, but retryable as a transient upstream hiccup.
      return { retryableErrorKind: 'transient_availability' };
    }
    if (PERMANENT_ERROR_TYPES.has(errorType)) {
      return undefined;
    }
    // Unknown or newly added error_type: fall through to the status code.
  }
  const code = record?.code;
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
    return serializeProvider(this, 'openrouter');
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
    throwIfAborted(callApiOptions?.abortSignal);
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

    let prepared: Awaited<ReturnType<OpenAiChatCompletionProvider['getOpenAiBody']>>;
    try {
      prepared = await waitForPromiseWithAbort(
        this.getOpenAiBody(prompt, context, callApiOptions),
        callApiOptions?.abortSignal,
      );
    } catch (error) {
      return withGenAISpan(
        spanContext,
        async () => {
          throw error;
        },
        (response) => extractGenAIResponse(response, true),
      );
    }
    return withGenAISpan(
      { ...spanContext, ...this.getChatTracingRequest(prepared.body) },
      () => this.executeOpenRouterCall(prepared, context, callApiOptions),
      (response) => extractGenAIResponse(response, true),
    );
  }

  private async executeOpenRouterCall(
    prepared: Awaited<ReturnType<OpenAiChatCompletionProvider['getOpenAiBody']>>,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { body, config } = prepared;
    throwIfAborted(callApiOptions?.abortSignal);

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
          ...(callApiOptions?.abortSignal ? { signal: callApiOptions.abortSignal } : {}),
        },
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug,
        undefined,
        (response) => {
          if (
            response.status >= 200 &&
            response.status < 300 &&
            response.headers &&
            getOpenAiGatewayRateLimitKind(response.data) !== 'quota'
          ) {
            callApiOptions?.onResponseHeaders?.(response.headers);
          }
        },
        callApiOptions?.onResponseHeaders
          ? (backoff) => callApiOptions.onResponseHeaders?.(backoff.headers, backoff)
          : undefined,
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
        // The gateway classifier (provider_code/error_type aware) wins over
        // the bare-code fallback: a billing-coded 429 must stay 'quota', not
        // be flattened to 'rate_limit'.
        const choiceKind = rateLimitKind ? undefined : getChoiceErrorKind(choiceError.error);
        return {
          error: `API error: ${choiceError.error.message}`,
          ...(data.usage ? { tokenUsage: getTokenUsageWithRequestCount(data, cached) } : {}),
          cached,
          cost: this.calculateResponseCost(data, config),
          raw: data,
          finishReason: 'error',
          metadata: {
            ...getOpenRouterBillingMetadata(data),
            ...(rateLimitKind
              ? { rateLimitKind }
              : choiceKind?.rateLimitKind
                ? { rateLimitKind: choiceKind.rateLimitKind }
                : {}),
            ...(choiceKind?.retryableErrorKind
              ? { retryableErrorKind: choiceKind.retryableErrorKind }
              : {}),
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
      // Cache coalescing can complete this diagnostic before a shared caller aborts.
      // Usable choices and all other processing retain their cancellation checks.
      if (isOpenAiErrorOnlyResponse(data)) {
        return { error: formatOpenAiError(data) };
      }
      throwIfAborted(callApiOptions?.abortSignal);
    } catch (err) {
      if (
        !isResponseHeadersObserverError(callApiOptions?.onResponseHeaders, err) &&
        isCallerAbortError(err, callApiOptions?.abortSignal)
      ) {
        throwIfAborted(callApiOptions?.abortSignal);
      }
      logger.error(`API call error: ${String(err)}`);
      const rateLimitResponse = getOpenAiRateLimitResponse(err, responseHeaders);
      if (rateLimitResponse) {
        return preserveResponseHeadersObserverError(
          callApiOptions?.onResponseHeaders,
          err,
          rateLimitResponse,
        );
      }
      return preserveResponseHeadersObserverError(callApiOptions?.onResponseHeaders, err, {
        error: `API call error: ${String(err)}`,
      });
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
    if (!Array.isArray(data?.choices) || !data.choices[0]?.message) {
      // A malformed 200 must not be cached and replayed as if it were the
      // provider's answer. A null body is named as such; anything else stays
      // a bounded generic string because the body can be huge or carry
      // private fields and it lands in every eval row.
      await deleteFromCache?.();
      return {
        error:
          data === null || data === undefined
            ? 'Malformed response data: null'
            : 'Malformed response data: expected choices[0].message',
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
      allowAudio: true,
      allowStructuredContent: true,
      finishReason,
    });
    if (!message) {
      // A malformed 200 must not be cached and replayed as if it were the
      // provider's answer. Bounded error for the same reason as above.
      await deleteFromCache?.();
      return {
        error: 'Malformed response data: unusable choices[0].message',
        tokenUsage: getTokenUsageWithRequestCount(data, cached),
        cached,
        cost: this.calculateResponseCost(data, config),
        metadata: getOpenRouterBillingMetadata(data),
        ...(finishReason && { finishReason }),
      };
    }
    if (message.refusal || finishReason === FINISH_REASON_MAP.content_filter) {
      return {
        // A filtered or refused choice can still carry usable partial output;
        // keep structured parts intact the same way the normal path does.
        output: message.structuredContent?.length
          ? message.structuredContent
          : message.content
            ? getOpenAiPartialOutput(
                message.content,
                config.response_format?.type === 'json_schema',
              )
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
    if (message.audio) {
      // Audio models answer with `content: null` and the payload on
      // `message.audio`; mirror the base OpenAI provider's normalization.
      const audio = message.audio;
      return {
        output: typeof audio.transcript === 'string' ? audio.transcript : '',
        audio: {
          id: typeof audio.id === 'string' ? audio.id : undefined,
          expiresAt: typeof audio.expires_at === 'number' ? audio.expires_at : undefined,
          data: typeof audio.data === 'string' ? audio.data : undefined,
          transcript: typeof audio.transcript === 'string' ? audio.transcript : undefined,
          format: typeof audio.format === 'string' ? audio.format : (body.audio?.format ?? 'wav'),
        },
        tokenUsage: getTokenUsageWithRequestCount(data, cached),
        cached,
        cost: this.calculateResponseCost(data, config),
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
