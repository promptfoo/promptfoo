import { fetchWithCache } from '../cache';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { normalizeFinishReason } from '../util/finishReason';
import { OpenAiChatCompletionProvider } from './openai/chat';
import {
  appendOpenAiApiPath,
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
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

type OpenRouterUsage = NonNullable<OpenAiChatCompletionCostData['usage']> & {
  cost?: unknown;
  is_byok?: unknown;
  cost_details?: unknown;
};

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

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

  protected override calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
  ): number | undefined {
    // Preserve logical cost on cache replay; the evaluator tracks incurred spending separately.
    if (
      config.cost !== undefined ||
      config.inputCost !== undefined ||
      config.outputCost !== undefined
    ) {
      // Explicit user rates override provider billing. Require both rates and
      // counts; a missing rate must not come from a native OpenAI price table.
      const inputCost = config.inputCost ?? config.cost;
      const outputCost = config.outputCost ?? config.cost;
      const promptTokens = data.usage?.prompt_tokens;
      const completionTokens = data.usage?.completion_tokens;
      if (
        !isNonNegativeFiniteNumber(inputCost) ||
        !isNonNegativeFiniteNumber(outputCost) ||
        !isNonNegativeFiniteNumber(promptTokens) ||
        !isNonNegativeFiniteNumber(completionTokens)
      ) {
        return undefined;
      }
      const cost = promptTokens * inputCost + completionTokens * outputCost;
      return Number.isFinite(cost) ? cost : undefined;
    }

    const usage = data.usage as OpenRouterUsage | undefined;
    // BYOK inference is billed separately by the upstream provider. A waived
    // charge or gateway fee cannot represent its total cost.
    if (usage?.is_byok === true) {
      return undefined;
    }

    // Without an explicit BYOK flag, retain the reported OpenRouter account
    // charge. Upstream components and native vendor rates cannot substitute.
    // https://openrouter.ai/docs/cookbook/administration/usage-accounting
    const cost = usage?.cost;
    return isNonNegativeFiniteNumber(cost) ? cost : undefined;
  }

  private getBillingMetadata(data: OpenAiChatCompletionCostData): ProviderResponse['metadata'] {
    const usage = data.usage as OpenRouterUsage | undefined;
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
      return undefined;
    }
    const details =
      usage.cost_details &&
      typeof usage.cost_details === 'object' &&
      !Array.isArray(usage.cost_details)
        ? (usage.cost_details as Record<string, unknown>)
        : undefined;

    // These are independent reported facts, regardless of whether generic cost
    // is a configured estimate, the account charge, or unavailable.
    const billing: Record<string, unknown> = {};
    const amounts = {
      accountCharge: usage.cost,
      reportedUpstreamInferenceCost: details?.upstream_inference_cost,
      reportedUpstreamPromptCost: details?.upstream_inference_prompt_cost,
      reportedUpstreamCompletionCost: details?.upstream_inference_completions_cost,
      reportedServerToolCost: details?.server_tool_cost,
    };
    for (const [name, amount] of Object.entries(amounts)) {
      if (isNonNegativeFiniteNumber(amount)) {
        billing[name] = amount;
      }
    }
    if (typeof usage.is_byok === 'boolean') {
      billing.isByok = usage.is_byok;
    }
    return Object.keys(billing).length > 0 ? { openrouter: billing } : undefined;
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
    // error paths reach here with a null body; no data, no cost
    const cost = data ? this.calculateResponseCost(data, config) : undefined;

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
      metadata: this.getBillingMetadata(data),
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
