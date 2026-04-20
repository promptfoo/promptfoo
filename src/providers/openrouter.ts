import { fetchWithCache } from '../cache';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { normalizeFinishReason } from '../util/finishReason';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateOpenAICost, formatOpenAiError, getTokenUsage } from './openai/util';
import { REQUEST_TIMEOUT_MS } from './shared';
import type OpenAI from 'openai';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
  ReasoningContent,
} from '../types/providers';

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

function extractOpenRouterReasoning(
  message: any,
  showThinking: boolean,
): ReasoningContent[] | undefined {
  const reasoning = message?.reasoning;
  if (!showThinking || typeof reasoning !== 'string' || !reasoning) {
    return undefined;
  }
  return [{ type: 'reasoning', content: reasoning }];
}

function getOpenRouterOutput(message: any): string | object {
  const hasFunctionCall = Boolean(message.function_call?.name);
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;

  if (hasFunctionCall || hasToolCalls) {
    return hasFunctionCall ? message.function_call : message.tool_calls;
  }

  return typeof message.content === 'string' && message.content.trim() ? message.content : '';
}

function parseOpenRouterJsonSchemaOutput(message: any, output: string | object): string | object {
  const jsonCandidate =
    typeof message?.content === 'string'
      ? message.content
      : typeof output === 'string'
        ? output
        : null;

  if (!jsonCandidate) {
    return output;
  }

  try {
    return JSON.parse(jsonCandidate);
  } catch (error) {
    logger.warn('Failed to parse JSON output for json_schema', { error });
    return output;
  }
}

/**
 * OpenRouter provider extends OpenAI chat completion provider with special handling
 * for models like Gemini that include thinking/reasoning tokens.
 *
 * For Gemini models, the base OpenAI provider incorrectly prioritizes the reasoning
 * field over content. This provider ensures content is the primary output with
 * reasoning stored separately in the reasoning field (never duplicated in output).
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

    let data: OpenRouterChatCompletionResponse;
    let status: number;
    let statusText: string;
    let cached = false;

    try {
      ({ data, cached, status, statusText } =
        await fetchWithCache<OpenRouterChatCompletionResponse>(
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
          REQUEST_TIMEOUT_MS,
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

    // Process the response with special handling for Gemini
    const message: any = data.choices[0].message;
    const finishReason = normalizeFinishReason(data.choices[0].finish_reason);

    // Prioritize tool calls over content
    // Reasoning content goes ONLY to the reasoning field - no double-write to output
    let output = getOpenRouterOutput(message);
    if (config.response_format?.type === 'json_schema') {
      output = parseOpenRouterJsonSchemaOutput(message, output);
    }
    const reasoning = extractOpenRouterReasoning(message, config.showThinking !== false);

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
      ...(reasoning && { reasoning }),
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
