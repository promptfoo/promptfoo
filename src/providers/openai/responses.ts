import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { fetchWithRetries } from '../../util/fetch/index';
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
import {
  callJsonCachedOpenAi,
  createJsonCachedOpenAiClient,
  createOpenAiClient,
  getOpenAiHttpMetadata,
  getOpenAiInvalidPromptCode,
  unwrapOpenAiTransportError,
} from './client';
import {
  isAzureOpenAiEndpoint,
  isOpenAiGpt5Model,
  isOpenAiReasoningModel,
} from './modelCapabilities';
import { formatOpenAiError, getTokenUsage } from './util';
import type OpenAI from 'openai';

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

type ResponsesTransportResult = {
  cached: boolean;
  data: OpenAI.Responses.Response;
  deleteFromCache?: () => Promise<void>;
  requestMetadata?: ReturnType<typeof createJsonCachedOpenAiClient>['requestMetadata'];
  responseHeaders?: Record<string, string>;
  status: number;
  statusText: string;
};

type ResponsesTransportFailure = {
  deleteFromCache?: () => Promise<void>;
  error: unknown;
  requestMetadata?: ReturnType<typeof createJsonCachedOpenAiClient>['requestMetadata'];
  responseHeaders?: Record<string, string>;
};

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
    return isOpenAiGpt5Model(this.modelName);
  }

  protected isReasoningModel(): boolean {
    return isOpenAiReasoningModel(this.modelName, { includeCodexMiniLatest: true });
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

  private getDeploymentCapabilities(config: OpenAiCompletionOptions) {
    const hasAzureCustomDeploymentHost = [config.apiHost, config.apiBaseUrl, this.getApiUrl()].some(
      (endpoint) => isAzureOpenAiEndpoint(endpoint),
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

  private parsePromptInput(prompt: string): string | unknown[] {
    try {
      const parsedJson = JSON.parse(prompt);
      return Array.isArray(parsedJson) ? parsedJson : prompt;
    } catch {
      return prompt;
    }
  }

  private getMaxOutputTokens(
    config: OpenAiCompletionOptions,
    isReasoningModel: boolean,
  ): number | undefined {
    const maxOutputTokensDefault = config.omitDefaults
      ? getEnvString('OPENAI_MAX_TOKENS') === undefined
        ? undefined
        : getEnvInt('OPENAI_MAX_TOKENS')
      : getEnvInt('OPENAI_MAX_TOKENS', 1024);
    const reasoningMaxOutputTokensDefault =
      getEnvInt('OPENAI_MAX_COMPLETION_TOKENS') ?? getEnvInt('OPENAI_MAX_TOKENS');

    return (
      config.max_output_tokens ??
      (isReasoningModel ? reasoningMaxOutputTokensDefault : maxOutputTokensDefault)
    );
  }

  private getTextFormat(
    responseFormat: ReturnType<typeof maybeLoadResponseFormatFromExternalFile>,
    config: OpenAiCompletionOptions,
    isGPT5Model: boolean,
  ) {
    let textFormat;

    if (responseFormat?.type === 'json_object') {
      textFormat = {
        format: {
          type: 'json_object',
        },
      };
    } else if (responseFormat?.type === 'json_schema') {
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

    return isGPT5Model && config.verbosity
      ? { ...textFormat, verbosity: config.verbosity }
      : textFormat;
  }

  private createRequestBody({
    config,
    input,
    instructions,
    loadedTools,
    maxOutputTokens,
    reasoningEffort,
    renderedReasoning,
    temperature,
    textFormat,
    isReasoningModel,
  }: {
    config: OpenAiCompletionOptions;
    input: string | unknown[];
    instructions: OpenAiCompletionOptions['instructions'];
    loadedTools: Awaited<ReturnType<typeof maybeLoadToolsFromExternalFile>>;
    maxOutputTokens: number | undefined;
    reasoningEffort: ReasoningEffort | undefined;
    renderedReasoning: OpenAiCompletionOptions['reasoning'];
    temperature: number | undefined;
    textFormat: ReturnType<OpenAiResponsesProvider['getTextFormat']>;
    isReasoningModel: boolean;
  }) {
    const body: Record<string, any> = {
      model: this.modelName,
      input,
      ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(temperature === undefined ? {} : { temperature }),
      ...(instructions ? { instructions } : {}),
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

    if (renderedReasoning && isReasoningModel) {
      body.reasoning = { ...body.reasoning, ...renderedReasoning };
    }
    if ('max_tokens' in body) {
      delete body.max_tokens;
    }

    return body;
  }

  private validateDeepResearchConfig(config: OpenAiCompletionOptions): ProviderResponse | undefined {
    if (!this.modelName.includes('deep-research')) {
      return undefined;
    }

    const hasWebSearchTool = config.tools?.some(
      (tool: any) => tool.type === 'web_search_preview',
    );
    if (!hasWebSearchTool) {
      return {
        error: `Deep research model ${this.modelName} requires the web_search_preview tool to be configured. Add it to your provider config:\ntools:\n  - type: web_search_preview`,
      };
    }

    const invalidMcpTool = config.tools?.find(
      (tool: any) => tool.type === 'mcp' && tool.require_approval !== 'never',
    );
    return invalidMcpTool
      ? {
          error: `Deep research model ${this.modelName} requires MCP tools to have require_approval: 'never'. Update your MCP tool configuration:\ntools:\n  - type: mcp\n    require_approval: never`,
        }
      : undefined;
  }

  private getTimeoutMs(): number {
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

  private async createTransportResult(
    body: Record<string, any>,
    config: OpenAiCompletionOptions,
    context: CallApiContextParams | undefined,
    timeout: number,
  ): Promise<ResponsesTransportResult> {
    if (body.stream === true) {
      const client = createOpenAiClient({
        apiKey: this.getApiKey(),
        allowMissingApiKey: !this.requiresApiKey(),
        organization: this.getOrganization(),
        baseURL: this.getApiUrl(),
        headers: config.headers,
        maxRetries: 0,
        timeout,
        fetch: (url, init = {}) =>
          fetchWithRetries(
            url instanceof URL ? url.toString() : url,
            init,
            timeout,
            this.config.maxRetries,
          ),
      });
      const request = client.responses.create(
        body as OpenAI.Responses.ResponseCreateParamsStreaming,
      );
      const { data: stream, response } = await request.withResponse();
      return {
        cached: false,
        data: await getTerminalResponsesStreamData(stream),
        responseHeaders: Object.fromEntries(response.headers.entries()),
        status: response.status,
        statusText: response.statusText,
      };
    }

    const request = await callJsonCachedOpenAi(
      {
        apiKey: this.getApiKey(),
        allowMissingApiKey: !this.requiresApiKey(),
        organization: this.getOrganization(),
        baseURL: this.getApiUrl(),
        headers: config.headers,
        bustCache: context?.bustCache ?? context?.debug,
        maxRetries: this.config.maxRetries,
        timeout,
      },
      (client) =>
        client.responses.create(
          body as OpenAI.Responses.ResponseCreateParamsNonStreaming,
        ) as Promise<OpenAI.Responses.Response>,
    );
    const { requestMetadata } = request;
    if (!request.ok) {
      throw {
        deleteFromCache: requestMetadata.deleteFromCache,
        error: request.error,
        requestMetadata,
        responseHeaders: requestMetadata.headers,
      } satisfies ResponsesTransportFailure;
    }

    return {
      cached: requestMetadata.cached,
      data: request.data,
      deleteFromCache: requestMetadata.deleteFromCache,
      requestMetadata,
      responseHeaders: requestMetadata.headers,
      status: requestMetadata.status ?? 200,
      statusText: requestMetadata.statusText ?? 'OK',
    };
  }

  private getHttpErrorResponse({
    cached,
    data,
    responseHeaders,
    status,
    statusText,
  }: ResponsesTransportResult): ProviderResponse | undefined {
    if (status >= 200 && status < 300) {
      return undefined;
    }

    const errorMessage = `API error: ${status} ${statusText}\n${
      typeof data === 'string' ? data : JSON.stringify(data)
    }`;
    if (typeof data === 'object' && data?.error?.code === 'invalid_prompt') {
      return {
        output: errorMessage,
        tokenUsage: data?.usage ? getTokenUsage(data, cached) : undefined,
        isRefusal: true,
        metadata: getOpenAiHttpMetadata({ headers: responseHeaders, status, statusText }),
      };
    }

    return {
      error: errorMessage,
      metadata: getOpenAiHttpMetadata({ headers: responseHeaders, status, statusText }),
    };
  }

  private async getTransportErrorResponse(
    err: unknown,
    result: Pick<ResponsesTransportResult, 'deleteFromCache' | 'requestMetadata' | 'responseHeaders'>,
  ): Promise<ProviderResponse> {
    const failure = isResponsesTransportFailure(err) ? err : undefined;
    const transportError = failure?.error ?? err;
    const requestMetadata = failure?.requestMetadata ?? result.requestMetadata;
    const deleteFromCache = failure?.deleteFromCache ?? result.deleteFromCache;
    const responseHeaders = failure?.responseHeaders ?? result.responseHeaders;
    const status = requestMetadata?.status ?? getErrorStatus(transportError);
    const statusText = requestMetadata?.statusText ?? 'Error';
    const errorData = requestMetadata?.data ?? getErrorData(transportError);
    const headers = responseHeaders ?? requestMetadata?.headers ?? {};

    if (status && status >= 400) {
      const errorMessage = `API error: ${status} ${statusText}\n${
        typeof errorData === 'string' ? errorData : JSON.stringify(errorData)
      }`;
      return getOpenAiInvalidPromptCode(errorData) === 'invalid_prompt'
        ? {
            output: errorMessage,
            isRefusal: true,
            metadata: { http: { status, statusText, headers } },
          }
        : {
            error: errorMessage,
            metadata: { http: { status, statusText, headers } },
          };
    }

    const apiCallError = unwrapOpenAiTransportError(transportError);
    logger.error(`API call error: ${String(apiCallError)}`);
    await deleteFromCache?.();
    return {
      error: `API call error: ${String(apiCallError)}`,
      metadata: {
        http: {
          status: 0,
          statusText: 'Error',
          headers: responseHeaders ?? {},
        },
      },
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

    const input = this.parsePromptInput(prompt);

    const { isAzureResponsesDeploymentWithReasoningConfig, isReasoningModel, isGPT5Model } =
      this.getDeploymentCapabilities(config);
    const maxOutputTokens = this.getMaxOutputTokens(config, isReasoningModel);

    const renderedReasoning = renderVarsInObject(
      config.reasoning,
      context?.vars,
    ) as typeof config.reasoning;
    const renderedReasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;
    const effectiveReasoningEffort = renderedReasoning?.effort ?? renderedReasoningEffort;
    const hasAzureReasoningEffort =
      isAzureResponsesDeploymentWithReasoningConfig &&
      effectiveReasoningEffort !== undefined &&
      effectiveReasoningEffort !== 'none';

    const temperatureDefault = config.omitDefaults
      ? getEnvString('OPENAI_TEMPERATURE') === undefined
        ? undefined
        : getEnvFloat('OPENAI_TEMPERATURE')
      : getEnvFloat('OPENAI_TEMPERATURE', 0);
    const temperature =
      this.supportsTemperature() && !hasAzureReasoningEffort
        ? (config.temperature ?? temperatureDefault)
        : undefined;
    const reasoningEffort = isReasoningModel ? effectiveReasoningEffort : undefined;

    const instructions = config.instructions;

    // Load response_format from external file if needed (handles nested schema loading)
    const responseFormat = maybeLoadResponseFormatFromExternalFile(
      config.response_format,
      context?.vars,
    );

    const textFormat = this.getTextFormat(responseFormat, config, isGPT5Model);

    // Load tools from external file if needed
    // Store in variable so we can include in both body and returned config
    const loadedTools = config.tools
      ? await maybeLoadToolsFromExternalFile(config.tools, context?.vars)
      : undefined;

    const body = this.createRequestBody({
      config,
      input,
      instructions,
      loadedTools,
      maxOutputTokens,
      reasoningEffort,
      renderedReasoning,
      temperature,
      textFormat,
      isReasoningModel,
    });

    return {
      body,
      config: {
        ...config,
        tools: Array.isArray(body.tools) ? body.tools : loadedTools, // Include effective tools for downstream validation
        response_format: responseFormat,
      },
    };
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

    const deepResearchValidation = this.validateDeepResearchConfig(config);
    if (deepResearchValidation) {
      return deepResearchValidation;
    }
    const timeout = this.getTimeoutMs();

    let transportResult: ResponsesTransportResult | undefined;
    try {
      transportResult = await this.createTransportResult(body, config, context, timeout);
      const httpError = this.getHttpErrorResponse(transportResult);
      if (httpError) {
        return httpError;
      }
    } catch (err) {
      return this.getTransportErrorResponse(err, {
        deleteFromCache: transportResult?.deleteFromCache,
        requestMetadata: transportResult?.requestMetadata,
        responseHeaders: transportResult?.responseHeaders,
      });
    }

    const { cached, data, deleteFromCache, responseHeaders, status, statusText } = transportResult!;
    if (data.error?.message) {
      await deleteFromCache?.();
      return {
        error: formatOpenAiError(data as OpenAIErrorResponse),
        metadata: getOpenAiHttpMetadata({ headers: responseHeaders, status, statusText }),
      };
    }

    // Use shared processor for consistent behavior with Azure
    const result = await this.processor.processResponseOutput(data, config, cached);
    const billedResult = this.applyBilling(result, data, config, cached);

    // Merge HTTP metadata with any existing metadata from the processor
    return {
      ...billedResult,
      metadata: {
        ...billedResult.metadata,
        ...getOpenAiHttpMetadata({ headers: responseHeaders, status, statusText }),
      },
    };
  }
}

async function getTerminalResponsesStreamData(
  stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
) {
  let terminalResponse: OpenAI.Responses.Response | undefined;

  for await (const event of stream) {
    if (
      event.type === 'response.completed' ||
      event.type === 'response.failed' ||
      event.type === 'response.incomplete'
    ) {
      terminalResponse = event.response;
    }
  }

  if (!terminalResponse) {
    throw new Error('Responses stream ended without a terminal response event');
  }

  return terminalResponse;
}

function getErrorStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : undefined;
}

function getErrorData(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'error' in error
    ? error.error
    : undefined;
}

function isResponsesTransportFailure(error: unknown): error is ResponsesTransportFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    ('requestMetadata' in error || 'deleteFromCache' in error || 'responseHeaders' in error)
  );
}
