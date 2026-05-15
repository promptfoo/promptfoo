import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { formatRateLimitErrorMessage, HttpRateLimitError } from '../../util/fetch/errors';
import { FINISH_REASON_MAP, normalizeFinishReason } from '../../util/finishReason';
import {
  maybeLoadFromExternalFileWithVars,
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../util/index';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToOpenAi } from '../mcp/transform';
import { parseChatPrompt, transformToolChoice, transformTools } from '../shared';
import { OpenAiGenericProvider } from './';
import { calculateOpenAIUsageCost } from './billing';
import {
  callJsonCachedOpenAi,
  getOpenAiHttpMetadata,
  getOpenAiInvalidPromptCode,
  unwrapOpenAiTransportError,
} from './client';
import {
  isOpenAiGpt5Model,
  isOpenAiOSeriesReasoningModel,
  isOpenAiReasoningModel,
} from './modelCapabilities';
import { getTokenUsage, OPENAI_CHAT_MODELS } from './util';
import type OpenAI from 'openai';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';

type OpenAIChatCompletionResponse = OpenAI.ChatCompletion & {
  choices: Array<
    OpenAI.ChatCompletion.Choice & {
      message: OpenAI.ChatCompletion.Choice['message'] & {
        reasoning?: string;
        reasoning_content?: string;
        audio?: {
          id: string;
          expires_at: number;
          data: string;
          transcript: string;
          format?: string;
        };
      };
    }
  >;
  usage?: OpenAI.ChatCompletion['usage'] & {
    audio_prompt_tokens?: number;
    audio_completion_tokens?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type ChatCallbackResult = {
  output?: string;
};

function getChatApiErrorResponse({
  cached,
  data,
  headers,
  latencyMs,
  status,
  statusText,
}: {
  cached: boolean;
  data: any;
  headers?: Record<string, string>;
  latencyMs?: number;
  status: number;
  statusText: string;
}): ProviderResponse {
  const errorMessage = `API error: ${status} ${statusText}\n${
    typeof data === 'string' ? data : JSON.stringify(data)
  }`;

  if (getOpenAiInvalidPromptCode(data) === 'invalid_prompt') {
    return {
      output: errorMessage,
      tokenUsage: data?.usage ? getTokenUsage(data, cached) : undefined,
      latencyMs,
      isRefusal: true,
      guardrails: {
        flagged: true,
        flaggedInput: true,
      },
      metadata: getOpenAiHttpMetadata({ headers, status, statusText }),
    };
  }

  return {
    error: errorMessage,
    metadata: getOpenAiHttpMetadata({ headers, status, statusText }),
  };
}

async function getChatTransportErrorResponse({
  deleteFromCache,
  error,
  responseHeaders,
}: {
  deleteFromCache?: () => Promise<void>;
  error: unknown;
  responseHeaders?: Record<string, string>;
}): Promise<ProviderResponse> {
  const apiCallError = unwrapOpenAiTransportError(error);
  logger.error(`API call error: ${String(apiCallError)}`);
  await deleteFromCache?.();

  if (apiCallError instanceof HttpRateLimitError) {
    return {
      error: formatRateLimitErrorMessage(apiCallError),
      metadata: {
        rateLimitKind: apiCallError.kind,
        http: {
          status: apiCallError.status,
          statusText: apiCallError.statusText,
          headers: apiCallError.headers ?? responseHeaders ?? {},
        },
      },
    };
  }

  return {
    error: `API call error: ${String(apiCallError)}`,
    metadata: getOpenAiHttpMetadata({
      headers: responseHeaders,
      status: 0,
      statusText: 'Error',
    }),
  };
}

function normalizeMcpContent(content: any): string {
  if (content == null) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return JSON.stringify(content);
  }

  return content.map(normalizeMcpPart).join('\n');
}

function normalizeMcpPart(part: any): string {
  if (typeof part === 'string') {
    return part;
  }
  if (!part || typeof part !== 'object') {
    return String(part);
  }
  if ('text' in part && part.text != null) {
    return String(part.text);
  }
  if ('json' in part) {
    return JSON.stringify(part.json);
  }
  if ('data' in part) {
    return JSON.stringify(part.data);
  }
  return JSON.stringify(part);
}

export class OpenAiChatCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_CHAT_MODELS = OPENAI_CHAT_MODELS;

  static OPENAI_CHAT_MODEL_NAMES = OPENAI_CHAT_MODELS.map((model) => model.id);

  config: OpenAiCompletionOptions;
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private functionCallbackHandler = new FunctionCallbackHandler();

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!OpenAiChatCompletionProvider.OPENAI_CHAT_MODEL_NAMES.includes(modelName)) {
      logger.debug(`Using unknown chat model: ${modelName}`);
    }
    super(modelName, options);
    this.config = options.config ? { ...options.config } : {};

    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  private async initializeMCP(): Promise<void> {
    this.mcpClient = new MCPClient(this.config.mcp!);
    await this.mcpClient.initialize();
  }

  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      await this.initializationPromise;
      await this.mcpClient.cleanup();
      this.mcpClient = null;
    }
  }

  protected isGPT5Model(): boolean {
    return isOpenAiGpt5Model(this.modelName);
  }

  protected isReasoningModel(): boolean {
    return isOpenAiReasoningModel(this.modelName);
  }

  protected supportsTemperature(): boolean {
    // OpenAI's o1 and o3 models don't support temperature but some 3rd
    // party reasoning models do.
    return !this.isReasoningModel();
  }

  protected getBillingModelName(_config: OpenAiCompletionOptions): string {
    return this.modelName;
  }

  private getRequestLimits(
    config: OpenAiCompletionOptions,
    isReasoningModel: boolean,
    isGPT5Model: boolean,
  ) {
    const maxCompletionTokens = isReasoningModel
      ? (config.max_completion_tokens ?? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS'))
      : undefined;
    const maxTokensDefault = config.omitDefaults
      ? getEnvString('OPENAI_MAX_TOKENS') === undefined
        ? undefined
        : getEnvInt('OPENAI_MAX_TOKENS')
      : getEnvInt('OPENAI_MAX_TOKENS', 1024);
    const maxTokens =
      isReasoningModel || isGPT5Model ? undefined : (config.max_tokens ?? maxTokensDefault);

    return { maxCompletionTokens, maxTokens };
  }

  private getTemperature(config: OpenAiCompletionOptions): number | undefined {
    const temperatureDefault = config.omitDefaults
      ? getEnvString('OPENAI_TEMPERATURE') === undefined
        ? undefined
        : getEnvFloat('OPENAI_TEMPERATURE')
      : getEnvFloat('OPENAI_TEMPERATURE', 0);

    return this.supportsTemperature() ? (config.temperature ?? temperatureDefault) : undefined;
  }

  private async getRequestTools(
    config: OpenAiCompletionOptions,
    vars: CallApiContextParams['vars'] | undefined,
  ) {
    const mcpTools = this.mcpClient ? transformMCPToolsToOpenAi(this.mcpClient.getAllTools()) : [];
    const loadedTools = config.tools
      ? (await maybeLoadToolsFromExternalFile(config.tools, vars)) || []
      : [];
    return [...mcpTools, ...(transformTools(loadedTools, 'openai') as typeof loadedTools)];
  }

  private createRequestBody({
    allTools,
    callApiOptions,
    config,
    context,
    isGPT5Model,
    isReasoningModel,
    maxCompletionTokens,
    maxTokens,
    messages,
    reasoningEffort,
    temperature,
  }: {
    allTools: Awaited<ReturnType<OpenAiChatCompletionProvider['getRequestTools']>>;
    callApiOptions?: CallApiOptionsParams;
    config: OpenAiCompletionOptions;
    context?: CallApiContextParams;
    isGPT5Model: boolean;
    isReasoningModel: boolean;
    maxCompletionTokens: number | undefined;
    maxTokens: number | undefined;
    messages: ReturnType<typeof parseChatPrompt>;
    reasoningEffort: ReasoningEffort | undefined;
    temperature: number | undefined;
  }) {
    const body: Record<string, any> = {
      model: this.modelName,
      messages,
      seed: config.seed,
      ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      ...(maxCompletionTokens === undefined ? {} : { max_completion_tokens: maxCompletionTokens }),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(temperature === undefined ? {} : { temperature }),
    };

    this.applySamplingOptions(body, config);
    this.applyToolOptions(body, config, context?.vars, allTools);
    this.applyResponseOptions(body, config, context?.vars, callApiOptions, isGPT5Model);
    Object.assign(body, config.passthrough || {});
    this.applyAdvancedOptions(body, config, isReasoningModel, isGPT5Model);
    return body;
  }

  private applySamplingOptions(body: Record<string, any>, config: OpenAiCompletionOptions) {
    if (config.top_p !== undefined || getEnvString('OPENAI_TOP_P')) {
      body.top_p = config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1);
    }
    if (config.presence_penalty !== undefined || getEnvString('OPENAI_PRESENCE_PENALTY')) {
      body.presence_penalty = config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0);
    }
    if (config.frequency_penalty !== undefined || getEnvString('OPENAI_FREQUENCY_PENALTY')) {
      body.frequency_penalty =
        config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0);
    }
    if (config.stop) {
      body.stop = config.stop;
    }
  }

  private applyToolOptions(
    body: Record<string, any>,
    config: OpenAiCompletionOptions,
    vars: CallApiContextParams['vars'] | undefined,
    allTools: Awaited<ReturnType<OpenAiChatCompletionProvider['getRequestTools']>>,
  ) {
    if (config.functions) {
      body.functions = maybeLoadFromExternalFileWithVars(config.functions, vars);
    }
    if (config.function_call) {
      body.function_call = config.function_call;
    }
    if (allTools.length > 0) {
      body.tools = allTools;
    }
    if (config.tool_choice) {
      body.tool_choice = transformToolChoice(config.tool_choice, 'openai');
    }
    if (config.tool_resources) {
      body.tool_resources = config.tool_resources;
    }
  }

  private applyResponseOptions(
    body: Record<string, any>,
    config: OpenAiCompletionOptions,
    vars: CallApiContextParams['vars'] | undefined,
    callApiOptions: CallApiOptionsParams | undefined,
    isGPT5Model: boolean,
  ) {
    if (config.response_format) {
      body.response_format = maybeLoadResponseFormatFromExternalFile(config.response_format, vars);
    }
    if (callApiOptions?.includeLogProbs) {
      body.logprobs = callApiOptions.includeLogProbs;
    }
    if (config.prompt_cache_key !== undefined) {
      body.prompt_cache_key = config.prompt_cache_key;
    }
    if (config.prompt_cache_retention !== undefined) {
      body.prompt_cache_retention = config.prompt_cache_retention;
    }
    if (this.modelName.includes('audio')) {
      body.modalities = config.modalities || ['text', 'audio'];
      body.audio = config.audio || { voice: 'alloy', format: 'wav' };
    }
    if (isGPT5Model && config.verbosity) {
      body.verbosity = config.verbosity;
    }
  }

  private applyAdvancedOptions(
    body: Record<string, any>,
    config: OpenAiCompletionOptions,
    isReasoningModel: boolean,
    isGPT5Model: boolean,
  ) {
    if (config.reasoning_effort && (isReasoningModel || this.modelName.includes('gpt-oss'))) {
      body.reasoning_effort = config.reasoning_effort;
    }
    if (config.reasoning && isOpenAiOSeriesReasoningModel(this.modelName)) {
      body.reasoning = config.reasoning;
    }
    if (config.service_tier) {
      body.service_tier = config.service_tier;
    }
    if (config.user) {
      body.user = config.user;
    }
    if (config.metadata) {
      body.metadata = config.metadata;
    }
    if (config.store !== undefined) {
      body.store = config.store;
    }
    if ((isReasoningModel || isGPT5Model) && 'max_tokens' in body) {
      delete body.max_tokens;
    }
  }

  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const isReasoningModel = this.isReasoningModel();
    const isGPT5Model = this.isGPT5Model();
    const { maxCompletionTokens, maxTokens } = this.getRequestLimits(
      config,
      isReasoningModel,
      isGPT5Model,
    );
    const temperature = this.getTemperature(config);
    const reasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;
    const allTools = await this.getRequestTools(config, context?.vars);
    const body = this.createRequestBody({
      allTools,
      callApiOptions,
      config,
      context,
      isGPT5Model,
      isReasoningModel,
      maxCompletionTokens,
      maxTokens,
      messages,
      reasoningEffort,
      temperature,
    });

    return { body, config };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'openai',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      // Optional request parameters
      maxTokens: this.config.max_tokens,
      temperature: this.config.temperature,
      topP: this.config.top_p,
      stopSequences: this.config.stop,
      // Promptfoo context from test case if available
      evalId: context?.evaluationId || context?.test?.metadata?.evaluationId,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
      // Request body for debugging/observability
      requestBody: prompt,
    };

    // Result extractor to set response attributes on the span
    const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
      const result: GenAISpanResult = {};

      if (response.tokenUsage) {
        result.tokenUsage = {
          prompt: response.tokenUsage.prompt,
          completion: response.tokenUsage.completion,
          total: response.tokenUsage.total,
          cached: response.tokenUsage.cached,
          completionDetails: {
            reasoning: response.tokenUsage.completionDetails?.reasoning,
            acceptedPrediction: response.tokenUsage.completionDetails?.acceptedPrediction,
            rejectedPrediction: response.tokenUsage.completionDetails?.rejectedPrediction,
          },
        };
      }

      // Extract finish reason if available
      if (response.finishReason) {
        result.finishReasons = [response.finishReason];
      }

      // Cache hit status
      if (response.cached !== undefined) {
        result.cacheHit = response.cached;
      }

      // Response body for debugging/observability
      if (response.output !== undefined) {
        result.responseBody =
          typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
      }

      return result;
    };

    // Wrap the API call in a span
    return withGenAISpan(
      spanContext,
      () => this.callApiInternal(prompt, context, callApiOptions),
      resultExtractor,
    );
  }

  private getRefusalResponse({
    cached,
    data,
    finishReason,
    headers,
    latencyMs,
    message,
    status,
    statusText,
  }: {
    cached: boolean;
    data: OpenAIChatCompletionResponse;
    finishReason?: string;
    headers?: Record<string, string>;
    latencyMs?: number;
    message: OpenAIChatCompletionResponse['choices'][number]['message'];
    status: number;
    statusText: string;
  }): ProviderResponse {
    return {
      output: message.refusal,
      tokenUsage: getTokenUsage(data, cached),
      cached,
      latencyMs,
      isRefusal: true,
      ...(finishReason && { finishReason }),
      guardrails: { flagged: true },
      metadata: getOpenAiHttpMetadata({ headers, status, statusText }),
    };
  }

  private getContentFilterResponse({
    cached,
    data,
    headers,
    latencyMs,
    message,
    status,
    statusText,
  }: {
    cached: boolean;
    data: OpenAIChatCompletionResponse;
    headers?: Record<string, string>;
    latencyMs?: number;
    message: OpenAIChatCompletionResponse['choices'][number]['message'];
    status: number;
    statusText: string;
  }): ProviderResponse {
    return {
      output: message.content || 'Content filtered by provider',
      tokenUsage: getTokenUsage(data, cached),
      cached,
      latencyMs,
      isRefusal: true,
      finishReason: FINISH_REASON_MAP.content_filter,
      guardrails: { flagged: true },
      metadata: getOpenAiHttpMetadata({ headers, status, statusText }),
    };
  }

  private getMessageOutput(
    message: OpenAIChatCompletionResponse['choices'][number]['message'],
    config: OpenAiCompletionOptions,
  ): any {
    let output: any = '';
    if (message.reasoning) {
      output = message.content;
    } else if (message.content && (message.function_call || message.tool_calls)) {
      output =
        Array.isArray(message.tool_calls) && message.tool_calls.length === 0
          ? message.content
          : message;
    } else if (
      message.content === null ||
      message.content === undefined ||
      (message.content === '' && message.tool_calls)
    ) {
      output = message.function_call || message.tool_calls;
    } else {
      output = message.content;
    }

    if (config.response_format?.type === 'json_schema' && typeof output === 'string') {
      try {
        output = JSON.parse(output);
      } catch (error) {
        logger.error(`Failed to parse JSON output: ${error}`);
      }
    }

    if (message.reasoning && (this.config.showThinking ?? true)) {
      output = `Thinking: ${message.reasoning}\n\n${output}`;
    }
    if (
      message.reasoning_content &&
      typeof message.reasoning_content === 'string' &&
      typeof output === 'string' &&
      (this.config.showThinking ?? true)
    ) {
      output = `Thinking: ${message.reasoning_content}\n\n${output}`;
    }

    return output;
  }

  private async getMcpCallbackOutput(
    functionCall: any,
    functionName: string,
  ): Promise<string | undefined> {
    if (!this.mcpClient) {
      return undefined;
    }

    const mcpTool = this.mcpClient.getAllTools().find((tool) => tool.name === functionName);
    if (!mcpTool) {
      return undefined;
    }

    try {
      const args = functionCall.arguments || functionCall.function?.arguments || '{}';
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      const mcpResult = await this.mcpClient.callTool(functionName, parsedArgs);
      return mcpResult?.error
        ? `MCP Tool Error (${functionName}): ${mcpResult.error}`
        : `MCP Tool Result (${functionName}): ${normalizeMcpContent(mcpResult?.content)}`;
    } catch (error) {
      logger.debug(`MCP tool execution failed for ${functionName}: ${error}`);
      return `MCP Tool Error (${functionName}): ${error}`;
    }
  }

  private async getCallbackOutput(
    message: OpenAIChatCompletionResponse['choices'][number]['message'],
    config: OpenAiCompletionOptions,
  ): Promise<ChatCallbackResult> {
    const functionCalls: any = message.function_call ? [message.function_call] : message.tool_calls;
    if (!functionCalls || (!config.functionToolCallbacks && !this.mcpClient)) {
      return {};
    }

    const results: string[] = [];
    for (const functionCall of functionCalls) {
      const functionName = functionCall.name || functionCall.function?.name;
      const mcpOutput = await this.getMcpCallbackOutput(functionCall, functionName);
      if (mcpOutput) {
        results.push(mcpOutput);
        continue;
      }

      if (!config.functionToolCallbacks?.[functionName]) {
        continue;
      }

      const callbackResult = await this.functionCallbackHandler.processCall(
        functionCall,
        config.functionToolCallbacks,
      );
      if (callbackResult.isError) {
        logger.debug(
          `Function callback failed for ${functionName}, falling back to original output`,
        );
        return {};
      }
      results.push(callbackResult.output);
    }

    return results.length > 0 ? { output: results.join('\n') } : {};
  }

  private getSuccessResponseFields({
    cached,
    config,
    contentFiltered,
    data,
    finishReason,
    headers,
    latencyMs,
    logProbs,
    status,
    statusText,
  }: {
    cached: boolean;
    config: OpenAiCompletionOptions;
    contentFiltered: boolean;
    data: OpenAIChatCompletionResponse;
    finishReason?: string;
    headers?: Record<string, string>;
    latencyMs?: number;
    logProbs?: number[];
    status: number;
    statusText: string;
  }) {
    return {
      tokenUsage: getTokenUsage(data, cached),
      cached,
      latencyMs,
      logProbs,
      ...(finishReason && { finishReason }),
      cost: calculateOpenAIUsageCost(this.getBillingModelName(config), config, data.usage, {
        cachedResponse: cached,
        serviceTier: data.service_tier ?? config.service_tier,
      }),
      guardrails: { flagged: contentFiltered },
      metadata: getOpenAiHttpMetadata({ headers, status, statusText }),
    };
  }

  private getSuccessResponse({
    output,
    ...responseOptions
  }: Parameters<OpenAiChatCompletionProvider['getSuccessResponseFields']>[0] & {
    output: any;
  }): ProviderResponse {
    return {
      output,
      ...this.getSuccessResponseFields(responseOptions),
    };
  }

  private getAudioResponse({
    cached,
    config,
    contentFiltered,
    data,
    finishReason,
    headers,
    latencyMs,
    logProbs,
    message,
    status,
    statusText,
  }: {
    cached: boolean;
    config: OpenAiCompletionOptions;
    contentFiltered: boolean;
    data: OpenAIChatCompletionResponse;
    finishReason?: string;
    headers?: Record<string, string>;
    latencyMs?: number;
    logProbs?: number[];
    message: OpenAIChatCompletionResponse['choices'][number]['message'];
    status: number;
    statusText: string;
  }): ProviderResponse {
    return {
      output: message.audio?.transcript || '',
      audio: {
        id: message.audio!.id,
        expiresAt: message.audio!.expires_at,
        data: message.audio!.data,
        transcript: message.audio!.transcript,
        format: message.audio!.format || 'wav',
      },
      ...this.getSuccessResponseFields({
        cached,
        config,
        contentFiltered,
        data,
        finishReason,
        headers,
        latencyMs,
        logProbs,
        status,
        statusText,
      }),
    };
  }

  /**
   * Internal implementation of callApi without tracing wrapper.
   * This is called by callApi after setting up the tracing span.
   */
  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);

    const request = await callJsonCachedOpenAi(
      {
        apiKey: this.getApiKey(),
        allowMissingApiKey: !this.requiresApiKey(),
        organization: this.getOrganization(),
        baseURL: this.getApiUrl(),
        headers: config.headers,
        bustCache: context?.bustCache ?? context?.debug,
        maxRetries: this.config.maxRetries,
      },
      (client) =>
        client.chat.completions.create(
          body as OpenAI.ChatCompletionCreateParamsNonStreaming,
        ) as Promise<OpenAIChatCompletionResponse>,
    );
    const { requestMetadata } = request;
    const cached = requestMetadata.cached;
    const latencyMs = requestMetadata.latencyMs;
    const deleteFromCache = requestMetadata.deleteFromCache;
    const responseHeaders = requestMetadata.headers;

    if (!request.ok) {
      const errorData = requestMetadata.data;
      const statusFromError = requestMetadata.status;
      const statusTextFromError = requestMetadata.statusText ?? 'Error';

      if (statusFromError && statusFromError >= 400) {
        return getChatApiErrorResponse({
          cached,
          data: errorData,
          headers: requestMetadata.headers,
          latencyMs,
          status: statusFromError,
          statusText: statusTextFromError,
        });
      }

      return getChatTransportErrorResponse({
        deleteFromCache,
        error: request.error,
        responseHeaders,
      });
    }
    const { data } = request;
    const status = requestMetadata.status ?? 200;
    const statusText = requestMetadata.statusText ?? 'OK';

    if (status < 200 || status >= 300) {
      return getChatApiErrorResponse({
        cached,
        data,
        headers: responseHeaders,
        latencyMs,
        status,
        statusText,
      });
    }

    try {
      const message = data.choices[0].message;
      const finishReason = normalizeFinishReason(data.choices[0].finish_reason);
      const contentFiltered = finishReason === FINISH_REASON_MAP.content_filter;

      if (message.refusal) {
        return this.getRefusalResponse({
          cached,
          data,
          finishReason,
          headers: responseHeaders,
          latencyMs,
          message,
          status,
          statusText,
        });
      }
      if (contentFiltered) {
        return this.getContentFilterResponse({
          cached,
          data,
          headers: responseHeaders,
          latencyMs,
          message,
          status,
          statusText,
        });
      }

      const logProbs = data.choices[0].logprobs?.content?.map(
        (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
      );
      const callbackResult = await this.getCallbackOutput(message, config);
      if (callbackResult.output !== undefined) {
        return this.getSuccessResponse({
          cached,
          config,
          contentFiltered,
          data,
          finishReason,
          headers: responseHeaders,
          latencyMs,
          logProbs,
          output: callbackResult.output,
          status,
          statusText,
        });
      }

      if (message.audio) {
        return this.getAudioResponse({
          cached,
          config,
          contentFiltered,
          data,
          finishReason,
          headers: responseHeaders,
          latencyMs,
          logProbs,
          message,
          status,
          statusText,
        });
      }

      const response = this.getSuccessResponse({
        cached,
        config,
        contentFiltered,
        data,
        finishReason,
        headers: responseHeaders,
        latencyMs,
        logProbs,
        output: this.getMessageOutput(message, config),
        status,
        statusText,
      });

      return data.choices.length > 1
        ? {
            ...response,
            metadata: {
              ...response.metadata,
              choices: data.choices,
            },
          }
        : response;
    } catch (err) {
      await deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
        metadata: getOpenAiHttpMetadata({ headers: responseHeaders, status, statusText }),
      };
    }
  }
}
