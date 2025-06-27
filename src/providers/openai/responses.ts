import { OpenAiGenericProvider } from '.';
import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { TokenUsage } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { maybeLoadToolsFromExternalFile, renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util/file';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';
import { calculateOpenAICost } from './util';
import { formatOpenAiError } from './util';

// Custom token usage function for Responses API which uses different field names
function getResponsesTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    if (cached) {
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens };
    } else {
      return {
        total: data.usage.total_tokens,
        prompt: data.usage.input_tokens || 0,
        completion: data.usage.output_tokens || 0,
        ...(data.usage.completion_tokens_details
          ? {
              completionDetails: {
                reasoning: data.usage.completion_tokens_details.reasoning_tokens,
                acceptedPrediction: data.usage.completion_tokens_details.accepted_prediction_tokens,
                rejectedPrediction: data.usage.completion_tokens_details.rejected_prediction_tokens,
              },
            }
          : {}),
      };
    }
  }
  return {};
}

export class OpenAiResponsesProvider extends OpenAiGenericProvider {
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
    'gpt-4.5-preview',
    'gpt-4.5-preview-2025-02-27',
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
      this.modelName === 'codex-mini-latest'
    );
  }

  protected isDeepResearchModel(): boolean {
    return this.modelName.includes('deep-research');
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

    // Handle reasoning_effort and reasoning parameters for o-series models
    if (
      config.reasoning_effort &&
      (this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4'))
    ) {
      body.reasoning_effort = config.reasoning_effort;
    }

    if (
      config.reasoning &&
      (this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4'))
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

    // Log deep research output structure for debugging
    if (this.isDeepResearchModel() && data.output) {
      logger.debug(
        `\tDeep research output types: ${data.output.map((item: any) => item.type).join(', ')}`,
      );
    }

    if (data.error) {
      await data.deleteFromCache?.();
      return {
        error: formatOpenAiError(data),
      };
    }

    // Check if response was incomplete due to token limits
    const _isIncomplete = data.status === 'incomplete';
    const hitTokenLimit = data.incomplete_details?.reason === 'max_output_tokens';
    const tokenLimitWarning = hitTokenLimit
      ? `\n\n⚠️  Response incomplete: Hit max_output_tokens limit (${body.max_output_tokens || 'default'}). Consider increasing max_output_tokens for deep research models.`
      : '';

    try {
      // Check if the response has a standardized output_text field first
      if (data.output_text && typeof data.output_text === 'string') {
        const tokenUsage = getResponsesTokenUsage(data, cached);
        return {
          output: data.output_text + tokenLimitWarning,
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
      }

      // Fallback to manual parsing for older API versions or special cases
      const output = data.output;
      if (!output || !Array.isArray(output) || output.length === 0) {
        return {
          error: `Invalid response format: Missing output array and output_text`,
        };
      }

      let result = '';
      let refusal = '';
      let isRefusal = false;
      const isDeepResearch = this.isDeepResearchModel();
      const researchSteps = [];

      // Process all output items
      for (const item of output) {
        if (item.type === 'function_call') {
          result = JSON.stringify(item);
        } else if (item.type === 'message' && (item.role === 'assistant' || !item.role)) {
          // Deep research models may not always include role
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
        } else if (item.type === 'web_search_call' && isDeepResearch) {
          // Deep research web search calls
          const action = item.action;
          if (action?.type === 'search') {
            researchSteps.push(`🔍 Searched: "${action.query}"`);
          } else if (action?.type === 'open_page') {
            researchSteps.push(`📄 Opened: ${action.url || 'page'}`);
          } else if (action?.type === 'find') {
            researchSteps.push(
              `🔍 Found in page: "${action.pattern}" at ${action.url || 'unknown URL'}`,
            );
          }
        } else if (item.type === 'code_interpreter_call' && isDeepResearch) {
          // Deep research code interpreter calls
          researchSteps.push(`⚙️ Executed code`);
        } else if (item.type === 'mcp_tool_call' && isDeepResearch) {
          // Deep research MCP calls
          researchSteps.push(`🔗 MCP call: ${item.name || 'unknown'}`);
        } else if (item.type === 'reasoning' && isDeepResearch) {
          // Deep research reasoning steps
          if (item.summary && item.summary.length > 0) {
            researchSteps.push(`🧠 Reasoning: ${item.summary.join('; ')}`);
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

      // For deep research models, if we have no final result but have research steps, show the research process
      if (isDeepResearch && !result && researchSteps.length > 0) {
        result = `🔬 Deep Research Process:\n${researchSteps.join('\n')}\n\n⚠️ No final answer generated - response may be incomplete.`;
      }

      if (isRefusal) {
        return {
          output: refusal,
          tokenUsage: getResponsesTokenUsage(data, cached),
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

      const tokenUsage = getResponsesTokenUsage(data, cached);

      return {
        output: result + tokenLimitWarning,
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
