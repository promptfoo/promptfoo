import path from 'path';

import { fetchWithCache } from '../../cache';
import cliState from '../../cliState';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { formatRateLimitErrorMessage, HttpRateLimitError } from '../../util/fetch/errors';
import { isJavascriptFile } from '../../util/fileExtensions';
import { FINISH_REASON_MAP, normalizeFinishReason } from '../../util/finishReason';
import {
  maybeLoadFromExternalFileWithVars,
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../util/index';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToOpenAi } from '../mcp/transform';
import { formatMcpToolError, formatMcpToolResult } from '../mcp/util';
import {
  getRequestTimeoutMs,
  parseChatPrompt,
  transformToolChoice,
  transformTools,
} from '../shared';
import { OpenAiGenericProvider } from './';
import { calculateOpenAIUsageCost } from './billing';
import { getTokenUsage, OPENAI_CHAT_MODELS } from './util';
import type OpenAI from 'openai';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  VarValue,
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

type OpenAIChatMessage = OpenAIChatCompletionResponse['choices'][number]['message'];

export class OpenAiChatCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_CHAT_MODELS = OPENAI_CHAT_MODELS;

  static OPENAI_CHAT_MODEL_NAMES = OPENAI_CHAT_MODELS.map((model) => model.id);

  config: OpenAiCompletionOptions;
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private loadedFunctionCallbacks: Record<string, Function> = {};

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

  /**
   * Loads a function from an external file
   * @param fileRef The file reference in the format 'file://path/to/file:functionName'
   * @returns The loaded function
   */
  private async loadExternalFunction(fileRef: string): Promise<Function> {
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

    if (filePath.includes(':')) {
      const splits = filePath.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filePath, functionName] = splits;
      }
    }

    try {
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      logger.debug(
        `Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
      );

      const requiredModule = await importModule(resolvedPath, functionName);

      if (typeof requiredModule === 'function') {
        return requiredModule;
      } else if (
        requiredModule &&
        typeof requiredModule === 'object' &&
        functionName &&
        functionName in requiredModule
      ) {
        const fn = requiredModule[functionName];
        if (typeof fn === 'function') {
          return fn;
        }
      }

      throw new Error(
        `Function callback malformed: ${filePath} must export ${
          functionName
            ? `a named function '${functionName}'`
            : 'a function or have a default export as a function'
        }`,
      );
    } catch (error: any) {
      throw new Error(`Error loading function from ${filePath}: ${error.message || String(error)}`);
    }
  }

  /**
   * Executes a function callback with proper error handling
   */
  private async executeFunctionCallback(
    functionName: string,
    args: string,
    config: OpenAiCompletionOptions,
  ): Promise<string> {
    try {
      // Check if we've already loaded this function
      let callback = this.loadedFunctionCallbacks[functionName];

      // If not loaded yet, try to load it now
      if (!callback) {
        const callbackRef = config.functionToolCallbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          // Cache for future use
          this.loadedFunctionCallbacks[functionName] = callback;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedFunctionCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute the callback
      logger.debug(`Executing function '${functionName}' with args: ${args}`);
      const result = await callback(args);

      // Format the result
      if (result === undefined || result === null) {
        return '';
      } else if (typeof result === 'object') {
        try {
          return JSON.stringify(result);
        } catch (error) {
          logger.warn(`Error stringifying result from function '${functionName}': ${error}`);
          return String(result);
        }
      } else {
        return String(result);
      }
    } catch (error: any) {
      logger.error(`Error executing function '${functionName}': ${error.message || String(error)}`);
      throw error; // Re-throw so caller can handle fallback behavior
    }
  }

  private async tryExecuteMcpToolCall(
    functionName: string,
    functionCall: any,
  ): Promise<{ handled: boolean; output?: string }> {
    if (!this.mcpClient) {
      return { handled: false };
    }

    const mcpTool = this.mcpClient.getAllTools().find((tool) => tool.name === functionName);
    if (!mcpTool) {
      return { handled: false };
    }

    try {
      const args = functionCall.arguments || functionCall.function?.arguments || '{}';
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      const mcpResult = await this.mcpClient.callTool(functionName, parsedArgs);
      if (mcpResult?.error) {
        return { handled: true, output: formatMcpToolError(functionName, mcpResult.error) };
      }
      return { handled: true, output: formatMcpToolResult(functionName, mcpResult?.content) };
    } catch (error) {
      logger.debug(`MCP tool execution failed for ${functionName}: ${error}`);
      return { handled: true, output: formatMcpToolError(functionName, String(error)) };
    }
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

  private resolveTokenLimits(
    config: OpenAiCompletionOptions,
    isReasoningModel: boolean,
    isGPT5Model: boolean,
  ): { maxCompletionTokens: number | undefined; maxTokens: number | undefined } {
    const maxCompletionTokens = isReasoningModel
      ? (config.max_completion_tokens ?? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS'))
      : undefined;
    const maxTokensDefault = config.omitDefaults
      ? getEnvString('OPENAI_MAX_TOKENS') === undefined
        ? undefined
        : getEnvInt('OPENAI_MAX_TOKENS')
      : getEnvInt('OPENAI_MAX_TOKENS', 1024);
    return {
      maxCompletionTokens,
      maxTokens:
        isReasoningModel || isGPT5Model ? undefined : (config.max_tokens ?? maxTokensDefault),
    };
  }

  private resolveTemperature(config: OpenAiCompletionOptions): number | undefined {
    const temperatureDefault = config.omitDefaults
      ? getEnvString('OPENAI_TEMPERATURE') === undefined
        ? undefined
        : getEnvFloat('OPENAI_TEMPERATURE')
      : getEnvFloat('OPENAI_TEMPERATURE', 0);
    return this.supportsTemperature() ? (config.temperature ?? temperatureDefault) : undefined;
  }

  private async resolveOpenAiTools(
    config: OpenAiCompletionOptions,
    vars?: Record<string, VarValue>,
  ) {
    const mcpTools = this.mcpClient ? transformMCPToolsToOpenAi(this.mcpClient.getAllTools()) : [];
    const loadedTools = config.tools
      ? (await maybeLoadToolsFromExternalFile(config.tools, vars)) || []
      : [];
    const fileTools = transformTools(loadedTools, 'openai') as typeof loadedTools;
    return [...mcpTools, ...fileTools];
  }

  private buildOpenAiRequestBody({
    messages,
    config,
    callApiOptions,
    vars,
    isReasoningModel,
    isGPT5Model,
    maxCompletionTokens,
    maxTokens,
    temperature,
    reasoningEffort,
    allTools,
  }: {
    messages: unknown;
    config: OpenAiCompletionOptions;
    callApiOptions?: CallApiOptionsParams;
    vars?: Record<string, VarValue>;
    isReasoningModel: boolean;
    isGPT5Model: boolean;
    maxCompletionTokens?: number;
    maxTokens?: number;
    temperature?: number;
    reasoningEffort?: ReasoningEffort;
    allTools: unknown[];
  }): Record<string, any> {
    const body: Record<string, any> = {
      model: this.modelName,
      messages,
      seed: config.seed,
    };

    if (maxTokens !== undefined) {
      body.max_tokens = maxTokens;
    }
    if (maxCompletionTokens !== undefined) {
      body.max_completion_tokens = maxCompletionTokens;
    }
    if (temperature !== undefined) {
      body.temperature = temperature;
    }
    this.applySamplingParameters(body, config);
    this.applyToolingParameters(body, config, vars, callApiOptions, allTools);
    Object.assign(body, config.passthrough || {});
    this.applyModelSpecificParameters(body, config, isReasoningModel, isGPT5Model, reasoningEffort);
    this.applyOptionalMetadata(body, config);

    if ((isReasoningModel || isGPT5Model) && 'max_tokens' in body) {
      delete body.max_tokens;
    }

    return body;
  }

  private applySamplingParameters(
    body: Record<string, any>,
    config: OpenAiCompletionOptions,
  ): void {
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
  }

  private applyToolingParameters(
    body: Record<string, any>,
    config: OpenAiCompletionOptions,
    vars: Record<string, VarValue> | undefined,
    callApiOptions: CallApiOptionsParams | undefined,
    allTools: unknown[],
  ): void {
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
    if (config.response_format) {
      body.response_format = maybeLoadResponseFormatFromExternalFile(config.response_format, vars);
    }
    if (callApiOptions?.includeLogProbs) {
      body.logprobs = callApiOptions.includeLogProbs;
    }
    if (config.stop) {
      body.stop = config.stop;
    }
    if (config.prompt_cache_key !== undefined) {
      body.prompt_cache_key = config.prompt_cache_key;
    }
    if (config.prompt_cache_retention !== undefined) {
      body.prompt_cache_retention = config.prompt_cache_retention;
    }
  }

  private applyModelSpecificParameters(
    body: Record<string, any>,
    config: OpenAiCompletionOptions,
    isReasoningModel: boolean,
    isGPT5Model: boolean,
    reasoningEffort: ReasoningEffort | undefined,
  ): void {
    if (reasoningEffort) {
      body.reasoning_effort = reasoningEffort;
    }
    if (this.modelName.includes('audio')) {
      body.modalities = config.modalities || ['text', 'audio'];
      body.audio = config.audio || { voice: 'alloy', format: 'wav' };
    }
    if (isGPT5Model && config.verbosity) {
      body.verbosity = config.verbosity;
    }
    if (config.reasoning_effort && (isReasoningModel || this.modelName.includes('gpt-oss'))) {
      body.reasoning_effort = config.reasoning_effort;
    }
    if (
      config.reasoning &&
      (this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4') ||
        this.modelName.includes('/o1') ||
        this.modelName.includes('/o3') ||
        this.modelName.includes('/o4'))
    ) {
      body.reasoning = config.reasoning;
    }
  }

  private applyOptionalMetadata(body: Record<string, any>, config: OpenAiCompletionOptions): void {
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
    const { maxCompletionTokens, maxTokens } = this.resolveTokenLimits(
      config,
      isReasoningModel,
      isGPT5Model,
    );
    const temperature = this.resolveTemperature(config);
    const reasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;
    const allTools = await this.resolveOpenAiTools(config, context?.vars);
    const body = this.buildOpenAiRequestBody({
      messages,
      config,
      callApiOptions,
      vars: context?.vars,
      isReasoningModel,
      isGPT5Model,
      maxCompletionTokens,
      maxTokens,
      temperature,
      reasoningEffort,
      allTools,
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

  private buildHttpMetadata(
    status: number,
    statusText: string,
    headers: Record<string, string> | undefined,
    choices?: OpenAIChatCompletionResponse['choices'],
  ): Record<string, unknown> {
    return {
      http: {
        status,
        statusText,
        headers: headers ?? {},
      },
      ...(choices && choices.length > 1 ? { choices } : {}),
    };
  }

  private buildSuccessfulChatResponse({
    output,
    data,
    config,
    cached,
    latencyMs,
    logProbs,
    finishReason,
    contentFiltered,
    status,
    statusText,
    responseHeaders,
    audio,
  }: {
    output: unknown;
    data: OpenAIChatCompletionResponse;
    config: OpenAiCompletionOptions;
    cached: boolean;
    latencyMs: number | undefined;
    logProbs: number[] | undefined;
    finishReason: string | undefined;
    contentFiltered: boolean;
    status: number;
    statusText: string;
    responseHeaders: Record<string, string> | undefined;
    audio?: ProviderResponse['audio'];
  }): ProviderResponse {
    return {
      output,
      ...(audio ? { audio } : {}),
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
      metadata: this.buildHttpMetadata(status, statusText, responseHeaders, data.choices),
    };
  }

  private resolveChatOutput(message: OpenAIChatMessage): {
    output: any;
    reasoning: string;
  } {
    if (message.reasoning) {
      return { reasoning: message.reasoning, output: message.content };
    }
    if (message.content && (message.function_call || message.tool_calls)) {
      return {
        reasoning: '',
        output:
          Array.isArray(message.tool_calls) && message.tool_calls.length === 0
            ? message.content
            : message,
      };
    }
    if (
      message.content === null ||
      message.content === undefined ||
      (message.content === '' && message.tool_calls)
    ) {
      return { reasoning: '', output: message.function_call || message.tool_calls };
    }
    return { reasoning: '', output: message.content };
  }

  private async maybeHandleFunctionToolCallbacks({
    message,
    config,
    data,
    cached,
    latencyMs,
    logProbs,
    finishReason,
    contentFiltered,
    status,
    statusText,
    responseHeaders,
  }: {
    message: OpenAIChatMessage;
    config: OpenAiCompletionOptions;
    data: OpenAIChatCompletionResponse;
    cached: boolean;
    latencyMs: number | undefined;
    logProbs: number[] | undefined;
    finishReason: string | undefined;
    contentFiltered: boolean;
    status: number;
    statusText: string;
    responseHeaders: Record<string, string> | undefined;
  }): Promise<ProviderResponse | undefined> {
    const functionCalls: any = message.function_call ? [message.function_call] : message.tool_calls;
    if (!functionCalls || (!config.functionToolCallbacks && !this.mcpClient)) {
      return undefined;
    }

    const results: string[] = [];
    let hasSuccessfulCallback = false;
    for (const functionCall of functionCalls) {
      const functionName = functionCall.name || functionCall.function?.name;
      const mcpResult = await this.tryExecuteMcpToolCall(functionName, functionCall);
      if (mcpResult.handled) {
        results.push(mcpResult.output ?? '');
        hasSuccessfulCallback = true;
        continue;
      }

      if (!config.functionToolCallbacks?.[functionName]) {
        continue;
      }
      try {
        const functionResult = await this.executeFunctionCallback(
          functionName,
          functionCall.arguments || functionCall.function?.arguments,
          config,
        );
        results.push(functionResult);
        hasSuccessfulCallback = true;
      } catch (error) {
        logger.debug(
          `Function callback failed for ${functionName} with error ${error}, falling back to original output`,
        );
        return undefined;
      }
    }

    if (!hasSuccessfulCallback || results.length === 0) {
      return undefined;
    }
    return this.buildSuccessfulChatResponse({
      output: results.join('\n'),
      data,
      config,
      cached,
      latencyMs,
      logProbs,
      finishReason,
      contentFiltered,
      status,
      statusText,
      responseHeaders,
    });
  }

  private buildNon2xxResponse(
    data: OpenAIChatCompletionResponse,
    cached: boolean,
    latencyMs: number | undefined,
    status: number,
    statusText: string,
    responseHeaders: Record<string, string> | undefined,
  ): ProviderResponse {
    const errorMessage = `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`;
    if (typeof data === 'object' && data?.error?.code === 'invalid_prompt') {
      return {
        output: errorMessage,
        tokenUsage: data?.usage ? getTokenUsage(data, cached) : undefined,
        latencyMs,
        isRefusal: true,
        guardrails: {
          flagged: true,
          flaggedInput: true,
        },
        metadata: this.buildHttpMetadata(status, statusText, responseHeaders),
      };
    }
    return {
      error: errorMessage,
      metadata: this.buildHttpMetadata(status, statusText, responseHeaders),
    };
  }

  private async buildTransportErrorResponse(
    err: unknown,
    deleteFromCache: (() => Promise<void>) | undefined,
    responseHeaders: Record<string, string> | undefined,
  ): Promise<ProviderResponse> {
    logger.error(`API call error: ${String(err)}`);
    await deleteFromCache?.();
    if (err instanceof HttpRateLimitError) {
      return {
        error: formatRateLimitErrorMessage(err),
        metadata: {
          rateLimitKind: err.kind,
          ...this.buildHttpMetadata(err.status, err.statusText, err.headers ?? responseHeaders),
        },
      };
    }
    return {
      error: `API call error: ${String(err)}`,
      metadata: this.buildHttpMetadata(0, 'Error', responseHeaders),
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

    let data: OpenAIChatCompletionResponse;
    let status: number;
    let statusText: string;
    let cached = false;
    let latencyMs: number | undefined;
    let deleteFromCache: (() => Promise<void>) | undefined;
    let responseHeaders: Record<string, string> | undefined;
    try {
      ({
        data,
        cached,
        status,
        statusText,
        latencyMs,
        deleteFromCache,
        headers: responseHeaders,
      } = await fetchWithCache<OpenAIChatCompletionResponse>(
        `${this.getApiUrl()}/chat/completions`,
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
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug,
        this.config.maxRetries,
      ));

      if (status < 200 || status >= 300) {
        return this.buildNon2xxResponse(
          data,
          cached,
          latencyMs,
          status,
          statusText,
          responseHeaders,
        );
      }
    } catch (err) {
      return this.buildTransportErrorResponse(err, deleteFromCache, responseHeaders);
    }

    try {
      const message = data.choices[0].message;
      const finishReason = normalizeFinishReason(data.choices[0].finish_reason);

      // Track content filtering for guardrails
      const contentFiltered = finishReason === FINISH_REASON_MAP.content_filter;

      if (message.refusal) {
        return {
          output: message.refusal,
          tokenUsage: getTokenUsage(data, cached),
          cached,
          latencyMs,
          isRefusal: true,
          ...(finishReason && { finishReason }),
          guardrails: { flagged: true }, // Refusal is ALWAYS a guardrail violation
          metadata: this.buildHttpMetadata(status, statusText, responseHeaders),
        };
      }

      // Check if content was filtered
      if (contentFiltered) {
        return {
          output: message.content || 'Content filtered by provider',
          tokenUsage: getTokenUsage(data, cached),
          cached,
          latencyMs,
          isRefusal: true,
          finishReason: FINISH_REASON_MAP.content_filter,
          guardrails: {
            flagged: true,
          },
          metadata: this.buildHttpMetadata(status, statusText, responseHeaders),
        };
      }

      let { reasoning, output } = this.resolveChatOutput(message);
      const logProbs = data.choices[0].logprobs?.content?.map(
        (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
      );

      // Handle structured output
      if (config.response_format?.type === 'json_schema' && typeof output === 'string') {
        try {
          output = JSON.parse(output);
        } catch (error) {
          logger.error(`Failed to parse JSON output: ${error}`);
        }
      }
      // Handle reasoning as thinking content if present and showThinking is enabled
      if (reasoning && (this.config.showThinking ?? true)) {
        output = `Thinking: ${reasoning}\n\n${output}`;
      }

      const callbackResponse = await this.maybeHandleFunctionToolCallbacks({
        message,
        config,
        data,
        cached,
        latencyMs,
        logProbs,
        finishReason,
        contentFiltered,
        status,
        statusText,
        responseHeaders,
      });
      if (callbackResponse) {
        return callbackResponse;
      }

      // Handle DeepSeek reasoning model's reasoning_content by prepending it to the output
      if (
        message.reasoning_content &&
        typeof message.reasoning_content === 'string' &&
        typeof output === 'string' &&
        (this.config.showThinking ?? true)
      ) {
        output = `Thinking: ${message.reasoning_content}\n\n${output}`;
      }
      if (message.audio) {
        return this.buildSuccessfulChatResponse({
          output: message.audio.transcript || '',
          audio: {
            id: message.audio.id,
            expiresAt: message.audio.expires_at,
            data: message.audio.data,
            transcript: message.audio.transcript,
            format: message.audio.format || 'wav',
          },
          data,
          config,
          cached,
          latencyMs,
          logProbs,
          finishReason,
          contentFiltered,
          status,
          statusText,
          responseHeaders,
        });
      }

      return this.buildSuccessfulChatResponse({
        output,
        data,
        config,
        cached,
        latencyMs,
        logProbs,
        finishReason,
        contentFiltered,
        status,
        statusText,
        responseHeaders,
      });
    } catch (err) {
      await deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
        metadata: this.buildHttpMetadata(status, statusText, responseHeaders),
      };
    }
  }
}
