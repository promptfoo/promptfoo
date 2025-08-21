import { fetchWithCache } from '../cache';
import logger from '../logger';
import { normalizeFinishReason } from '../util/finishReason';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { calculateOpenAICost, formatOpenAiError, getTokenUsage } from './openai/util';
import { REQUEST_TIMEOUT_MS } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

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
        apiBaseUrl: 'https://openrouter.ai/api/v1',
        apiKeyEnvar: 'OPENROUTER_API_KEY',
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
    // Get the request body and config
    const { body, config } = this.getOpenAiBody(prompt, context, callApiOptions);

    // Make the API call directly
    logger.debug(`Calling OpenRouter API: model=${this.modelName}`);
    let data, status, statusText;
    let cached = false;

    try {
      ({ data, cached, status, statusText } = await fetchWithCache(
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
        error: formatOpenAiError(data),
      };
    }

    // Process the response with special handling for Gemini
    const message = data.choices[0].message;
    const finishReason = normalizeFinishReason(data.choices[0].finish_reason);

    // Prioritize content over reasoning
    let output = '';
    if (message.content) {
      output = message.content;
      // Add reasoning as thinking content if present and showThinking is enabled
      if (message.reasoning && (this.config.showThinking ?? true)) {
        output = `Thinking: ${message.reasoning}\n\n${output}`;
      }
    } else if (message.reasoning) {
      // Fallback to reasoning if no content (shouldn't happen with Gemini)
      output = message.reasoning;
    } else if (message.function_call || message.tool_calls) {
      output = message.function_call || message.tool_calls;
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

  return new OpenRouterProvider(modelName, options.config || {});
}
