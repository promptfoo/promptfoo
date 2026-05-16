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
import { getRequestTimeoutMs, LONG_RUNNING_MODEL_TIMEOUT_MS } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateObservableOpenAIToolCost, calculateOpenAIUsageCost } from './billing';
import { formatOpenAiError, getTokenUsage } from './util';

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

interface ResponseRequestResult {
  data: OpenAIResponsesResponse | string;
  status: number;
  statusText: string;
  cached: boolean;
  deleteFromCache?: () => Promise<void>;
  headers?: Record<string, string>;
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
    'gpt-5.2-chat-latest',
    'gpt-5.2-codex',
    'gpt-5.2-pro',
    'gpt-5.2-pro-2025-12-11',
    // GPT-5.3 models
    'gpt-5.3-chat-latest',
    'gpt-5.3-codex',
    'gpt-5.3-codex-spark',
    // GPT-5.5 models
    'gpt-5.5',
    'gpt-5.5-2026-04-23',
    'gpt-5.5-pro',
    'gpt-5.5-pro-2026-04-23',
    // GPT-5.4 models
    'gpt-5.4',
    'gpt-5.4-2026-03-05',
    'gpt-5.4-mini',
    'gpt-5.4-mini-2026-03-17',
    'gpt-5.4-nano',
    'gpt-5.4-nano-2026-03-17',
    'gpt-5.4-pro',
    'gpt-5.4-pro-2026-03-05',
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
    this.config = options.config ? { ...options.config } : {};

    // Initialize the shared response processor
    this.processor = new ResponsesProcessor({
      modelName: this.modelName,
      providerType: 'openai',
      functionCallbackHandler: this.functionCallbackHandler,
      costCalculator: () => undefined,
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

  protected getBillingModelName(_config: OpenAiCompletionOptions): string {
    return this.modelName;
  }

  protected getBillingUsage(data: any, _config: OpenAiCompletionOptions): any {
    return data.usage;
  }

  protected applyBilling(
    result: ProviderResponse,
    data: any,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): ProviderResponse {
    const serviceTier =
      (data as { service_tier?: string | null }).service_tier ?? config.service_tier;
    const billingModelName = this.getBillingModelName(config);
    const responseCost = calculateOpenAIUsageCost(
      billingModelName,
      config,
      this.getBillingUsage(data, config),
      {
        cachedResponse: cached,
        serviceTier,
      },
    );
    const observableToolCost = cached
      ? 0
      : calculateObservableOpenAIToolCost(data, billingModelName, config);

    return {
      ...result,
      ...(responseCost === undefined ? {} : { cost: responseCost + observableToolCost }),
    };
  }

  private isAzureOpenAiEndpoint(value: string | undefined): boolean {
    if (!value) {
      return false;
    }

    const endpoint = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const hostname = new URL(endpoint).hostname.toLowerCase();
      return hostname === 'openai.azure.com' || hostname.endsWith('.openai.azure.com');
    } catch {
      return false;
    }
  }

  private getDeploymentCapabilities(config: OpenAiCompletionOptions) {
    const hasAzureCustomDeploymentHost = [config.apiHost, config.apiBaseUrl, this.getApiUrl()].some(
      (endpoint) => this.isAzureOpenAiEndpoint(endpoint),
    );
    const isAzureResponsesDeploymentWithReasoningConfig =
      hasAzureCustomDeploymentHost &&
      (config.reasoning !== undefined || config.reasoning_effort !== undefined);
    const isAzureResponsesDeploymentWithVerbosityConfig =
      hasAzureCustomDeploymentHost && config.verbosity !== undefined;
    // Verbosity is a GPT-5 feature separate from reasoning; only reasoning config
    // should promote a custom deployment to "reasoning model" status, otherwise
    // max_output_tokens defaults change unexpectedly.
    const isReasoningModel =
      this.isReasoningModel() || isAzureResponsesDeploymentWithReasoningConfig;
    const isGPT5Model = this.isGPT5Model() || isAzureResponsesDeploymentWithVerbosityConfig;

    return {
      isAzureResponsesDeploymentWithReasoningConfig,
      isReasoningModel,
      isGPT5Model,
    };
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
    const input = this.parseResponseInput(prompt);

    const { isAzureResponsesDeploymentWithReasoningConfig, isReasoningModel, isGPT5Model } =
      this.getDeploymentCapabilities(config);
    const maxOutputTokens = this.getMaxOutputTokens(config, isReasoningModel);
    const { renderedReasoning, reasoningEffort, hasAzureReasoningEffort } = this.getReasoningConfig(
      config,
      context,
      isReasoningModel,
      isAzureResponsesDeploymentWithReasoningConfig,
    );
    const temperature = this.getTemperature(config, hasAzureReasoningEffort);
    const responseFormat = maybeLoadResponseFormatFromExternalFile(
      config.response_format,
      context?.vars,
    );
    const textFormat = this.buildTextFormat(responseFormat, isGPT5Model, config.verbosity);
    const loadedTools = await this.loadResponseTools(config, context);
    const body = this.buildResponsesBody({
      config,
      input,
      maxOutputTokens,
      reasoningEffort,
      temperature,
      textFormat,
      loadedTools,
    });
    this.mergeRenderedReasoning(body, renderedReasoning, isReasoningModel);
    this.stripMaxTokens(body);

    return {
      body,
      config: {
        ...config,
        tools: Array.isArray(body.tools) ? body.tools : loadedTools, // Include effective tools for downstream validation
        response_format: responseFormat,
      },
    };
  }

  private parseResponseInput(prompt: string): string | unknown[] {
    try {
      const parsedJson = JSON.parse(prompt);
      return Array.isArray(parsedJson) ? parsedJson : prompt;
    } catch {
      return prompt;
    }
  }

  private getMaxOutputTokens(config: OpenAiCompletionOptions, isReasoningModel: boolean) {
    const maxOutputTokensDefault = config.omitDefaults
      ? getEnvString('OPENAI_MAX_TOKENS') === undefined
        ? undefined
        : getEnvInt('OPENAI_MAX_TOKENS')
      : getEnvInt('OPENAI_MAX_TOKENS', 1024);
    const reasoningDefault =
      getEnvInt('OPENAI_MAX_COMPLETION_TOKENS') ?? getEnvInt('OPENAI_MAX_TOKENS');
    return (
      config.max_output_tokens ?? (isReasoningModel ? reasoningDefault : maxOutputTokensDefault)
    );
  }

  private getReasoningConfig(
    config: OpenAiCompletionOptions,
    context: CallApiContextParams | undefined,
    isReasoningModel: boolean,
    isAzureReasoningDeployment: boolean,
  ) {
    const renderedReasoning = renderVarsInObject(
      config.reasoning,
      context?.vars,
    ) as typeof config.reasoning;
    const renderedReasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;
    const effectiveReasoningEffort = renderedReasoning?.effort ?? renderedReasoningEffort;
    return {
      renderedReasoning,
      reasoningEffort: isReasoningModel ? effectiveReasoningEffort : undefined,
      hasAzureReasoningEffort:
        isAzureReasoningDeployment &&
        effectiveReasoningEffort !== undefined &&
        effectiveReasoningEffort !== 'none',
    };
  }

  private getTemperature(config: OpenAiCompletionOptions, hasAzureReasoningEffort: boolean) {
    const temperatureDefault = config.omitDefaults
      ? getEnvString('OPENAI_TEMPERATURE') === undefined
        ? undefined
        : getEnvFloat('OPENAI_TEMPERATURE')
      : getEnvFloat('OPENAI_TEMPERATURE', 0);
    return this.supportsTemperature() && !hasAzureReasoningEffort
      ? (config.temperature ?? temperatureDefault)
      : undefined;
  }

  private buildTextFormat(
    responseFormat: ReturnType<typeof maybeLoadResponseFormatFromExternalFile>,
    isGPT5Model: boolean,
    verbosity: OpenAiCompletionOptions['verbosity'],
  ) {
    const textFormat = this.getBaseTextFormat(responseFormat);
    return isGPT5Model && verbosity ? { ...textFormat, verbosity } : textFormat;
  }

  private getBaseTextFormat(
    responseFormat: ReturnType<typeof maybeLoadResponseFormatFromExternalFile>,
  ) {
    if (!responseFormat) {
      return { format: { type: 'text' } };
    }
    if (responseFormat.type === 'json_object') {
      return { format: { type: 'json_object' } };
    }
    if (responseFormat.type !== 'json_schema') {
      return { format: { type: 'text' } };
    }
    const schema = responseFormat.schema || responseFormat.json_schema?.schema;
    const schemaName = responseFormat.json_schema?.name || responseFormat.name || 'response_schema';
    return {
      format: {
        type: 'json_schema',
        name: schemaName,
        schema,
        strict: true,
      },
    };
  }

  private async loadResponseTools(config: OpenAiCompletionOptions, context?: CallApiContextParams) {
    return config.tools ? maybeLoadToolsFromExternalFile(config.tools, context?.vars) : undefined;
  }

  private buildResponsesBody({
    config,
    input,
    maxOutputTokens,
    reasoningEffort,
    temperature,
    textFormat,
    loadedTools,
  }: {
    config: OpenAiCompletionOptions;
    input: string | unknown[];
    maxOutputTokens: number | undefined;
    reasoningEffort: string | null | undefined;
    temperature: number | undefined;
    textFormat: Record<string, unknown>;
    loadedTools: unknown;
  }) {
    return {
      model: this.modelName,
      input,
      ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(temperature === undefined ? {} : { temperature }),
      ...(config.instructions ? { instructions: config.instructions } : {}),
      ...((!reasoningEffort || reasoningEffort === 'none') &&
      (config.top_p !== undefined || getEnvString('OPENAI_TOP_P'))
        ? { top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1) }
        : {}),
      ...(loadedTools ? { tools: loadedTools } : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.max_tool_calls ? { max_tool_calls: config.max_tool_calls } : {}),
      ...(config.include === undefined ? {} : { include: config.include }),
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
      ...(config.prompt_cache_key === undefined
        ? {}
        : { prompt_cache_key: config.prompt_cache_key }),
      ...(config.prompt_cache_retention === undefined
        ? {}
        : { prompt_cache_retention: config.prompt_cache_retention }),
      ...(config.passthrough || {}),
    };
  }

  private mergeRenderedReasoning(
    body: Record<string, any>,
    renderedReasoning: OpenAiCompletionOptions['reasoning'],
    isReasoningModel: boolean,
  ): void {
    if (renderedReasoning && isReasoningModel) {
      body.reasoning = { ...body.reasoning, ...renderedReasoning };
    }
  }

  private stripMaxTokens(body: Record<string, any>): void {
    if ('max_tokens' in body) {
      delete body.max_tokens;
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);
    const validationError = this.validateDeepResearchConfig(config);
    if (validationError) {
      return validationError;
    }

    const timeout = this.getResponsesTimeout();
    let response: ResponseRequestResult;
    try {
      response = await this.requestResponses(body, config, timeout, context);
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return this.formatRequestFailure(err);
    }

    if (response.status < 200 || response.status >= 300) {
      return this.formatHttpError(response);
    }
    if (this.hasResponseBodyError(response.data)) {
      await response.deleteFromCache?.();
      return this.formatBodyError(response);
    }

    const result = await this.processor.processResponseOutput(
      response.data,
      config,
      response.cached,
    );
    const billedResult = this.applyBilling(result, response.data, config, response.cached);
    return this.withHttpMetadata(billedResult, response);
  }

  private validateDeepResearchConfig(
    config: OpenAiCompletionOptions,
  ): ProviderResponse | undefined {
    if (!this.modelName.includes('deep-research')) {
      return undefined;
    }
    if (!config.tools?.some((tool: any) => tool.type === 'web_search_preview')) {
      return {
        error: `Deep research model ${this.modelName} requires the web_search_preview tool to be configured. Add it to your provider config:\ntools:\n  - type: web_search_preview`,
      };
    }
    const invalidMcpTool = (config.tools?.filter((tool: any) => tool.type === 'mcp') || []).find(
      (tool: any) => tool.require_approval !== 'never',
    );
    if (!invalidMcpTool) {
      return undefined;
    }
    return {
      error: `Deep research model ${this.modelName} requires MCP tools to have require_approval: 'never'. Update your MCP tool configuration:\ntools:\n  - type: mcp\n    require_approval: never`,
    };
  }

  private getResponsesTimeout(): number {
    const isDeepResearchModel = this.modelName.includes('deep-research');
    const isGpt5ProModel = /(^|\/)gpt-5(?:\.\d+)?-pro(?:-|$)/.test(this.modelName);
    if (!isDeepResearchModel && !isGpt5ProModel) {
      return getRequestTimeoutMs();
    }
    const evalTimeout = getEnvInt('PROMPTFOO_EVAL_TIMEOUT_MS', 0);
    const timeout = evalTimeout > 0 ? evalTimeout : LONG_RUNNING_MODEL_TIMEOUT_MS;
    logger.debug(`Using timeout of ${timeout}ms for long-running model ${this.modelName}`);
    return timeout;
  }

  private async requestResponses(
    body: Record<string, unknown>,
    config: OpenAiCompletionOptions,
    timeout: number,
    context?: CallApiContextParams,
  ): Promise<ResponseRequestResult> {
    const result = await fetchWithCache<OpenAIResponsesResponse>(
      `${this.getApiUrl()}/responses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
          ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
          ...config.headers,
        },
        body: JSON.stringify(body),
      },
      timeout,
      'json',
      context?.bustCache ?? context?.debug,
      this.config.maxRetries,
    );
    return {
      data: result.data,
      cached: result.cached,
      status: result.status,
      statusText: result.statusText,
      deleteFromCache: result.deleteFromCache,
      headers: result.headers,
    };
  }

  private formatRequestFailure(err: unknown): ProviderResponse {
    return {
      error: `API call error: ${String(err)}`,
      metadata: {
        http: {
          status: 0,
          statusText: 'Error',
          headers: {},
        },
      },
    };
  }

  private formatHttpError(response: ResponseRequestResult): ProviderResponse {
    const errorBody =
      typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const errorMessage = `API error: ${response.status} ${response.statusText}\n${errorBody}`;
    if (typeof response.data === 'object' && response.data.error?.code === 'invalid_prompt') {
      return {
        output: errorMessage,
        tokenUsage: response.data.usage ? getTokenUsage(response.data, response.cached) : undefined,
        isRefusal: true,
        metadata: this.buildHttpMetadata(response),
      };
    }
    return {
      error: errorMessage,
      metadata: this.buildHttpMetadata(response),
    };
  }

  private formatBodyError(response: ResponseRequestResult): ProviderResponse {
    return {
      error: formatOpenAiError(response.data as OpenAIErrorResponse),
      metadata: this.buildHttpMetadata(response),
    };
  }

  private hasResponseBodyError(
    data: ResponseRequestResult['data'],
  ): data is OpenAIResponsesResponse {
    return typeof data === 'object' && data !== null && Boolean(data.error?.message);
  }

  private withHttpMetadata(
    result: ProviderResponse,
    response: ResponseRequestResult,
  ): ProviderResponse {
    return {
      ...result,
      metadata: {
        ...result.metadata,
        ...this.buildHttpMetadata(response),
      },
    };
  }

  private buildHttpMetadata(response: ResponseRequestResult) {
    return {
      http: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers ?? {},
      },
    };
  }
}
