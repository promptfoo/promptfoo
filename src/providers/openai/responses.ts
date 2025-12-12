import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile, renderVarsInObject } from '../../util/index';
import { maybeLoadFromExternalFile } from '../../util/file';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAICost, formatOpenAiError, getTokenUsage } from './util';
import { ResponsesProcessor } from '../responses/index';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { EnvOverrides } from '../../types/env';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';

export class OpenAiResponsesProvider extends OpenAiGenericProvider {
  private functionCallbackHandler = new FunctionCallbackHandler();
  private processor: ResponsesProcessor;

  static OPENAI_RESPONSES_MODEL_NAMES = [
    'gpt-4o',
    'gpt-4o-2024-08-06',
    'gpt-4o-2024-11-20',
    'gpt-4o-2024-05-13',
    'gpt-4o-2024-07-18',
    'gpt-4o-mini',
    'gpt-4o-mini-2024-07-18',
    'gpt-4.1',
    'gpt-4.1-2025-04-14',
    'gpt-4.1-mini',
    'gpt-4.1-mini-2025-04-14',
    'gpt-4.1-nano',
    'gpt-4.1-nano-2025-04-14',
    // GPT-5 models
    'gpt-5',
    'gpt-5-2025-08-07',
    'gpt-5-chat',
    'gpt-5-chat-latest',
    'gpt-5-nano',
    'gpt-5-nano-2025-08-07',
    'gpt-5-mini',
    'gpt-5-mini-2025-08-07',
    'gpt-5-pro',
    'gpt-5-pro-2025-10-06',
    // GPT-5.1 models
    'gpt-5.1',
    'gpt-5.1-2025-11-13',
    'gpt-5.1-mini',
    'gpt-5.1-nano',
    'gpt-5.1-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-chat-latest',
    // GPT-5.2 models
    'gpt-5.2',
    'gpt-5.2-2025-12-11',
    // Audio models
    'gpt-audio',
    'gpt-audio-2025-08-28',
    'gpt-audio-mini',
    'gpt-audio-mini-2025-10-06',
    // Computer use model
    'computer-use-preview',
    'computer-use-preview-2025-03-11',
    // Image generation model
    'gpt-image-1',
    'gpt-image-1-2025-04-15',
    'gpt-image-1-mini',
    // Reasoning models
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
    'gpt-5-codex',
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

    // Initialize the shared response processor
    this.processor = new ResponsesProcessor({
      modelName: this.modelName,
      providerType: 'openai',
      functionCallbackHandler: this.functionCallbackHandler,
      costCalculator: (modelName: string, usage: any, config?: any) =>
        calculateOpenAICost(modelName, config, usage?.input_tokens, usage?.output_tokens, 0, 0) ??
        0,
    });
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

  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
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

    // Add verbosity for GPT-5.1 models if configured
    if (this.modelName.startsWith('gpt-5') && config.verbosity) {
      textFormat = { ...textFormat, verbosity: config.verbosity };
    }

    // Load tools from external file if needed
    // Store in variable so we can include in both body and returned config
    const loadedTools = config.tools
      ? await maybeLoadToolsFromExternalFile(config.tools, context?.vars)
      : undefined;

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
      ...(loadedTools ? { tools: loadedTools } : {}),
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

    // Handle reasoning parameters for o-series models
    // Note: reasoning_effort is deprecated and has been moved to reasoning.effort
    if (
      config.reasoning &&
      (this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4') ||
        this.modelName.startsWith('gpt-5'))
    ) {
      body.reasoning = config.reasoning;
    }

    return {
      body,
      config: {
        ...config,
        tools: loadedTools, // Include loaded tools for downstream validation
        response_format: responseFormat,
      },
    };
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

    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);

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

    // Calculate timeout for long-running models (deep research and gpt-5-pro)
    let timeout = REQUEST_TIMEOUT_MS;
    const isLongRunningModel = isDeepResearchModel || this.modelName.includes('gpt-5-pro');
    if (isLongRunningModel) {
      // For long-running models, use PROMPTFOO_EVAL_TIMEOUT_MS if set,
      // otherwise default to 10 minutes (600,000ms)
      const evalTimeout = getEnvInt('PROMPTFOO_EVAL_TIMEOUT_MS', 0);
      if (evalTimeout > 0) {
        timeout = evalTimeout;
      } else {
        timeout = 600_000; // 10 minutes default for long-running models
      }
      logger.debug(`Using timeout of ${timeout}ms for long-running model ${this.modelName}`);
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
        this.config.maxRetries,
      ));

      if (status < 200 || status >= 300) {
        const errorMessage = `API error: ${status} ${statusText}\n${
          typeof data === 'string' ? data : JSON.stringify(data)
        }`;

        // Check if this is an invalid_prompt error code (indicates refusal)
        if (typeof data === 'object' && data?.error?.code === 'invalid_prompt') {
          return {
            output: errorMessage,
            tokenUsage: data?.usage ? getTokenUsage(data, cached) : undefined,
            isRefusal: true,
          };
        }

        return {
          error: errorMessage,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      await data?.deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    if (data.error) {
      await data.deleteFromCache?.();
      return {
        error: formatOpenAiError(data),
      };
    }

    // Use shared processor for consistent behavior with Azure
    return this.processor.processResponseOutput(data, config, cached);
  }
}
