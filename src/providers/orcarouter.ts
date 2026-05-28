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

  /**
   * Ignore `OPENAI_API_HOST` / `OPENAI_API_BASE_URL` / `OPENAI_BASE_URL` — those env
   * vars are meant for the OpenAI provider and would otherwise misroute OrcaRouter
   * traffic to whatever OpenAI-compatible host the user has wired up for OpenAI.
   * `apiBaseUrl` is always populated by the constructor (default
   * `https://api.orcarouter.ai/v1`) so we only need to consult that.
   */
  getApiUrl(): string {
    return this.config.apiBaseUrl || 'https://api.orcarouter.ai/v1';
  }

  /**
   * Extend the base class's OpenAI-only reasoning detection with the upstream
   * reasoning families OrcaRouter routes to that also reject `temperature`.
   * Without this, default `temperature: 0` is sent to Claude Opus / DeepSeek
   * Reasoner and the upstream returns 400.
   * Reference: https://docs.orcarouter.ai/advanced/reasoning
   */
  protected isReasoningModel(): boolean {
    if (super.isReasoningModel()) {
      return true;
    }
    const m = this.modelName;
    // Anthropic Claude Opus 4+ (reasoning) — earlier Opus 2/3 took `temperature` fine.
    if (/(^|\/)claude-opus-(?!2|3)\d/.test(m)) {
      return true;
    }
    // DeepSeek Reasoner / R1 family.
    if (/(^|\/)deepseek-(reasoner|r1)\b/.test(m)) {
      return true;
    }
    return false;
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
              // Only attach Authorization when a key resolved — when the user
              // points OrcaRouter at an authless proxy with `apiKeyRequired: false`
              // we mustn't send "Bearer undefined".
              ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
              'HTTP-Referer': 'https://promptfoo.dev/',
              'X-Title': 'promptfoo',
              ...config.headers,
            },
            body: JSON.stringify(body),
          },
          getRequestTimeoutMs(),
          'json',
          context?.bustCache ?? context?.debug,
          this.config.maxRetries,
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

    const choice = data.choices[0];
    const message: any = choice.message;
    const finishReason = normalizeFinishReason(choice.finish_reason);
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
      ...(choice.logprobs?.content && {
        logProbs: choice.logprobs.content.map(
          (lp: { token: string; logprob: number }) => lp.logprob,
        ),
      }),
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
  // OrcaRouter forwards upstream reasoning under either `reasoning` (OpenAI-style)
  // or `reasoning_content` (e.g. DeepSeek/Qwen native shape).
  // Reference: https://docs.orcarouter.ai/advanced/reasoning
  const reasoning = message.reasoning ?? message.reasoning_content;
  if (message.content && message.content.trim()) {
    if (reasoning && showThinking) {
      return `Thinking: ${reasoning}\n\n${message.content}`;
    }
    return message.content;
  }
  if (reasoning && showThinking) {
    return reasoning;
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
