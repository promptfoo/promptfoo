import { fetchWithCache } from '../../cache';
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
import invariant from '../../util/invariant';
import { isClaudeOpus47Model } from '../anthropic/util';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToOpenAi } from '../mcp/transform';
import { getRequestTimeoutMs, parseChatPrompt, transformTools } from '../shared';
import { DEFAULT_AZURE_API_VERSION } from './defaults';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { AzureChatResponsesOptions, AzureProviderOptions } from './types';

export class AzureChatCompletionProvider extends AzureGenericProvider {
  declare config: AzureChatResponsesOptions;

  private mcpClient: MCPClient | null = null;
  private functionCallbackHandler: FunctionCallbackHandler;

  constructor(
    deploymentName: string,
    options: AzureProviderOptions<AzureChatResponsesOptions> = {},
  ) {
    super(deploymentName, options);

    // Initialize callback handler immediately (will be replaced if MCP is enabled)
    this.functionCallbackHandler = new FunctionCallbackHandler();

    // Initialize MCP if enabled
    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  private async initializeMCP(): Promise<void> {
    this.mcpClient = new MCPClient(this.config.mcp!);
    await this.mcpClient.initialize();

    // Initialize callback handler with MCP client
    this.functionCallbackHandler = new FunctionCallbackHandler(this.mcpClient);
  }

  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      await this.initializationPromise;
      await this.mcpClient.cleanup();
      this.mcpClient = null;
    }
  }

  /**
   * Check if the current deployment is configured as a reasoning model.
   * Reasoning models use max_completion_tokens instead of max_tokens,
   * don't support temperature, and accept reasoning_effort parameter.
   */
  protected isReasoningModel(): boolean {
    // Check explicit config flags first
    if (this.config.isReasoningModel || this.config.o1) {
      return true;
    }

    // Auto-detect reasoning models by deployment name (case-insensitive)
    // Supports both direct names (o1-preview) and prefixed names (prod-o1-mini)
    const lowerName = this.deploymentName.toLowerCase();
    return (
      // OpenAI reasoning models
      lowerName.startsWith('o1') ||
      lowerName.includes('-o1') ||
      lowerName.startsWith('o3') ||
      lowerName.includes('-o3') ||
      lowerName.startsWith('o4') ||
      lowerName.includes('-o4') ||
      // GPT-5 series (reasoning by default)
      lowerName.startsWith('gpt-5') ||
      lowerName.includes('-gpt-5') ||
      // DeepSeek reasoning models
      lowerName.includes('deepseek-r1') ||
      lowerName.includes('deepseek_r1') ||
      // Microsoft Phi reasoning models
      lowerName.includes('phi-4-reasoning') ||
      lowerName.includes('phi-4-mini-reasoning') ||
      // xAI Grok reasoning models
      (lowerName.includes('grok') && lowerName.includes('reasoning'))
    );
  }

  /**
   * Claude Opus 4.7 deprecates `temperature` at the model level — the
   * deployment returns 400 for any request that includes it. Opus 4.7 keeps
   * the standard `max_tokens` field (not `max_completion_tokens`) and does
   * not accept `reasoning_effort`, so we only strip temperature here and
   * leave the rest of the chat body intact.
   */
  protected isClaudeOpus47(): boolean {
    return isClaudeOpus47Model(this.deploymentName);
  }

  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<Record<string, any>> {
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };
    const messages = this.buildMessages(prompt, config);
    const responseFormat = this.buildResponseFormat(config, context);

    // Check if this is configured as a reasoning model
    const isReasoningModel = this.isReasoningModel();
    const isClaudeOpus47 = this.isClaudeOpus47();
    const tokenConfig = this.getTokenConfig(config);
    const samplingConfig = this.getSamplingConfig(config);
    const reasoningEffort = config.reasoning_effort ?? (config.omitDefaults ? undefined : 'medium');
    const allTools = await this.loadTools(config, context);
    const body = this.buildAzureChatBody({
      config,
      context,
      callApiOptions,
      messages,
      responseFormat,
      isReasoningModel,
      isClaudeOpus47,
      tokenConfig,
      samplingConfig,
      reasoningEffort,
      allTools,
    });

    return { body, config };
  }

  private buildMessages(prompt: string, config: AzureChatResponsesOptions) {
    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
    if (!config.systemPrompt) {
      return messages;
    }
    const existingSystemMessageIndex = messages.findIndex((msg: any) => msg.role === 'system');
    if (existingSystemMessageIndex >= 0) {
      messages[existingSystemMessageIndex] = { role: 'system', content: config.systemPrompt };
      return messages;
    }
    return [{ role: 'system', content: config.systemPrompt }, ...messages];
  }

  private buildResponseFormat(
    config: AzureChatResponsesOptions,
    context?: CallApiContextParams,
  ): Record<string, unknown> {
    if (!config.response_format) {
      return {};
    }
    return {
      response_format: maybeLoadResponseFormatFromExternalFile(
        config.response_format,
        context?.vars,
      ),
    };
  }

  private getTokenConfig(config: AzureChatResponsesOptions) {
    const maxTokensDefault = config.omitDefaults
      ? getEnvString('OPENAI_MAX_TOKENS') === undefined
        ? undefined
        : getEnvInt('OPENAI_MAX_TOKENS')
      : getEnvInt('OPENAI_MAX_TOKENS', 1024);
    const maxTokens = config.max_tokens ?? maxTokensDefault;
    return {
      maxTokens,
      maxCompletionTokens:
        config.max_completion_tokens ?? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS') ?? maxTokens,
    };
  }

  private getSamplingConfig(config: AzureChatResponsesOptions) {
    const temperatureDefault = config.omitDefaults
      ? getEnvString('OPENAI_TEMPERATURE') === undefined
        ? undefined
        : getEnvFloat('OPENAI_TEMPERATURE')
      : getEnvFloat('OPENAI_TEMPERATURE', 0);
    return {
      temperature: config.temperature ?? temperatureDefault,
      topP: config.omitDefaults
        ? (config.top_p ?? getEnvFloat('OPENAI_TOP_P'))
        : (config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1)),
      presencePenalty: config.omitDefaults
        ? (config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY'))
        : (config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0)),
      frequencyPenalty: config.omitDefaults
        ? (config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY'))
        : (config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0)),
    };
  }

  private async loadTools(config: AzureChatResponsesOptions, context?: CallApiContextParams) {
    const mcpTools = this.mcpClient ? transformMCPToolsToOpenAi(this.mcpClient.getAllTools()) : [];
    const loadedTools = config.tools
      ? (await maybeLoadToolsFromExternalFile(config.tools, context?.vars)) || []
      : [];
    const fileTools = transformTools(loadedTools, 'openai') as typeof loadedTools;
    return [...mcpTools, ...fileTools];
  }

  private buildAzureChatBody({
    config,
    context,
    callApiOptions,
    messages,
    responseFormat,
    isReasoningModel,
    isClaudeOpus47,
    tokenConfig,
    samplingConfig,
    reasoningEffort,
    allTools,
  }: {
    config: AzureChatResponsesOptions;
    context?: CallApiContextParams;
    callApiOptions?: CallApiOptionsParams;
    messages: ReturnType<typeof parseChatPrompt>;
    responseFormat: Record<string, unknown>;
    isReasoningModel: boolean;
    isClaudeOpus47: boolean;
    tokenConfig: { maxTokens?: number; maxCompletionTokens?: number };
    samplingConfig: {
      temperature?: number;
      topP?: number;
      presencePenalty?: number;
      frequencyPenalty?: number;
    };
    reasoningEffort: AzureChatResponsesOptions['reasoning_effort'] | 'medium' | undefined;
    allTools: unknown[];
  }) {
    return {
      model: this.deploymentName,
      messages,
      ...(isReasoningModel
        ? this.buildReasoningFields(reasoningEffort, tokenConfig.maxCompletionTokens, context)
        : this.buildStandardFields(
            tokenConfig.maxTokens,
            samplingConfig.temperature,
            isClaudeOpus47,
          )),
      ...(samplingConfig.topP === undefined ? {} : { top_p: samplingConfig.topP }),
      ...(samplingConfig.presencePenalty === undefined
        ? {}
        : { presence_penalty: samplingConfig.presencePenalty }),
      ...(samplingConfig.frequencyPenalty === undefined
        ? {}
        : { frequency_penalty: samplingConfig.frequencyPenalty }),
      ...(config.seed === undefined ? {} : { seed: config.seed }),
      ...(config.functions
        ? { functions: maybeLoadFromExternalFileWithVars(config.functions, context?.vars) }
        : {}),
      ...(config.function_call ? { function_call: config.function_call } : {}),
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.deployment_id ? { deployment_id: config.deployment_id } : {}),
      ...(config.dataSources ? { dataSources: config.dataSources } : {}),
      ...((config as AzureChatResponsesOptions & { data_sources?: unknown }).data_sources
        ? {
            data_sources: (config as AzureChatResponsesOptions & { data_sources?: unknown })
              .data_sources,
          }
        : {}),
      ...responseFormat,
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(config.stop ? { stop: config.stop } : {}),
      ...(config.passthrough || {}),
    };
  }

  private buildReasoningFields(
    reasoningEffort: AzureChatResponsesOptions['reasoning_effort'] | 'medium' | undefined,
    maxCompletionTokens: number | undefined,
    context?: CallApiContextParams,
  ) {
    return {
      ...(reasoningEffort === undefined
        ? {}
        : { reasoning_effort: renderVarsInObject(reasoningEffort, context?.vars) }),
      ...(maxCompletionTokens === undefined ? {} : { max_completion_tokens: maxCompletionTokens }),
    };
  }

  private buildStandardFields(
    maxTokens: number | undefined,
    temperature: number | undefined,
    isClaudeOpus47: boolean,
  ) {
    return {
      ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      ...(temperature === undefined || isClaudeOpus47 ? {} : { temperature }),
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');

    if (!this.getApiBaseUrl()) {
      throw new Error('Azure API host must be set.');
    }

    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'azure',
      operationName: 'chat',
      model: this.deploymentName,
      providerId: this.id(),
      // Optional request parameters
      maxTokens: this.config.max_tokens,
      temperature: this.config.temperature,
      topP: this.config.top_p,
      stopSequences: this.config.stop,
      frequencyPenalty: this.config.frequency_penalty,
      presencePenalty: this.config.presence_penalty,
      // Promptfoo context from test case if available
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
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
   */
  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);
    const requestResult = await this.requestAzureChat(body, config, context);
    if (this.isProviderErrorResponse(requestResult)) {
      return requestResult;
    }
    return this.processAzureChatResponse(requestResult, config);
  }

  private async requestAzureChat(
    body: Record<string, any>,
    config: AzureChatResponsesOptions,
    context?: CallApiContextParams,
  ): Promise<
    | {
        data: any;
        cached: boolean;
        latencyMs?: number;
      }
    | ProviderResponse
  > {
    try {
      const { data, cached, latencyMs, status } = await fetchWithCache(
        this.getChatCompletionUrl(config),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug,
      );
      const parsedData = this.parseAzureResponseData(data, status, body);
      if ('response' in parsedData) {
        return parsedData.response;
      }
      return { data: parsedData.data, cached, latencyMs };
    } catch (err) {
      return this.formatAzureRequestError(err);
    }
  }

  private getChatCompletionUrl(config: AzureChatResponsesOptions): string {
    const endpoint = config.dataSources ? 'extensions/chat/completions' : 'chat/completions';
    return `${this.getApiBaseUrl()}/openai/deployments/${this.deploymentName}/${endpoint}?api-version=${
      config.apiVersion || DEFAULT_AZURE_API_VERSION
    }`;
  }

  private parseAzureResponseData(
    responseData: any,
    status: number,
    body: Record<string, any>,
  ): { data: any } | { response: ProviderResponse } {
    if (typeof responseData !== 'string') {
      return { data: responseData };
    }
    try {
      return { data: JSON.parse(responseData) };
    } catch {
      return {
        response: {
          error: `API returned invalid JSON response (status ${status}): ${responseData}\n\nRequest body: ${JSON.stringify(body, null, 2)}`,
        },
      };
    }
  }

  private isProviderErrorResponse(
    value:
      | {
          data: any;
          cached: boolean;
          latencyMs?: number;
        }
      | ProviderResponse,
  ): value is ProviderResponse {
    return 'error' in value && !('data' in value);
  }

  private formatAzureRequestError(err: unknown): ProviderResponse {
    if (err instanceof HttpRateLimitError) {
      return {
        error: formatRateLimitErrorMessage(err),
        metadata: {
          rateLimitKind: err.kind,
          http: {
            status: err.status,
            statusText: err.statusText,
            headers: err.headers ?? {},
          },
        },
      };
    }
    return { error: `API call error: ${err instanceof Error ? err.message : String(err)}` };
  }

  private async processAzureChatResponse(
    requestResult: { data: any; cached: boolean; latencyMs?: number },
    config: AzureChatResponsesOptions,
  ): Promise<ProviderResponse> {
    const { data, cached, latencyMs } = requestResult;
    try {
      if (data.error) {
        return this.processAzureErrorResponse(data, cached, latencyMs, config);
      }
      const choice = this.getAzureChoice(data, config);
      const finishReason = normalizeFinishReason(choice?.finish_reason) as string;
      const { output, flaggedOutput } = await this.resolveAzureOutput(choice, config, finishReason);
      const logProbs = data.choices[0].logprobs?.content?.map(
        (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
      );
      return this.buildAzureSuccessResponse({
        data,
        config,
        cached,
        latencyMs,
        output,
        logProbs,
        finishReason,
        flaggedInput: false,
        flaggedOutput,
      });
    } catch (err) {
      return { error: `API response error: ${String(err)}: ${JSON.stringify(data)}` };
    }
  }

  private processAzureErrorResponse(
    data: any,
    cached: boolean,
    latencyMs: number | undefined,
    config: AzureChatResponsesOptions,
  ): ProviderResponse {
    if (data.error.status !== 400 || data.error.code !== FINISH_REASON_MAP.content_filter) {
      return { error: `API response error: ${data.error.code} ${data.error.message}` };
    }
    return this.buildAzureSuccessResponse({
      data,
      config,
      cached,
      latencyMs,
      output: data.error.message,
      logProbs: undefined,
      finishReason: FINISH_REASON_MAP.content_filter,
      flaggedInput: true,
      flaggedOutput: false,
    });
  }

  private getAzureChoice(data: any, config: AzureChatResponsesOptions) {
    if (
      !config.dataSources &&
      !(config as AzureChatResponsesOptions & { data_sources?: unknown }).data_sources
    ) {
      return data.choices[0];
    }
    return data.choices.find(
      (choice: { message: { role: string; content: string } }) =>
        choice.message.role === 'assistant',
    );
  }

  private async resolveAzureOutput(
    choice: any,
    config: AzureChatResponsesOptions,
    finishReason: string,
  ): Promise<{ output: any; flaggedOutput: boolean }> {
    const message = choice?.message;
    let output = message?.content;
    if (choice.content_filter_results?.error) {
      const { code, message: filterMessage } = choice.content_filter_results.error;
      logger.warn(
        `Content filtering system is down or otherwise unable to complete the request in time: ${code} ${filterMessage}`,
      );
    }
    const flaggedOutput = finishReason === FINISH_REASON_MAP.content_filter;
    if (output == null) {
      output = await this.resolveToolCallOutput(message, config);
    } else if (
      config.response_format?.type === 'json_schema' ||
      config.response_format?.type === 'json_object'
    ) {
      output = this.parseStructuredOutput(output);
    }
    return { output, flaggedOutput };
  }

  private async resolveToolCallOutput(message: any, config: AzureChatResponsesOptions) {
    const toolCalls = message.tool_calls;
    const functionCall = message.function_call;
    const hasCalls = Boolean(toolCalls || functionCall);
    if (!hasCalls || (!config.functionToolCallbacks && !this.mcpClient)) {
      return toolCalls ?? functionCall;
    }
    const allCalls = [
      ...(toolCalls ? (Array.isArray(toolCalls) ? toolCalls : [toolCalls]) : []),
      ...(functionCall ? [functionCall] : []),
    ];
    return this.functionCallbackHandler.processCalls(
      allCalls.length === 1 ? allCalls[0] : allCalls,
      config.functionToolCallbacks,
    );
  }

  private parseStructuredOutput(output: string) {
    try {
      return JSON.parse(output);
    } catch (err) {
      logger.error(`Failed to parse JSON output: ${err}. Output was: ${output}`);
      return output;
    }
  }

  private buildAzureSuccessResponse({
    data,
    config,
    cached,
    latencyMs,
    output,
    logProbs,
    finishReason,
    flaggedInput,
    flaggedOutput,
  }: {
    data: any;
    config: AzureChatResponsesOptions;
    cached: boolean;
    latencyMs?: number;
    output: any;
    logProbs: any;
    finishReason: string;
    flaggedInput: boolean;
    flaggedOutput: boolean;
  }): ProviderResponse {
    return {
      output,
      tokenUsage: this.buildAzureTokenUsage(data, cached),
      cached,
      latencyMs,
      logProbs,
      finishReason,
      cost: calculateAzureCost(
        this.deploymentName,
        config,
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
      ),
      guardrails: {
        flagged: flaggedInput || flaggedOutput,
        flaggedInput,
        flaggedOutput,
      },
    };
  }

  private buildAzureTokenUsage(data: any, cached: boolean): ProviderResponse['tokenUsage'] {
    if (cached) {
      return { cached: data.usage?.total_tokens, total: data.usage?.total_tokens };
    }
    return {
      total: data.usage?.total_tokens,
      prompt: data.usage?.prompt_tokens,
      completion: data.usage?.completion_tokens,
      ...(data.usage?.completion_tokens_details
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
