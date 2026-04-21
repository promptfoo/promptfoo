import { fetchWithCache } from '../cache';
import logger from '../logger';
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
} from '../types/providers';

/**
 * Snowflake Cortex provider extends OpenAI chat completion provider
 * with Snowflake-specific endpoint handling.
 *
 * Documentation: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-rest-api
 *
 * The Snowflake Cortex REST API provides OpenAI-compatible endpoints but with
 * a different URL structure:
 * - Endpoint: https://<account_identifier>.snowflakecomputing.com/api/v2/cortex/inference:complete
 * - Authentication: Bearer token (JWT, OAuth, or programmatic access token)
 * - Supports similar parameters to OpenAI (temperature, max_tokens, etc.)
 * - Supports tool calling, structured output, and streaming
 *
 * Available models include:
 * - Claude models (claude-3-5-sonnet, claude-4-sonnet)
 * - OpenAI GPT models
 * - Mistral models
 * - Llama models
 * - Custom fine-tuned models
 *
 * Example configuration:
 * ```yaml
 * providers:
 *   - id: snowflake:mistral-large2
 *     config:
 *       accountIdentifier: "myorg-myaccount"  # or set SNOWFLAKE_ACCOUNT_IDENTIFIER
 *       apiKey: "your-bearer-token"           # or set SNOWFLAKE_API_KEY
 *       # Optional: override the base URL completely
 *       # apiBaseUrl: "https://myorg-myaccount.snowflakecomputing.com"
 * ```
 */
export class SnowflakeCortexProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    const accountIdentifier =
      providerOptions.config?.accountIdentifier || process.env.SNOWFLAKE_ACCOUNT_IDENTIFIER;

    if (!accountIdentifier && !providerOptions.config?.apiBaseUrl) {
      throw new Error(
        'Snowflake provider requires an account identifier. Set SNOWFLAKE_ACCOUNT_IDENTIFIER environment variable or specify accountIdentifier in config.',
      );
    }

    // Construct the base URL from account identifier if not provided
    const apiBaseUrl =
      providerOptions.config?.apiBaseUrl || `https://${accountIdentifier}.snowflakecomputing.com`;

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl,
        apiKeyEnvar: 'SNOWFLAKE_API_KEY',
        passthrough: {
          ...(providerOptions.config?.passthrough || {}),
        },
      },
    });
  }

  id(): string {
    return `snowflake:${this.modelName}`;
  }

  toString(): string {
    return `[Snowflake Cortex Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'snowflake',
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
    // Get the request body and config from parent class
    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);

    // Make the API call to Snowflake Cortex endpoint
    logger.debug('[Snowflake Cortex] Calling API', {
      model: this.modelName,
      apiBaseUrl: this.getApiUrl(),
    });

    interface OpenAIErrorResponse {
      error: {
        message: string;
        type?: string;
        code?: string;
      };
    }

    type SnowflakeCortexResponse = OpenAI.ChatCompletion & {
      error?: {
        code?: string;
        message?: string;
      };
    };

    let data: SnowflakeCortexResponse;
    let status: number;
    let statusText: string;
    let latencyMs: number | undefined;
    let cached = false;

    try {
      ({ data, cached, status, statusText, latencyMs } =
        await fetchWithCache<SnowflakeCortexResponse>(
          `${this.getApiUrl()}/api/v2/cortex/inference:complete`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.getApiKey()}`,
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
      logger.error(`[Snowflake Cortex] API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    if (data.error) {
      return {
        error: formatOpenAiError(data as OpenAIErrorResponse),
      };
    }

    // Process the response (should be OpenAI-compatible)
    const message = data.choices[0].message;
    const finishReason = normalizeFinishReason(data.choices[0].finish_reason);

    // Handle tool calls and content
    let output: string | object = '';
    const hasFunctionCall = !!(message.function_call && message.function_call.name);
    const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;

    if (hasFunctionCall || hasToolCalls) {
      // Tool calls always take priority
      output = hasFunctionCall ? message.function_call! : message.tool_calls!;
    } else if (message.content && message.content.trim()) {
      output = message.content;
    }

    // Handle structured output
    if (config.response_format?.type === 'json_schema') {
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
          logger.warn(`[Snowflake Cortex] Failed to parse JSON output: ${String(error)}`);
        }
      }
    }

    return {
      output,
      tokenUsage: getTokenUsage(data, cached),
      cached,
      latencyMs,
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

export function createSnowflakeProvider(
  providerPath: string,
  options: ProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  if (!modelName) {
    throw new Error('Snowflake provider requires a model name. Use format: snowflake:<model_name>');
  }

  return new SnowflakeCortexProvider(modelName, {
    ...options,
    config: options.config ?? {},
  });
}
