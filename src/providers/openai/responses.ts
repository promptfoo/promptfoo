import { OpenAiGenericProvider } from '.';
import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { maybeLoadToolsFromExternalFile, renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util/file';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';
import { calculateOpenAICost } from './util';
import { formatOpenAiError, getTokenUsage } from './util';

export class OpenAiResponsesProvider extends OpenAiGenericProvider {
  static OPENAI_RESPONSES_MODEL_NAMES = [
    'gpt-4o',
    'gpt-4o-2024-08-06',
    'gpt-4.1',
    'gpt-4.1-2025-04-14',
    'gpt-4.1-mini',
    'gpt-4.1-mini-2025-04-14',
    'gpt-4.1-nano',
    'gpt-4.1-nano-2025-04-14',
    'o1',
    'o1-preview',
    'o1-mini',
    'o1-pro',
    'o3-pro',
    'o3-pro-2025-06-10',
    'o3',
    'o3-2025-04-16',
    'o4-mini',
    'o4-mini-2025-04-16',
    'o3-mini',
    'gpt-4.5-preview',
    'gpt-4.5-preview-2025-02-27',
    'codex-mini-latest',
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
    return (
      this.modelName.startsWith('o1') ||
      this.modelName.startsWith('o3') ||
      this.modelName.startsWith('o4') ||
      this.modelName === 'codex-mini-latest'
    );
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
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    let input;
    try {
      const parsedJson = JSON.parse(prompt);
      if (Array.isArray(parsedJson)) {
        input = parsedJson;
      } else {
        input = prompt;
      }
    } catch {
      input = prompt;
    }

    const isReasoningModel = this.isReasoningModel();
    const maxOutputTokens =
      config.max_output_tokens ??
      (isReasoningModel
        ? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS')
        : getEnvInt('OPENAI_MAX_TOKENS', 1024));

    const temperature = this.supportsTemperature()
      ? (config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0))
      : undefined;
    const reasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;

    const instructions = config.instructions;

    // Load response_format from external file if needed, similar to chat provider
    const responseFormat = config.response_format
      ? maybeLoadFromExternalFile(renderVarsInObject(config.response_format, context?.vars))
      : undefined;

    let textFormat;
    if (responseFormat) {
      if (responseFormat.type === 'json_object') {
        textFormat = {
          format: {
            type: 'json_object',
          },
        };

        // IMPORTANT: json_object format requires the word 'json' in the input prompt
      } else if (responseFormat.type === 'json_schema') {
        const schema = maybeLoadFromExternalFile(
          renderVarsInObject(
            responseFormat.schema || responseFormat.json_schema?.schema,
            context?.vars,
          ),
        );

        const schemaName =
          responseFormat.json_schema?.name || responseFormat.name || 'response_schema';

        textFormat = {
          format: {
            type: 'json_schema',
            name: schemaName,
            schema,
            strict: true,
          },
        };
      } else {
        textFormat = { format: { type: 'text' } };
      }
    } else {
      textFormat = { format: { type: 'text' } };
    }

    const body = {
      model: this.modelName,
      input,
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(temperature ? { temperature } : {}),
      ...(instructions ? { instructions } : {}),
      ...(config.top_p !== undefined || getEnvString('OPENAI_TOP_P')
        ? { top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1) }
        : {}),
      ...(config.tools
        ? { tools: maybeLoadToolsFromExternalFile(config.tools, context?.vars) }
        : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.previous_response_id ? { previous_response_id: config.previous_response_id } : {}),
      text: textFormat,
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

    return { body, config: { ...config, response_format: responseFormat } };
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
      let refusal = '';
      let isRefusal = false;

      // Process all output items
      for (const item of output) {
        if (item.type === 'function_call') {
          result = JSON.stringify(item);
        } else if (item.type === 'message' && item.role === 'assistant') {
          if (item.content) {
            for (const contentItem of item.content) {
              if (contentItem.type === 'output_text') {
                result += contentItem.text;
              } else if (contentItem.type === 'tool_use' || contentItem.type === 'function_call') {
                result = JSON.stringify(contentItem);
              } else if (contentItem.type === 'refusal') {
                refusal = contentItem.refusal;
                isRefusal = true;
              }
            }
          } else if (item.refusal) {
            refusal = item.refusal;
            isRefusal = true;
          }
        } else if (item.type === 'tool_result') {
          result = JSON.stringify(item);
        } else if (item.type === 'mcp_list_tools') {
          // MCP tools list - include in result for debugging/visibility
          if (result) {
            result += '\n';
          }
          result += `MCP Tools from ${item.server_label}: ${JSON.stringify(item.tools, null, 2)}`;
        } else if (item.type === 'mcp_call') {
          // MCP tool call result
          if (item.error) {
            if (result) {
              result += '\n';
            }
            result += `MCP Tool Error (${item.name}): ${item.error}`;
          } else {
            if (result) {
              result += '\n';
            }
            result += `MCP Tool Result (${item.name}): ${item.output}`;
          }
        } else if (item.type === 'mcp_approval_request') {
          // MCP approval request - include in result for user to see
          if (result) {
            result += '\n';
          }
          result += `MCP Approval Required for ${item.server_label}.${item.name}: ${item.arguments}`;
        }
      }

      if (isRefusal) {
        return {
          output: refusal,
          tokenUsage: getTokenUsage(data, cached),
          isRefusal: true,
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
      }

      if (config.response_format?.type === 'json_schema' && typeof result === 'string') {
        try {
          result = JSON.parse(result);
        } catch (error) {
          logger.error(`Failed to parse JSON output: ${error}`);
        }
      }

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
