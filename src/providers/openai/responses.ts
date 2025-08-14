import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile, renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util/file';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAICost, formatOpenAiError, getTokenUsage } from './util';

import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';

export class OpenAiResponsesProvider extends OpenAiGenericProvider {
  private functionCallbackHandler = new FunctionCallbackHandler();

  static OPENAI_RESPONSES_MODEL_NAMES = [
    'gpt-4o',
    'gpt-4o-2024-08-06',
    'gpt-4o-2024-11-20',
    'gpt-4o-2024-05-13',
    'gpt-4.1',
    'gpt-4.1-2025-04-14',
    'gpt-4.1-mini',
    'gpt-4.1-mini-2025-04-14',
    'gpt-4.1-nano',
    'gpt-4.1-nano-2025-04-14',
    // GPT-5 models
    'gpt-5',
    'gpt-5-2025-08-07',
    'gpt-5-chat-latest',
    'gpt-5-nano',
    'gpt-5-nano-2025-08-07',
    'gpt-5-mini',
    'gpt-5-mini-2025-08-07',
    'o1',
    'o1-2024-12-17',
    'o1-preview',
    'o1-preview-2024-09-12',
    'o1-mini',
    'o1-mini-2024-09-12',
    'o1-pro',
    'o1-pro-2025-03-19',
    'o3-pro',
    'o3-pro-2025-06-10',
    'o3',
    'o3-2025-04-16',
    'o4-mini',
    'o4-mini-2025-04-16',
    'o3-mini',
    'o3-mini-2025-01-31',
    // GPT-4.5 models deprecated as of 2025-07-14, removed from API
    'codex-mini-latest',
    // Deep research models
    'o3-deep-research',
    'o3-deep-research-2025-06-26',
    'o4-mini-deep-research',
    'o4-mini-deep-research-2025-06-26',
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
      this.modelName === 'codex-mini-latest' ||
      this.modelName.startsWith('gpt-5')
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
      ...(config.max_tool_calls ? { max_tool_calls: config.max_tool_calls } : {}),
      ...(config.previous_response_id ? { previous_response_id: config.previous_response_id } : {}),
      text: textFormat,
      ...(config.truncation ? { truncation: config.truncation } : {}),
      ...(config.metadata ? { metadata: config.metadata } : {}),
      ...('parallel_tool_calls' in config
        ? { parallel_tool_calls: Boolean(config.parallel_tool_calls) }
        : {}),
      ...(config.stream ? { stream: config.stream } : {}),
      ...('store' in config ? { store: Boolean(config.store) } : {}),
      ...(config.background ? { background: config.background } : {}),
      ...(config.webhook_url ? { webhook_url: config.webhook_url } : {}),
      ...(config.user ? { user: config.user } : {}),
      ...(config.passthrough || {}),
    };

    // Handle reasoning_effort and reasoning parameters for o-series models
    if (
      config.reasoning_effort &&
      (this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4') ||
        this.modelName.startsWith('gpt-5'))
    ) {
      body.reasoning_effort = config.reasoning_effort;
    }

    if (
      config.reasoning &&
      (this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4') ||
        this.modelName.startsWith('gpt-5'))
    ) {
      body.reasoning = config.reasoning;
    }

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

    // Validate deep research models have required tools
    const isDeepResearchModel = this.modelName.includes('deep-research');
    if (isDeepResearchModel) {
      const hasWebSearchTool = config.tools?.some(
        (tool: any) => tool.type === 'web_search_preview',
      );
      if (!hasWebSearchTool) {
        return {
          error: `Deep research model ${this.modelName} requires the web_search_preview tool to be configured. Add it to your provider config:\ntools:\n  - type: web_search_preview`,
        };
      }

      // Validate MCP configuration for deep research
      const mcpTools = config.tools?.filter((tool: any) => tool.type === 'mcp') || [];
      for (const mcpTool of mcpTools) {
        if (mcpTool.require_approval !== 'never') {
          return {
            error: `Deep research model ${this.modelName} requires MCP tools to have require_approval: 'never'. Update your MCP tool configuration:\ntools:\n  - type: mcp\n    require_approval: never`,
          };
        }
      }
    }

    logger.debug(`Calling OpenAI Responses API: ${JSON.stringify(body)}`);

    // Calculate timeout for deep research models
    let timeout = REQUEST_TIMEOUT_MS;
    if (isDeepResearchModel) {
      // For deep research models, use PROMPTFOO_EVAL_TIMEOUT_MS if set,
      // otherwise default to 10 minutes (600,000ms)
      const evalTimeout = getEnvInt('PROMPTFOO_EVAL_TIMEOUT_MS', 0);
      if (evalTimeout > 0) {
        timeout = evalTimeout;
      } else {
        timeout = 600_000; // 10 minutes default for deep research
      }
      logger.debug(`Using timeout of ${timeout}ms for deep research model ${this.modelName}`);
    }

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
        timeout,
        'json',
        context?.bustCache ?? context?.debug,
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

      // Log the structure for debugging deep research responses
      if (this.modelName.includes('deep-research')) {
        logger.debug(`Deep research response structure: ${JSON.stringify(data, null, 2)}`);
      }

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
        if (!item || typeof item !== 'object') {
          logger.warn(`Skipping invalid output item: ${JSON.stringify(item)}`);
          continue;
        }

        if (item.type === 'function_call') {
          // Skip completed status messages that are just status updates without meaningful arguments
          if (item.status === 'completed' && (!item.arguments || item.arguments === '{}')) {
            continue;
          }

          result = await this.functionCallbackHandler.processCalls(
            item,
            config.functionToolCallbacks,
          );
        } else if (item.type === 'message' && item.role === 'assistant') {
          if (item.content) {
            for (const contentItem of item.content) {
              if (!contentItem || typeof contentItem !== 'object') {
                logger.warn(`Skipping invalid content item: ${JSON.stringify(contentItem)}`);
                continue;
              }

              if (contentItem.type === 'output_text') {
                result += contentItem.text;
                // Preserve annotations for deep research citations
                if (contentItem.annotations && contentItem.annotations.length > 0) {
                  if (!data.annotations) {
                    data.annotations = [];
                  }
                  data.annotations.push(...contentItem.annotations);
                }
              } else if (contentItem.type === 'tool_use' || contentItem.type === 'function_call') {
                result = await this.functionCallbackHandler.processCalls(
                  contentItem,
                  config.functionToolCallbacks,
                );
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
        } else if (item.type === 'reasoning' && item.summary && item.summary.length > 0) {
          // Handle reasoning output from deep research models
          if (result) {
            result += '\n';
          }
          result += `Reasoning: ${item.summary.map((s: { text: string }) => s.text).join('\n')}\n`;
        } else if (item.type === 'web_search_call') {
          // Handle web search calls from deep research models
          if (result) {
            result += '\n';
          }
          const action = item.action;
          if (action) {
            if (action.type === 'search') {
              result += `Web Search: "${action.query}"`;
            } else if (action.type === 'open_page') {
              result += `Opening page: ${action.url}`;
            } else if (action.type === 'find_in_page') {
              result += `Finding in page: "${action.query}"`;
            } else {
              result += `Web action: ${action.type}`;
            }
          } else {
            result += `Web Search Call (status: ${item.status || 'unknown'})`;
          }
          if (item.status === 'failed' && item.error) {
            result += ` (Error: ${item.error})`;
          }
        } else if (item.type === 'code_interpreter_call') {
          // Handle code interpreter calls from deep research models
          if (result) {
            result += '\n';
          }
          result += `Code Interpreter: ${item.code || 'Running code...'}`;
          if (item.status === 'failed' && item.error) {
            result += ` (Error: ${item.error})`;
          }
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
