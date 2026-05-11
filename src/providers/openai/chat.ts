import path from 'path';

import { fetchWithCache, getCache, isCacheEnabled } from '../../cache';
import cliState from '../../cliState';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { sha256 } from '../../util/createHash';
import { formatRateLimitErrorMessage, HttpRateLimitError } from '../../util/fetch/errors';
import { fetchWithProxy } from '../../util/fetch/index';
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
} from '../../types/index';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';

type OpenAiStreamingUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  audio_prompt_tokens?: number;
  audio_completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    accepted_prediction_tokens?: number;
    rejected_prediction_tokens?: number;
  };
};

type OpenAiStreamingFunctionCall = { name: string; arguments: string };

type OpenAiStreamingToolCall = {
  id: string;
  type: string;
  function: OpenAiStreamingFunctionCall;
};

type OpenAiFunctionCallLike = {
  name?: string;
  arguments?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type OpenAiStreamingState = {
  content: string;
  finishReason: string | null;
  usage?: OpenAiStreamingUsage;
  serviceTier?: string | null;
  functionCall: OpenAiStreamingFunctionCall | null;
  toolCalls: OpenAiStreamingToolCall[];
};

function getStreamingPassthroughOptions(body: Record<string, any>): Record<string, unknown> {
  if (
    typeof body.stream_options !== 'object' ||
    body.stream_options === null ||
    Array.isArray(body.stream_options)
  ) {
    return {};
  }
  return body.stream_options;
}

function getSseData(line: string): string | undefined {
  const trimmedLine = line.trim();
  if (!trimmedLine || trimmedLine.startsWith(':') || !trimmedLine.startsWith('data:')) {
    return undefined;
  }
  return trimmedLine.slice(5).trimStart();
}

function appendFunctionCall(
  state: OpenAiStreamingState,
  functionCallDelta: { name?: string; arguments?: string },
) {
  state.functionCall ??= { name: '', arguments: '' };
  state.functionCall.name += functionCallDelta.name || '';
  state.functionCall.arguments += functionCallDelta.arguments || '';
}

function appendToolCalls(
  state: OpenAiStreamingState,
  toolCallDeltas: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>,
) {
  for (const toolCallDelta of toolCallDeltas) {
    const index = toolCallDelta.index;
    state.toolCalls[index] ??= {
      id: '',
      type: 'function',
      function: { name: '', arguments: '' },
    };
    state.toolCalls[index].id = toolCallDelta.id || state.toolCalls[index].id;
    state.toolCalls[index].function.name += toolCallDelta.function?.name || '';
    state.toolCalls[index].function.arguments += toolCallDelta.function?.arguments || '';
  }
}

function appendStreamingChoice(
  state: OpenAiStreamingState,
  choice?: {
    delta?: {
      content?: string;
      function_call?: { name?: string; arguments?: string };
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  },
) {
  if (!choice) {
    return;
  }
  state.content += choice.delta?.content || '';
  if (choice.delta?.function_call) {
    appendFunctionCall(state, choice.delta.function_call);
  }
  if (choice.delta?.tool_calls) {
    appendToolCalls(state, choice.delta.tool_calls);
  }
  if (choice.finish_reason) {
    state.finishReason = choice.finish_reason;
  }
}

function processOpenAiStreamingChunk(state: OpenAiStreamingState, data: string): boolean {
  if (data === '[DONE]') {
    return true;
  }

  try {
    const chunk = JSON.parse(data) as {
      choices?: Array<Parameters<typeof appendStreamingChoice>[1]>;
      usage?: OpenAiStreamingUsage;
      service_tier?: string | null;
    };
    appendStreamingChoice(state, chunk.choices?.[0]);
    if (chunk.usage) {
      state.usage = chunk.usage;
    }
    if (chunk.service_tier !== undefined) {
      state.serviceTier = chunk.service_tier;
    }
  } catch {
    logger.debug(`Failed to parse SSE chunk: ${data}`);
  }

  return false;
}

function processOpenAiSseLines(state: OpenAiStreamingState, lines: string[]): boolean {
  for (const line of lines) {
    const data = getSseData(line);
    if (data && processOpenAiStreamingChunk(state, data)) {
      return true;
    }
  }
  return false;
}

async function readOpenAiStreamingResponse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<OpenAiStreamingState> {
  const decoder = new TextDecoder();
  const state: OpenAiStreamingState = {
    content: '',
    finishReason: null,
    functionCall: null,
    toolCalls: [],
  };
  let buffer = '';
  let streamDone = false;

  try {
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        processOpenAiSseLines(state, buffer.split(/\r?\n/));
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      streamDone = processOpenAiSseLines(state, lines);
    }
  } finally {
    if (streamDone) {
      await reader.cancel().catch(() => undefined);
    }
  }

  return state;
}

async function getCachedOpenAiStreamingResponse(
  cache: ReturnType<typeof getCache>,
  cacheKey: string,
  modelName: string,
): Promise<ProviderResponse | undefined> {
  const cachedResponse = await cache.get<string | undefined>(cacheKey);
  if (!cachedResponse) {
    return undefined;
  }

  logger.debug(`Returning cached streaming response for ${modelName}`);
  try {
    const parsed = JSON.parse(cachedResponse) as ProviderResponse;
    const totalTokens = parsed.tokenUsage?.total;
    return {
      ...parsed,
      tokenUsage:
        totalTokens === undefined ? parsed.tokenUsage : { total: totalTokens, cached: totalTokens },
      cached: true,
      ...(parsed.cost === undefined ? {} : { cost: 0 }),
    };
  } catch {
    logger.warn('Failed to parse cached streaming response');
    return undefined;
  }
}

function getOpenAiStreamingOutput(state: OpenAiStreamingState): any {
  if (state.functionCall?.name) {
    return state.functionCall;
  }

  const validToolCalls = state.toolCalls.filter((toolCall) => toolCall.function?.name);
  if (validToolCalls.length > 0) {
    return state.content ? { content: state.content, tool_calls: validToolCalls } : validToolCalls;
  }

  return state.content;
}

function parseStructuredStreamingOutput(output: any, config: OpenAiCompletionOptions): any {
  if (config.response_format?.type !== 'json_schema' || typeof output !== 'string') {
    return output;
  }

  try {
    return JSON.parse(output);
  } catch (error) {
    logger.error(`Failed to parse JSON output: ${error}`);
    return output;
  }
}

function getOpenAiStreamingTokenUsage(
  usage?: OpenAiStreamingUsage,
): ProviderResponse['tokenUsage'] {
  if (!usage) {
    return undefined;
  }
  return getTokenUsage({ usage }, false);
}

function buildOpenAiStreamingResponse(
  state: OpenAiStreamingState,
  billingModelName: string,
  config: OpenAiCompletionOptions,
  latencyMs: number,
): ProviderResponse {
  const output = parseStructuredStreamingOutput(getOpenAiStreamingOutput(state), config);
  const normalizedFinishReason = normalizeFinishReason(state.finishReason);
  const contentFiltered = normalizedFinishReason === FINISH_REASON_MAP.content_filter;

  return {
    output,
    tokenUsage: getOpenAiStreamingTokenUsage(state.usage),
    cached: false,
    latencyMs,
    ...(normalizedFinishReason && { finishReason: normalizedFinishReason }),
    cost: calculateOpenAIUsageCost(billingModelName, config, state.usage, {
      cachedResponse: false,
      serviceTier: state.serviceTier ?? config.service_tier,
    }),
    guardrails: { flagged: contentFiltered },
  };
}

async function cacheOpenAiStreamingResponse(
  cache: ReturnType<typeof getCache>,
  cacheKey: string,
  providerResponse: ProviderResponse,
) {
  if (providerResponse.guardrails?.flagged) {
    return;
  }

  try {
    await cache.set(cacheKey, JSON.stringify(providerResponse));
  } catch (err) {
    logger.error(`Failed to cache streaming response: ${String(err)}`);
  }
}

function getOpenAiStreamingCacheKey(
  providerId: string,
  apiUrl: string,
  body: Record<string, any>,
): string {
  return `openai:stream:${sha256(JSON.stringify({ providerId, apiUrl, body }))}`;
}

function getOpenAiStreamingHttpMetadata(response: Response): ProviderResponse['metadata'] {
  return {
    http: {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers ? Object.fromEntries(response.headers.entries()) : {},
    },
  };
}

function normalizeMcpContent(content: any): string {
  if (content == null) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
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
  return JSON.stringify(content);
}

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

  private async resolveFunctionToolCallbacks(
    functionCalls: OpenAiFunctionCallLike[] | undefined,
    config: OpenAiCompletionOptions,
  ): Promise<string | undefined> {
    if (!functionCalls || (!config.functionToolCallbacks && !this.mcpClient)) {
      return undefined;
    }

    const results = [];
    let hasSuccessfulCallback = false;
    for (const functionCall of functionCalls) {
      const functionName = functionCall.name || functionCall.function?.name;
      if (!functionName) {
        continue;
      }

      const mcpResult = await this.resolveMcpToolCallback(functionName, functionCall);
      if (mcpResult !== undefined) {
        results.push(mcpResult);
        hasSuccessfulCallback = true;
        continue;
      }

      if (config.functionToolCallbacks && config.functionToolCallbacks[functionName]) {
        try {
          const functionResult = await this.executeFunctionCallback(
            functionName,
            functionCall.arguments || functionCall.function?.arguments || '{}',
            config,
          );
          results.push(functionResult);
          hasSuccessfulCallback = true;
        } catch (error) {
          logger.debug(
            `Function callback failed for ${functionName} with error ${error}, falling back to original output`,
          );
          hasSuccessfulCallback = false;
          break;
        }
      }
    }

    return hasSuccessfulCallback && results.length > 0 ? results.join('\n') : undefined;
  }

  private async resolveMcpToolCallback(
    functionName: string,
    functionCall: OpenAiFunctionCallLike,
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
      if (mcpResult?.error) {
        return `MCP Tool Error (${functionName}): ${mcpResult.error}`;
      }
      return `MCP Tool Result (${functionName}): ${normalizeMcpContent(mcpResult?.content)}`;
    } catch (error) {
      logger.debug(`MCP tool execution failed for ${functionName}: ${error}`);
      return `MCP Tool Error (${functionName}): ${error}`;
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
    const maxTokensDefault = config.omitDefaults
      ? getEnvString('OPENAI_MAX_TOKENS') === undefined
        ? undefined
        : getEnvInt('OPENAI_MAX_TOKENS')
      : getEnvInt('OPENAI_MAX_TOKENS', 1024);
    const maxTokens =
      isReasoningModel || isGPT5Model ? undefined : (config.max_tokens ?? maxTokensDefault);

    const temperatureDefault = config.omitDefaults
      ? getEnvString('OPENAI_TEMPERATURE') === undefined
        ? undefined
        : getEnvFloat('OPENAI_TEMPERATURE')
      : getEnvFloat('OPENAI_TEMPERATURE', 0);
    const temperature = this.supportsTemperature()
      ? (config.temperature ?? temperatureDefault)
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

    const body = {
      model: this.modelName,
      messages,
      seed: config.seed,
      ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      ...(maxCompletionTokens === undefined ? {} : { max_completion_tokens: maxCompletionTokens }),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(temperature === undefined ? {} : { temperature }),
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
      ...(allTools.length > 0 ? { tools: allTools } : {}),
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
      ...(config.prompt_cache_key === undefined
        ? {}
        : { prompt_cache_key: config.prompt_cache_key }),
      ...(config.prompt_cache_retention === undefined
        ? {}
        : { prompt_cache_retention: config.prompt_cache_retention }),
      ...(config.passthrough || {}),
      ...(this.modelName.includes('audio')
        ? {
            modalities: config.modalities || ['text', 'audio'],
            audio: config.audio || { voice: 'alloy', format: 'wav' },
          }
        : {}),
      // GPT-5 only: attach verbosity if provided
      ...(isGPT5Model && config.verbosity ? { verbosity: config.verbosity } : {}),
    };

    // Handle reasoning_effort and reasoning parameters for reasoning models
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

    // Add other basic parameters
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

    // Sanitize body for models that reject max_tokens (e.g. GPT-5, reasoning models).
    // This catches max_tokens introduced via passthrough or YAML anchors that bypass
    // the normal maxTokens variable logic above.
    if ((isReasoningModel || isGPT5Model) && 'max_tokens' in body) {
      delete body.max_tokens;
    }

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

    // Use streaming mode if explicitly enabled
    // Streaming helps prevent 504 gateway timeouts for long-running requests
    const shouldStream = config.stream ?? false;
    if (shouldStream) {
      return this.callApiStreaming(body, config, context);
    }

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
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug,
        this.config.maxRetries,
      ));

      if (status < 200 || status >= 300) {
        const errorMessage = `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`;

        // Check if this is an invalid_prompt error code (indicates refusal)
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
      // Preserve the structured rate-limit signal so the scheduler honors
      // the transport-layer fail-fast contract (no retry on hard quotas)
      // and so the user-facing message stays the canonical
      // "Rate limit exceeded:" / "Quota exceeded:" form rather than being
      // wrapped in "API call error: HttpRateLimitError: ...".
      if (err instanceof HttpRateLimitError) {
        return {
          error: formatRateLimitErrorMessage(err),
          metadata: {
            rateLimitKind: err.kind,
            http: {
              status: err.status,
              statusText: err.statusText,
              headers: err.headers ?? responseHeaders ?? {},
            },
          },
        };
      }
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
          metadata: {
            http: {
              status,
              statusText,
              headers: responseHeaders ?? {},
            },
          },
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
          metadata: {
            http: {
              status,
              statusText,
              headers: responseHeaders ?? {},
            },
          },
        };
      }

      let reasoning = '';
      let output: any = '';
      if (message.reasoning) {
        reasoning = message.reasoning;
        output = message.content;
      } else if (message.content && (message.function_call || message.tool_calls)) {
        if (Array.isArray(message.tool_calls) && message.tool_calls.length === 0) {
          output = message.content;
        } else {
          output = message;
        }
      } else if (
        message.content === null ||
        message.content === undefined ||
        (message.content === '' && message.tool_calls)
      ) {
        output = message.function_call || message.tool_calls;
      } else {
        output = message.content;
      }
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
      const functionCalls: any = message.function_call
        ? [message.function_call]
        : message.tool_calls;
      const callbackOutput = await this.resolveFunctionToolCallbacks(functionCalls, config);
      if (callbackOutput !== undefined) {
        return {
          output: callbackOutput,
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
          metadata: {
            http: {
              status,
              statusText,
              headers: responseHeaders ?? {},
            },
          },
        };
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
          cost: calculateOpenAIUsageCost(this.getBillingModelName(config), config, data.usage, {
            cachedResponse: cached,
            serviceTier: data.service_tier ?? config.service_tier,
          }),
          guardrails: { flagged: contentFiltered },
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
        output,
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
        metadata: {
          http: {
            status,
            statusText,
            headers: responseHeaders ?? {},
          },
          // Include all choices for multi-response requests (n > 1)
          ...(data.choices.length > 1 && { choices: data.choices }),
        },
      };
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

  /**
   * Handles streaming API calls using native fetch with SSE parsing.
   * Streaming helps prevent 504 gateway timeouts for long-running requests
   * by keeping the connection alive with incremental data.
   */
  private async callApiStreaming(
    body: Record<string, any>,
    config: OpenAiCompletionOptions,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    let metadata: ProviderResponse['metadata'];
    const hasLocalToolExecution = Boolean(config.functionToolCallbacks) || Boolean(this.mcpClient);
    const shouldUseCache =
      isCacheEnabled() && !context?.bustCache && !context?.debug && !hasLocalToolExecution;
    const cacheKey = getOpenAiStreamingCacheKey(this.id(), this.getApiUrl(), body);
    const cache = shouldUseCache ? getCache() : undefined;

    if (cache) {
      const cachedResponse = await getCachedOpenAiStreamingResponse(
        cache,
        cacheKey,
        this.modelName,
      );
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    const requestTimeoutMs = getRequestTimeoutMs();

    try {
      // Build streaming request body
      const streamBody = {
        ...body,
        stream: true,
        // Request usage stats in the final chunk
        stream_options: {
          ...getStreamingPassthroughOptions(body),
          include_usage: true,
        },
      };

      const url = `${this.getApiUrl()}/chat/completions`;
      logger.debug(`Starting streaming request to ${url}`, { model: this.modelName });

      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
          ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
          ...config.headers,
        },
        body: JSON.stringify(streamBody),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      metadata = getOpenAiStreamingHttpMetadata(response);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: `API error: ${response.status} ${response.statusText}\n${errorText}`,
          metadata,
        };
      }

      if (!response.body) {
        return { error: 'No response body for streaming request', metadata };
      }

      // Parse SSE stream
      const streamingState = await readOpenAiStreamingResponse(response.body.getReader());

      const latencyMs = Date.now() - startTime;
      logger.debug(`Streaming request completed in ${latencyMs}ms`, {
        model: this.modelName,
        contentLength: streamingState.content.length,
        finishReason: streamingState.finishReason,
      });

      const providerResponse = buildOpenAiStreamingResponse(
        streamingState,
        this.getBillingModelName(config),
        config,
        latencyMs,
      );
      const callbackOutput = await this.resolveFunctionToolCallbacks(
        streamingState.functionCall ? [streamingState.functionCall] : streamingState.toolCalls,
        config,
      );
      if (callbackOutput !== undefined) {
        providerResponse.output = callbackOutput;
      }
      providerResponse.metadata = metadata;

      // Cache the successful response
      if (cache) {
        await cacheOpenAiStreamingResponse(cache, cacheKey, providerResponse);
      }

      return providerResponse;
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      logger.error(`Streaming API call error after ${latencyMs}ms: ${String(err)}`);

      // Check for timeout errors
      if (err instanceof Error && err.name === 'TimeoutError') {
        return {
          error: `API call timed out after ${requestTimeoutMs}ms`,
          ...(metadata ? { metadata } : {}),
        };
      }

      return {
        error: `API call error: ${String(err)}`,
        ...(metadata ? { metadata } : {}),
      };
    }
  }
}
