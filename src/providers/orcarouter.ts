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

interface OpenAIErrorResponse {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

type OrcaRouterChatCompletionResponse = OpenAI.ChatCompletion & {
  error?: { code?: string; message?: string };
};

/**
 * OrcaRouter provider — OpenAI-compatible meta-router (https://www.orcarouter.ai).
 *
 * Exposes OrcaRouter-specific routing options (`models`, `route`) as top-level body
 * fields, attaches attribution headers, and surfaces upstream `reasoning` content
 * the same way OpenRouter does so thinking models stay legible.
 */
export class OrcaRouterProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || 'https://api.orcarouter.ai/v1',
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'ORCAROUTER_API_KEY',
        passthrough: {
          ...(providerOptions.config?.models && { models: providerOptions.config.models }),
          ...(providerOptions.config?.route && { route: providerOptions.config.route }),
          ...(providerOptions.config?.passthrough || {}),
        },
      },
    });
  }

  id(): string {
    return `orcarouter:${this.modelName}`;
  }

  toString(): string {
    return `[OrcaRouter Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'orcarouter',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }

  /**
   * Resolve the API key without the base class's `OPENAI_API_KEY` fallback — users
   * should not accidentally send an OpenAI key to OrcaRouter.
   */
  getApiKey(): string | undefined {
    const envar = this.config?.apiKeyEnvar || 'ORCAROUTER_API_KEY';
    return (
      this.config.apiKey ||
      getEnvString(envar as EnvVarKey) ||
      this.env?.[envar as keyof EnvOverrides]
    );
  }

  protected getMissingApiKeyErrorMessage(): string {
    return `API key is not set. Set the ${this.config.apiKeyEnvar || 'ORCAROUTER_API_KEY'} environment variable or add \`apiKey\` to the provider config.`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Match the base class's initialization sequence so MCP tools are ready before
    // `getOpenAiBody` runs, and so a missing key fails with a clear error.
    const initializationPromise = (
      this as unknown as { initializationPromise: Promise<void> | null }
    ).initializationPromise;
    if (initializationPromise != null) {
      await initializationPromise;
    }
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const spanContext: GenAISpanContext = {
      system: 'orcarouter',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      temperature: this.config.temperature,
      topP: this.config.top_p,
      maxTokens: this.config.max_tokens,
      stopSequences: this.config.stop,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
      traceparent: context?.traceparent,
    };

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
      () => this.executeOrcaRouterCall(prompt, context, callApiOptions),
      resultExtractor,
    );
  }

  private async executeOrcaRouterCall(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);

    logger.debug(`Calling OrcaRouter API: model=${this.modelName}`);

    let data: OrcaRouterChatCompletionResponse;
    let status: number;
    let statusText: string;
    let cached = false;

    try {
      ({ data, cached, status, statusText } =
        await fetchWithCache<OrcaRouterChatCompletionResponse>(
          `${this.getApiUrl()}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.getApiKey()}`,
              'HTTP-Referer': 'https://promptfoo.dev/',
              'X-Title': 'promptfoo',
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
      return { error: `API call error: ${String(err)}` };
    }

    if (data.error) {
      return { error: formatOpenAiError(data as OpenAIErrorResponse) };
    }

    const message: any = data.choices[0].message;
    const finishReason = normalizeFinishReason(data.choices[0].finish_reason);
    const showThinking = this.config.showThinking ?? true;
    let output = extractOutput(message, showThinking);
    output = maybeParseJsonSchemaOutput(output, message, config);

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

/**
 * Pick the message field promptfoo should surface as `output`.
 * Tool / function calls win over content; content with `reasoning` is prefixed
 * with `Thinking: …` when `showThinking` is enabled.
 */
function extractOutput(message: any, showThinking: boolean): string | object {
  const hasFunctionCall = !!(message.function_call && message.function_call.name);
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  if (hasFunctionCall) {
    return message.function_call;
  }
  if (hasToolCalls) {
    return message.tool_calls;
  }
  if (message.content && message.content.trim()) {
    if (message.reasoning && showThinking) {
      return `Thinking: ${message.reasoning}\n\n${message.content}`;
    }
    return message.content;
  }
  if (message.reasoning && showThinking) {
    return message.reasoning;
  }
  return '';
}

function maybeParseJsonSchemaOutput(
  output: string | object,
  message: any,
  config: { response_format?: { type?: string } },
): string | object {
  if (config.response_format?.type !== 'json_schema') {
    return output;
  }
  const jsonCandidate =
    typeof message?.content === 'string'
      ? message.content
      : typeof output === 'string'
        ? output
        : null;
  if (jsonCandidate == null) {
    return output;
  }
  try {
    return JSON.parse(jsonCandidate);
  } catch (error) {
    logger.warn(`Failed to parse JSON output for json_schema: ${String(error)}`);
    return output;
  }
}

export function createOrcaRouterProvider(
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

  return new OrcaRouterProvider(modelName, providerOptions);
}
