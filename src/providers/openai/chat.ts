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
import {
  parseChatPrompt,
  REQUEST_TIMEOUT_MS,
  transformToolChoice,
  transformTools,
} from '../shared';
import { OpenAiGenericProvider } from './';
import { calculateOpenAICost, getTokenUsage, OPENAI_CHAT_MODELS } from './util';
import type OpenAI from 'openai';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';

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
    this.config = options.config || {};

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

  private supportsReasoningParam(): boolean {
    return (
      this.modelName.startsWith('o1') ||
      this.modelName.startsWith('o3') ||
      this.modelName.startsWith('o4') ||
      this.modelName.includes('/o1') ||
      this.modelName.includes('/o3') ||
      this.modelName.includes('/o4')
    );
  }

  private buildOptionalBodyParams(
    config: OpenAiCompletionOptions,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    return {
      ...(config.top_p !== undefined || getEnvString('OPENAI_TOP_P')
        ? { top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1) }
        : {}),
      ...(config.presence_penalty !== undefined || getEnvString('OPENAI_PRESENCE_PENALTY')
        ? {
            presence_penalty: config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
          }
        : {}),
      ...(config.frequency_penalty !== undefined || getEnvString('OPENAI_FREQUENCY_PENALTY')
        ? {
            frequency_penalty:
              config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
          }
        : {}),
      ...(config.functions
        ? {
            functions: maybeLoadFromExternalFileWithVars(config.functions, context?.vars),
          }
        : {}),
      ...(config.function_call ? { function_call: config.function_call } : {}),
      ...(config.tool_choice
        ? { tool_choice: transformToolChoice(config.tool_choice, 'openai') }
        : {}),
      ...(config.tool_resources ? { tool_resources: config.tool_resources } : {}),
      ...(config.response_format
        ? {
            response_format: maybeLoadResponseFormatFromExternalFile(
              config.response_format,
              context?.vars,
            ),
          }
        : {}),
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(config.stop ? { stop: config.stop } : {}),
      ...(config.passthrough || {}),
    };
  }

  private applyReasoningParams(
    body: Record<string, any>,
    config: OpenAiCompletionOptions,
    isReasoningModel: boolean,
  ) {
    if (config.reasoning_effort && (isReasoningModel || this.modelName.includes('gpt-oss'))) {
      body.reasoning_effort = config.reasoning_effort;
    }

    if (config.reasoning && this.supportsReasoningParam()) {
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
    const maxCompletionTokens = isReasoningModel
      ? (config.max_completion_tokens ?? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS'))
      : undefined;
    const maxTokens =
      isReasoningModel || isGPT5Model
        ? undefined
        : (config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024));

    const temperature = this.supportsTemperature()
      ? (config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0))
      : undefined;
    const reasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;

    // --- MCP tool injection logic ---
    const mcpTools = this.mcpClient ? transformMCPToolsToOpenAi(this.mcpClient.getAllTools()) : [];
    const loadedTools = config.tools
      ? (await maybeLoadToolsFromExternalFile(config.tools, context?.vars)) || []
      : [];
    // Transform tools to OpenAI format if needed
    const fileTools = transformTools(loadedTools, 'openai') as typeof loadedTools;
    const allTools = [...mcpTools, ...fileTools];
    // --- End MCP tool injection logic ---

    const optionalParams = this.buildOptionalBodyParams(config, context, callApiOptions);

    const body = {
      model: this.modelName,
      messages,
      seed: config.seed,
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      ...(maxCompletionTokens !== undefined ? { max_completion_tokens: maxCompletionTokens } : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...optionalParams,
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      ...(this.modelName.includes('audio')
        ? {
            modalities: config.modalities || ['text', 'audio'],
            audio: config.audio || { voice: 'alloy', format: 'wav' },
          }
        : {}),
      // GPT-5 only: attach verbosity if provided
      ...(isGPT5Model && config.verbosity ? { verbosity: config.verbosity } : {}),
    };

    this.applyReasoningParams(body, config, isReasoningModel);

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
      throw new Error(
        `API key is not set. Set the ${this.config.apiKeyEnvar || 'OPENAI_API_KEY'} environment variable or add \`apiKey\` to the provider config.`,
      );
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

  /**
   * Normalize MCP content to a readable string.
   */
  private normalizeMcpContent(content: any): string {
    if (content == null) {
      return '';
    }
    if (typeof content === 'string') {
      return content;
    }
    if (!Array.isArray(content)) {
      return JSON.stringify(content);
    }
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object') {
          if ('text' in part && (part as any).text != null) {
            return String((part as any).text);
          }
          if ('json' in part) {
            return JSON.stringify((part as any).json);
          }
          if ('data' in part) {
            return JSON.stringify((part as any).data);
          }
          return JSON.stringify(part);
        }
        return String(part);
      })
      .join('\n');
  }

  /**
   * Attempt to dispatch a single function call via MCP or registered callback.
   * Returns the result and success flag, or null if not handled.
   */
  private async dispatchFunctionCall(
    functionCall: any,
    config: OpenAiCompletionOptions,
  ): Promise<{ result: string; success: boolean } | null> {
    const functionName = functionCall.name || functionCall.function?.name;

    if (this.mcpClient) {
      const mcpTools = this.mcpClient.getAllTools();
      const mcpTool = mcpTools.find((tool) => tool.name === functionName);
      if (mcpTool) {
        try {
          const args = functionCall.arguments || functionCall.function?.arguments || '{}';
          const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
          const mcpResult = await this.mcpClient.callTool(functionName, parsedArgs);
          if (mcpResult?.error) {
            return {
              result: `MCP Tool Error (${functionName}): ${mcpResult.error}`,
              success: true,
            };
          }
          const content = this.normalizeMcpContent(mcpResult?.content);
          return { result: `MCP Tool Result (${functionName}): ${content}`, success: true };
        } catch (error) {
          logger.debug(`MCP tool execution failed for ${functionName}: ${error}`);
          return { result: `MCP Tool Error (${functionName}): ${error}`, success: true };
        }
      }
    }

    if (config.functionToolCallbacks?.[functionName]) {
      try {
        const functionResult = await this.executeFunctionCallback(
          functionName,
          functionCall.arguments || functionCall.function?.arguments,
          config,
        );
        return { result: functionResult, success: true };
      } catch (error) {
        logger.debug(
          `Function callback failed for ${functionName} with error ${error}, falling back to original output`,
        );
        return { result: '', success: false };
      }
    }

    return null;
  }

  /**
   * Process all function/tool calls and return results if any callbacks handled them.
   */
  private async processFunctionCalls(
    functionCalls: any[],
    config: OpenAiCompletionOptions,
  ): Promise<{ results: string[]; hasSuccessfulCallback: boolean }> {
    const results: string[] = [];
    let hasSuccessfulCallback = false;

    for (const functionCall of functionCalls) {
      const dispatched = await this.dispatchFunctionCall(functionCall, config);
      if (dispatched === null) {
        continue;
      }
      if (!dispatched.success) {
        hasSuccessfulCallback = false;
        break;
      }
      results.push(dispatched.result);
      hasSuccessfulCallback = true;
    }

    return { results, hasSuccessfulCallback };
  }

  /**
   * Extract the output value from a chat message, handling tool calls, reasoning, etc.
   */
  private extractMessageOutput(message: any): { output: any; reasoning: string } {
    let reasoning = '';
    let output: any = '';

    if (message.reasoning) {
      reasoning = message.reasoning;
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

    return { output, reasoning };
  }

  /**
   * Build the shared HTTP response metadata block.
   */
  private buildHttpMetadata(
    status: number,
    statusText: string,
    responseHeaders: Record<string, string>,
  ) {
    return {
      http: {
        status,
        statusText,
        headers: responseHeaders,
      },
    };
  }

  /**
   * Handle HTTP error responses from the OpenAI API.
   */
  private handleHttpError(
    status: number,
    statusText: string,
    data: any,
    cached: boolean,
    latencyMs: number | undefined,
    responseHeaders: Record<string, string>,
  ): ProviderResponse {
    const errorMessage = `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`;
    const metadata = this.buildHttpMetadata(status, statusText, responseHeaders);

    if (typeof data === 'object' && data?.error?.code === 'invalid_prompt') {
      return {
        output: errorMessage,
        tokenUsage: data?.usage ? getTokenUsage(data, cached) : undefined,
        latencyMs,
        isRefusal: true,
        guardrails: {
          flagged: true,
          flaggedInput: true, // This error specifically indicates input was rejected
        },
        metadata,
      };
    }

    return { error: errorMessage, metadata };
  }

  /**
   * Process a completed chat response message into a ProviderResponse.
   */
  private async processCompletedResponse(
    data: any,
    config: OpenAiCompletionOptions,
    cached: boolean,
    latencyMs: number | undefined,
    status: number,
    statusText: string,
    responseHeaders: Record<string, string>,
  ): Promise<ProviderResponse> {
    const message = data.choices[0].message;
    const finishReason = normalizeFinishReason(data.choices[0].finish_reason);
    const contentFiltered = finishReason === FINISH_REASON_MAP.content_filter;
    const metadata = this.buildHttpMetadata(status, statusText, responseHeaders);
    const costArgs = [
      this.modelName,
      config,
      data.usage?.prompt_tokens,
      data.usage?.completion_tokens,
      data.usage?.audio_prompt_tokens,
      data.usage?.audio_completion_tokens,
    ] as const;

    if (message.refusal) {
      return {
        output: message.refusal,
        tokenUsage: getTokenUsage(data, cached),
        cached,
        latencyMs,
        isRefusal: true,
        ...(finishReason && { finishReason }),
        guardrails: { flagged: true }, // Refusal is ALWAYS a guardrail violation
        metadata,
      };
    }

    if (contentFiltered) {
      return {
        output: message.content || 'Content filtered by provider',
        tokenUsage: getTokenUsage(data, cached),
        cached,
        latencyMs,
        isRefusal: true,
        finishReason: FINISH_REASON_MAP.content_filter,
        guardrails: { flagged: true },
        metadata,
      };
    }

    let { output, reasoning } = this.extractMessageOutput(message);

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

    // Handle function tool callbacks
    const functionCalls: any[] = message.function_call
      ? [message.function_call]
      : (message.tool_calls ?? []);

    if (functionCalls.length > 0 && (config.functionToolCallbacks || this.mcpClient)) {
      const { results, hasSuccessfulCallback } = await this.processFunctionCalls(
        functionCalls,
        config,
      );
      if (hasSuccessfulCallback && results.length > 0) {
        return {
          output: results.join('\n'),
          tokenUsage: getTokenUsage(data, cached),
          cached,
          latencyMs,
          logProbs,
          ...(finishReason && { finishReason }),
          cost: calculateOpenAICost(...costArgs),
          guardrails: { flagged: contentFiltered },
          metadata,
        };
      }
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
      return {
        output: message.audio.transcript || '',
        audio: {
          id: message.audio.id,
          expiresAt: message.audio.expires_at,
          data: message.audio.data,
          transcript: message.audio.transcript,
          format: message.audio.format || 'wav',
        },
        tokenUsage: getTokenUsage(data, cached),
        cached,
        latencyMs,
        logProbs,
        ...(finishReason && { finishReason }),
        cost: calculateOpenAICost(...costArgs),
        guardrails: { flagged: contentFiltered },
        metadata,
      };
    }

    return {
      output,
      tokenUsage: getTokenUsage(data, cached),
      cached,
      latencyMs,
      logProbs,
      ...(finishReason && { finishReason }),
      cost: calculateOpenAICost(...costArgs),
      guardrails: { flagged: contentFiltered },
      metadata,
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
        REQUEST_TIMEOUT_MS,
        'json',
        context?.bustCache ?? context?.debug,
        this.config.maxRetries,
      ));

      if (status < 200 || status >= 300) {
        return this.handleHttpError(
          status,
          statusText,
          data,
          cached,
          latencyMs,
          responseHeaders ?? {},
        );
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

    try {
      return await this.processCompletedResponse(
        data,
        config,
        cached,
        latencyMs,
        status,
        statusText,
        responseHeaders ?? {},
      );
    } catch (err) {
      await deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
        metadata: {
          http: {
            status,
            statusText,
            headers: responseHeaders ?? {},
          },
        },
      };
    }
  }
}
