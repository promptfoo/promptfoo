import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import {
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
} from '../../util/index';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { ResponsesProcessor } from '../responses/index';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { calculateXAICost, GROK_4_MODELS } from './chat';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
  TokenUsage,
} from '../../types/index';

/**
 * xAI Agent Tools - Server-side tools for autonomous agent workflows
 * These tools run on xAI's infrastructure and enable the model to:
 * - Search the web (web_search) and X (x_search) in real-time
 * - Execute Python code (code_interpreter)
 * - Search uploaded collections (collections_search)
 * - Connect to MCP servers (mcp)
 */
export interface XAIWebSearchTool {
  type: 'web_search';
  /** Domain filters for web search */
  filters?: {
    allowed_domains?: string[];
    excluded_domains?: string[];
  };
  /** Enable image understanding during web browsing */
  enable_image_understanding?: boolean;
}

export interface XAIXSearchTool {
  type: 'x_search';
  /** X handle filters */
  allowed_x_handles?: string[];
  excluded_x_handles?: string[];
  /** Date range for search (ISO8601 format: YYYY-MM-DD) */
  from_date?: string;
  to_date?: string;
  /** Enable multimodal understanding */
  enable_image_understanding?: boolean;
  enable_video_understanding?: boolean;
}

export interface XAICodeInterpreterTool {
  type: 'code_interpreter';
  /** Container configuration */
  container?: {
    /** Pre-installed pip packages */
    pip_packages?: string[];
  };
}

export interface XAICollectionsSearchTool {
  type: 'collections_search';
  /** Collection IDs to search */
  collection_ids?: string[];
}

export interface XAIMCPTool {
  type: 'mcp';
  /** MCP server URL */
  server_url: string;
  /** Optional server label */
  server_label?: string;
  /** Headers for MCP requests */
  headers?: Record<string, string>;
  /** Allowed tools from this server */
  allowed_tools?: string[];
}

export type XAIAgentTool =
  | XAIWebSearchTool
  | XAIXSearchTool
  | XAICodeInterpreterTool
  | XAICollectionsSearchTool
  | XAIMCPTool;

export interface XAIResponsesConfig {
  /** API key (defaults to XAI_API_KEY env var) */
  apiKey?: string;
  /** API base URL (defaults to https://api.x.ai/v1) */
  apiBaseUrl?: string;
  /** Region for regional endpoints (e.g., 'us-west-1') */
  region?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Top P sampling */
  top_p?: number;
  /** Maximum output tokens */
  max_output_tokens?: number;
  /** System instructions */
  instructions?: string;
  /** Response format (json_object, json_schema, or text) */
  response_format?: any;
  /** xAI Agent Tools (server-side tools) */
  tools?: (XAIAgentTool | any)[];
  /** Tool choice configuration */
  tool_choice?: 'auto' | 'required' | 'none' | { type: 'function'; function: { name: string } };
  /** Enable parallel tool calls */
  parallel_tool_calls?: boolean;
  /** Store response for later retrieval */
  store?: boolean;
  /** Previous response ID for multi-turn conversations */
  previous_response_id?: string;
  /** User identifier */
  user?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Maximum retries */
  maxRetries?: number;
  /** Function callbacks for client-side function tools */
  functionToolCallbacks?: Record<string, (args: string) => Promise<string>>;
  /** Passthrough parameters */
  passthrough?: Record<string, any>;
}

/**
 * xAI Responses API Provider
 *
 * Supports xAI's Responses API with Agent Tools for autonomous agent workflows.
 * This enables Grok models to autonomously search the web, X, execute code,
 * and interact with MCP servers.
 *
 * Usage:
 *   xai:responses:grok-4-1-fast-reasoning
 *   xai:responses:grok-4-fast
 *   xai:responses:grok-4
 */
export class XAIResponsesProvider implements ApiProvider {
  modelName: string;
  config: XAIResponsesConfig;
  env?: EnvOverrides;
  private functionCallbackHandler = new FunctionCallbackHandler();
  private processor: ResponsesProcessor;

  constructor(
    modelName: string,
    options: { config?: XAIResponsesConfig; id?: string; env?: EnvOverrides } = {},
  ) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;

    // Initialize the shared response processor
    this.processor = new ResponsesProcessor({
      modelName: this.modelName,
      providerType: 'xai',
      functionCallbackHandler: this.functionCallbackHandler,
      costCalculator: (modelName: string, usage: any, config?: any) =>
        calculateXAICost(
          modelName,
          config || {},
          usage?.input_tokens || usage?.prompt_tokens,
          usage?.output_tokens || usage?.completion_tokens,
        ) ?? 0,
    });
  }

  id(): string {
    return `xai:responses:${this.modelName}`;
  }

  toString(): string {
    return `[xAI Responses Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'xai:responses',
      model: this.modelName,
      config: {
        ...this.config,
        apiKey: undefined, // Don't expose API key
      },
    };
  }

  protected getApiKey(): string | undefined {
    return this.config.apiKey || getEnvString('XAI_API_KEY');
  }

  protected getApiUrl(): string {
    if (this.config.apiBaseUrl) {
      return this.config.apiBaseUrl;
    }
    if (this.config.region) {
      return `https://${this.config.region}.api.x.ai/v1`;
    }
    return 'https://api.x.ai/v1';
  }

  async getRequestBody(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ) {
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Parse input - can be string or array of messages
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

    // Handle max_output_tokens
    const maxOutputTokens = config.max_output_tokens ?? 4096;

    // Handle temperature
    const temperature = config.temperature ?? 0.7;

    // Load response_format from external file if needed (handles nested schema loading)
    const responseFormat = maybeLoadResponseFormatFromExternalFile(
      config.response_format,
      context?.vars,
    );

    // Build text format configuration
    let textFormat;
    if (responseFormat) {
      if (responseFormat.type === 'json_object') {
        textFormat = { format: { type: 'json_object' } };
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

    // Load tools from external file if needed
    const loadedTools = config.tools
      ? await maybeLoadToolsFromExternalFile(config.tools, context?.vars)
      : undefined;

    // Build request body
    const body: Record<string, any> = {
      model: this.modelName,
      input,
      ...(maxOutputTokens !== undefined ? { max_output_tokens: maxOutputTokens } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(config.instructions ? { instructions: config.instructions } : {}),
      ...(config.top_p !== undefined ? { top_p: config.top_p } : {}),
      ...(loadedTools && loadedTools.length > 0 ? { tools: loadedTools } : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.previous_response_id ? { previous_response_id: config.previous_response_id } : {}),
      text: textFormat,
      ...('parallel_tool_calls' in config
        ? { parallel_tool_calls: Boolean(config.parallel_tool_calls) }
        : {}),
      ...('store' in config ? { store: Boolean(config.store) } : {}),
      ...(config.user ? { user: config.user } : {}),
      ...(config.passthrough || {}),
    };

    // Filter unsupported parameters for Grok-4 models
    if (GROK_4_MODELS.includes(this.modelName)) {
      delete body.presence_penalty;
      delete body.frequency_penalty;
      delete body.stop;
    }

    return {
      body,
      config: {
        ...config,
        tools: loadedTools,
        response_format: responseFormat,
      },
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'xAI API key is not set. Set the XAI_API_KEY environment variable or add `apiKey` to the provider config.',
      };
    }

    const { body, config } = await this.getRequestBody(prompt, context, callApiOptions);

    logger.debug(`[xAI Responses] Calling ${this.getApiUrl()}/responses`, {
      model: this.modelName,
      hasTools: !!body.tools?.length,
      toolTypes: body.tools?.map((t: any) => t.type),
    });

    let data: any;
    let cached = false;
    let status: number;
    let statusText: string;

    try {
      const response = await fetchWithCache(
        `${this.getApiUrl()}/responses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        context?.bustCache ?? context?.debug,
        this.config.maxRetries,
      );

      data = response.data;
      cached = response.cached;
      status = response.status;
      statusText = response.statusText;

      if (status < 200 || status >= 300) {
        const errorMessage = `xAI API error: ${status} ${statusText}\n${
          typeof data === 'string' ? data : JSON.stringify(data)
        }`;

        // Check for specific error types
        if (data?.error?.code === 'invalid_prompt') {
          return {
            output: errorMessage,
            tokenUsage: this.getTokenUsage(data, cached),
            isRefusal: true,
          };
        }

        return { error: errorMessage };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Handle common xAI errors
      if (errorMessage.includes('502') || errorMessage.includes('Bad Gateway')) {
        return {
          error: `xAI API error: 502 Bad Gateway - This often indicates an invalid API key.\n\nTip: Ensure your XAI_API_KEY environment variable is set correctly. You can get an API key from https://x.ai/`,
        };
      }

      return {
        error: `xAI API error: ${errorMessage}\n\nIf this persists, verify your API key at https://x.ai/`,
      };
    }

    if (data.error) {
      return {
        error: `xAI API error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`,
      };
    }

    // Use shared processor for consistent response handling
    return this.processor.processResponseOutput(data, config, cached);
  }

  private getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
    if (!data.usage) {
      return {};
    }

    if (cached) {
      const totalTokens =
        data.usage.total_tokens || (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
      return { cached: totalTokens, total: totalTokens };
    }

    const promptTokens = data.usage.prompt_tokens || data.usage.input_tokens || 0;
    const completionTokens = data.usage.completion_tokens || data.usage.output_tokens || 0;
    const totalTokens = data.usage.total_tokens || promptTokens + completionTokens;

    return {
      total: totalTokens,
      prompt: promptTokens,
      completion: completionTokens,
      ...(data.usage.completion_tokens_details
        ? {
            completionDetails: {
              reasoning: data.usage.completion_tokens_details.reasoning_tokens,
            },
          }
        : {}),
    };
  }
}

/**
 * Create an xAI Responses provider
 *
 * @param providerPath - Provider path in format xai:responses:<model>
 * @param options - Provider options
 * @returns XAIResponsesProvider instance
 */
export function createXAIResponsesProvider(
  providerPath: string,
  options: ProviderOptions = {},
): ApiProvider {
  // Parse model name from path: xai:responses:<model>
  const parts = providerPath.split(':');
  const modelName = parts.slice(2).join(':');

  if (!modelName) {
    throw new Error(
      'Model name is required for xAI Responses provider. Use format: xai:responses:<model>',
    );
  }

  return new XAIResponsesProvider(modelName, {
    config: options.config as XAIResponsesConfig,
    id: options.id,
    env: options.env,
  });
}
