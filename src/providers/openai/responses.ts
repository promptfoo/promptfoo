import { OpenAiGenericProvider } from '.';
import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt } from '../../envars';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';
import { calculateOpenAICost } from './util';
import { formatOpenAiError, getTokenUsage } from './util';

export class OpenAiResponsesProvider extends OpenAiGenericProvider {
  static OPENAI_RESPONSES_MODEL_NAMES = [
    'gpt-4o',
    'gpt-4o-2024-08-06',
    'o1',
    'o1-preview',
    'o1-mini',
    'o1-pro',
    'o3',
    'o3-preview',
    'o3-mini',
  ];

  config: OpenAiCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
  }

  protected isReasoningModel(): boolean {
    return this.modelName.startsWith('o1') || this.modelName.startsWith('o3');
  }

  protected supportsTemperature(): boolean {
    // OpenAI's o1 and o3 models don't support temperature but some 3rd
    // party reasoning models do.
    return !this.isReasoningModel();
  }

  getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // For Responses API, we need to parse the input differently
    let input;
    try {
      // Check if the prompt is already structured as a message array
      const parsedJson = JSON.parse(prompt);
      if (Array.isArray(parsedJson)) {
        input = parsedJson;
      } else {
        input = prompt; // Plain text input
      }
    } catch {
      // If not valid JSON, treat as plain text
      input = prompt;
    }

    const isReasoningModel = this.isReasoningModel();
    const maxOutputTokens = isReasoningModel
      ? (config.max_completion_tokens ?? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS'))
      : (config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024));

    const temperature = this.supportsTemperature()
      ? (config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0))
      : undefined;
    const reasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;

    const instructions = config.instructions;

    const body = {
      model: this.modelName,
      input,
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(temperature ? { temperature } : {}),
      ...(instructions ? { instructions } : {}),
      ...(config.top_p !== undefined || process.env.OPENAI_TOP_P
        ? { top_p: config.top_p ?? Number.parseFloat(process.env.OPENAI_TOP_P || '1') }
        : {}),
      ...(config.tools
        ? { tools: maybeLoadFromExternalFile(renderVarsInObject(config.tools, context?.vars)) }
        : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.previous_response_id ? { previous_response_id: config.previous_response_id } : {}),
      ...(config.response_format
        ? {
            text: {
              format: {
                name: config.response_format.type,
                type: config.response_format.type,
                schema: maybeLoadFromExternalFile(
                  renderVarsInObject(config.response_format.schema, context?.vars),
                ),
              },
            },
          }
        : { text: { format: { name: 'text', type: 'text' } } }),
      ...(config.truncation ? { truncation: config.truncation } : {}),
      ...(config.metadata ? { metadata: config.metadata } : {}),
      ...('parallel_tool_calls' in config
        ? { parallel_tool_calls: Boolean(config.parallel_tool_calls) }
        : {}),
      ...(config.stream ? { stream: config.stream } : {}),
      ...('store' in config ? { store: Boolean(config.store) } : {}),
      ...(config.user ? { user: config.user } : {}),
      ...(config.passthrough || {}),
    };

    return { body, config };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const { body, config } = this.getOpenAiBody(prompt, context, callApiOptions);
    logger.debug(`Calling OpenAI Responses API: ${JSON.stringify(body)}`);

    let data, status, statusText;
    let cached = false;
    try {
      ({ data, cached, status, statusText } = await fetchWithCache(
        `${this.getApiUrl()}/responses`,
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
      ));

      if (status < 200 || status >= 300) {
        return {
          error: `API error: ${status} ${statusText}\n${
            typeof data === 'string' ? data : JSON.stringify(data)
          }`,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      await data?.deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tOpenAI Responses API response: ${JSON.stringify(data)}`);
    if (data.error) {
      await data.deleteFromCache?.();
      return {
        error: formatOpenAiError(data),
      };
    }

    try {
      // Find the assistant message in the output
      const output = data.output;
      if (!output || !Array.isArray(output) || output.length === 0) {
        return {
          error: `Invalid response format: Missing output array`,
        };
      }

      let result = '';
      // Process all output items
      for (const item of output) {
        if (item.type === 'function_call') {
          // Handle direct function calls at the top level
          result = JSON.stringify(item);
        } else if (item.type === 'message' && item.role === 'assistant' && item.content) {
          // Extract text content from the message
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text') {
              result += contentItem.text;
            } else if (contentItem.type === 'tool_use' || contentItem.type === 'function_call') {
              // Handle tool calls or function calls
              result = JSON.stringify(contentItem);
            }
          }
        } else if (item.type === 'tool_result') {
          // Handle tool results
          result = JSON.stringify(item);
        }
      }

      // Get token usage information
      const tokenUsage = getTokenUsage(data, cached);

      return {
        output: result,
        tokenUsage,
        cached,
        cost: calculateOpenAICost(
          this.modelName,
          config,
          data.usage?.input_tokens,
          data.usage?.output_tokens,
          0,
          0,
        ),
        raw: data,
      };
    } catch (err) {
      await data?.deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
