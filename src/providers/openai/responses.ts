import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import {
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../util/index';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { ResponsesProcessor } from '../responses/index';
import { LONG_RUNNING_MODEL_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAICost, formatOpenAiError, getTokenUsage } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';

// OpenAI SDK has APIError class for exceptions, but not a type for error responses
// in the JSON body. This interface represents the structure when the API returns
// an error object in the response body (not as an exception).
interface OpenAIErrorResponse {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

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
    // NOTE: gpt-image-1, gpt-image-1-mini, and gpt-image-1.5 are NOT supported with the Responses API.
    // Use openai:image:gpt-image-1, openai:image:gpt-image-1-mini, or openai:image:gpt-image-1.5 instead (which uses /images/generations endpoint)
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

  protected isGPT5Model(): boolean {
    // Handle both direct model names (gpt-5-mini) and prefixed names (openai/gpt-5-mini)
    return this.modelName.startsWith('gpt-5') || this.modelName.includes('/gpt-5');
  }

  protected isReasoningModel(): boolean {
    return (
      this.modelName.startsWith('o1') ||
      this.modelName.startsWith('o3') ||
      this.modelName.startsWith('o4') ||
      this.modelName.includes('/o1') ||
      this.modelName.includes('/o3') ||
      this.modelName.includes('/o4') ||
      this.modelName === 'codex-mini-latest' ||
      this.isGPT5Model()
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

    // Load response_format from external file if needed (handles nested schema loading)
    const responseFormat = maybeLoadResponseFormatFromExternalFile(
      config.response_format,
      context?.vars,
    );

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
        // Schema is already loaded by maybeLoadResponseFormatFromExternalFile
        const schema = responseFormat.schema || responseFormat.json_schema?.schema;
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

    // Add verbosity for GPT-5 models if configured
    if (this.isGPT5Model() && config.verbosity) {
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
      ...(maxOutputTokens !== undefined ? { max_output_tokens: maxOutputTokens } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
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

    // Handle reasoning parameters for o-series and gpt-5 models
    // Note: reasoning_effort is deprecated and has been moved to reasoning.effort
    if (config.reasoning && this.isReasoningModel()) {
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
      const evalTimeout = getEnvInt('PROMPTFOO_EVAL_TIMEOUT_MS', 0);
      timeout = evalTimeout > 0 ? evalTimeout : LONG_RUNNING_MODEL_TIMEOUT_MS;
      logger.debug(`Using timeout of ${timeout}ms for long-running model ${this.modelName}`);
    }

    // The OpenAI SDK doesn't export a type for the /responses endpoint (it's a newer API).
    // This interface matches the actual response structure from that endpoint.
    interface OpenAIResponsesResponse {
      output?: Array<{
        content?: Array<{
          type: string;
          text?: string;
          thinking?: { reasoning_text?: string };
          refusal?: string;
        }>;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: { name: string; arguments: string };
        }>;
      }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
      error?: {
        code?: string;
        message?: string;
      };
    }

    let data: OpenAIResponsesResponse;
    let status: number;
    let statusText: string;
    let cached = false;
    let deleteFromCache: (() => Promise<void>) | undefined;
    let responseHeaders: Record<string, string> | undefined;
    try {
      ({
        data,
        cached,
        status,
        statusText,
        deleteFromCache,
        headers: responseHeaders,
      } = await fetchWithCache<OpenAIResponsesResponse>(
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
            metadata: {
              http: {
                status,
                statusText,
                headers: responseHeaders ?? {},
              },
            },
          };
        }

        return {
          error: errorMessage,
          metadata: {
            http: {
              status,
              statusText,
              headers: responseHeaders ?? {},
            },
          },
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      await deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
        metadata: {
          http: {
            status: 0,
            statusText: 'Error',
            headers: responseHeaders ?? {},
          },
        },
      };
    }

    if (data.error?.message) {
      await deleteFromCache?.();
      return {
        error: formatOpenAiError(data as OpenAIErrorResponse),
        metadata: {
          http: {
            status,
            statusText,
            headers: responseHeaders ?? {},
          },
        },
      };
    }

    // Use shared processor for consistent behavior with Azure
    const result = await this.processor.processResponseOutput(data, config, cached);

    // Merge HTTP metadata with any existing metadata from the processor
    return {
      ...result,
      metadata: {
        ...result.metadata,
        http: {
          status,
          statusText,
          headers: responseHeaders ?? {},
        },
      },
    };
  }
}
