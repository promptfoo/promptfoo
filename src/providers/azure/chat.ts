import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt } from '../../envars';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { FINISH_REASON_MAP, normalizeFinishReason } from '../../util/finishReason';
import {
  maybeLoadFromExternalFileWithVars,
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../util/index';
import invariant from '../../util/invariant';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToOpenAi } from '../mcp/transform';
import { parseChatPrompt, REQUEST_TIMEOUT_MS, transformTools } from '../shared';
import { DEFAULT_AZURE_API_VERSION } from './defaults';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

export class AzureChatCompletionProvider extends AzureGenericProvider {
  private mcpClient: MCPClient | null = null;
  private functionCallbackHandler: FunctionCallbackHandler;

  constructor(...args: ConstructorParameters<typeof AzureGenericProvider>) {
    super(...args);

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

  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<Record<string, any>> {
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Parse chat prompt
    let messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    // Inject system prompt if configured
    if (config.systemPrompt) {
      // Check if there's already a system message
      const existingSystemMessageIndex = messages.findIndex((msg: any) => msg.role === 'system');

      if (existingSystemMessageIndex >= 0) {
        // Replace existing system message
        messages[existingSystemMessageIndex] = {
          role: 'system',
          content: config.systemPrompt,
        };
      } else {
        // Prepend new system message
        messages = [
          {
            role: 'system',
            content: config.systemPrompt,
          },
          ...messages,
        ];
      }
    }

    // Response format with variable rendering (handles nested schema loading)
    const responseFormat = config.response_format
      ? {
          response_format: maybeLoadResponseFormatFromExternalFile(
            config.response_format,
            context?.vars,
          ),
        }
      : {};

    // Check if this is configured as a reasoning model
    const isReasoningModel = this.isReasoningModel();

    // Get max tokens based on model type
    const maxTokens = config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024);
    const maxCompletionTokens = config.max_completion_tokens;

    // Get reasoning effort for reasoning models
    const reasoningEffort = config.reasoning_effort ?? 'medium';

    // --- MCP tool injection logic ---
    const mcpTools = this.mcpClient ? transformMCPToolsToOpenAi(this.mcpClient.getAllTools()) : [];
    const loadedTools = config.tools
      ? (await maybeLoadToolsFromExternalFile(config.tools, context?.vars)) || []
      : [];
    // Transform tools to OpenAI format if needed
    const fileTools = transformTools(loadedTools, 'openai') as typeof loadedTools;
    const allTools = [...mcpTools, ...fileTools];
    // --- End MCP tool injection logic ---

    // Build the request body
    const body = {
      model: this.deploymentName,
      messages,
      ...(isReasoningModel
        ? {
            max_completion_tokens: maxCompletionTokens ?? maxTokens,
            reasoning_effort: renderVarsInObject(reasoningEffort, context?.vars),
          }
        : {
            max_tokens: maxTokens,
            temperature: config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0),
          }),
      top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1),
      presence_penalty: config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
      frequency_penalty: config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
      ...(config.seed === undefined ? {} : { seed: config.seed }),
      ...(config.functions
        ? {
            functions: maybeLoadFromExternalFileWithVars(config.functions, context?.vars),
          }
        : {}),
      ...(config.function_call ? { function_call: config.function_call } : {}),
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.deployment_id ? { deployment_id: config.deployment_id } : {}),
      ...(config.dataSources ? { dataSources: config.dataSources } : {}), // legacy support for versions < 2024-02-15-preview
      ...(config.data_sources ? { data_sources: config.data_sources } : {}),
      ...responseFormat,
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(config.stop ? { stop: config.stop } : {}),
      ...(config.passthrough || {}),
    };

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

  private buildEndpointUrl(config: any): string {
    const apiVersion = config.apiVersion || DEFAULT_AZURE_API_VERSION;
    if (config.dataSources) {
      return `${this.getApiBaseUrl()}/openai/deployments/${this.deploymentName}/extensions/chat/completions?api-version=${apiVersion}`;
    }
    return `${this.getApiBaseUrl()}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${apiVersion}`;
  }

  private parseResponseData(
    responseData: any,
    status: number,
    body: any,
  ): { data: any; error?: string } {
    if (typeof responseData !== 'string') {
      return { data: responseData };
    }
    try {
      return { data: JSON.parse(responseData) };
    } catch {
      return {
        data: null,
        error: `API returned invalid JSON response (status ${status}): ${responseData}\n\nRequest body: ${JSON.stringify(body, null, 2)}`,
      };
    }
  }

  private handleErrorResponse(data: any): {
    flaggedInput: boolean;
    output: string;
    finishReason: string;
    error?: string;
  } | null {
    if (!data.error) {
      return null;
    }
    if (data.error.status === 400 && data.error.code === FINISH_REASON_MAP.content_filter) {
      return {
        flaggedInput: true,
        output: data.error.message,
        finishReason: FINISH_REASON_MAP.content_filter,
      };
    }
    return {
      flaggedInput: false,
      output: '',
      finishReason: '',
      error: `API response error: ${data.error.code} ${data.error.message}`,
    };
  }

  private selectChoice(data: any, config: any): any {
    const hasDataSources = !!config.dataSources || !!config.data_sources;
    if (hasDataSources) {
      return data.choices.find(
        (choice: { message: { role: string; content: string } }) =>
          choice.message.role === 'assistant',
      );
    }
    return data.choices[0];
  }

  private checkContentFilterStatus(choice: any): boolean {
    if (choice.content_filter_results?.error) {
      const { code, message } = choice.content_filter_results.error;
      logger.warn(
        `Content filtering system is down or otherwise unable to complete the request in time: ${code} ${message}`,
      );
      return false;
    }
    return false;
  }

  private async resolveToolCallOutput(message: any, config: any): Promise<any> {
    const toolCalls = message.tool_calls;
    const functionCall = message.function_call;
    const hasCalls = toolCalls || functionCall;

    if (!hasCalls) {
      return null;
    }

    const hasCallbacks = (config.functionToolCallbacks && hasCalls) || (this.mcpClient && hasCalls);

    if (!hasCallbacks) {
      return toolCalls ?? functionCall;
    }

    const allCalls: any[] = [];
    if (toolCalls) {
      allCalls.push(...(Array.isArray(toolCalls) ? toolCalls : [toolCalls]));
    }
    if (functionCall) {
      allCalls.push(functionCall);
    }

    return this.functionCallbackHandler.processCalls(
      allCalls.length === 1 ? allCalls[0] : allCalls,
      config.functionToolCallbacks,
    );
  }

  private tryParseJsonOutput(output: string, config: any): any {
    const isJsonFormat =
      config.response_format?.type === 'json_schema' ||
      config.response_format?.type === 'json_object';
    if (!isJsonFormat) {
      return output;
    }
    try {
      return JSON.parse(output);
    } catch (err) {
      logger.error(`Failed to parse JSON output: ${err}. Output was: ${output}`);
      return output;
    }
  }

  private buildTokenUsage(data: any, cached: boolean) {
    if (cached) {
      return { cached: data.usage?.total_tokens, total: data?.usage?.total_tokens };
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

  private async processChoiceOutput(
    choice: any,
    data: any,
    config: any,
  ): Promise<{
    output: any;
    flaggedOutput: boolean;
    finishReason: string;
    logProbs: any;
  }> {
    const finishReason = normalizeFinishReason(choice?.finish_reason) as string;
    let output = choice?.message?.content;
    const flaggedOutput =
      finishReason === FINISH_REASON_MAP.content_filter || this.checkContentFilterStatus(choice);

    if (output == null) {
      output = await this.resolveToolCallOutput(choice?.message, config);
    } else {
      output = this.tryParseJsonOutput(output, config);
    }

    const logProbs = data.choices[0].logprobs?.content?.map(
      (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
    );

    return { output, flaggedOutput, finishReason, logProbs };
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

    let data;
    let cached = false;
    let latencyMs: number | undefined;

    try {
      const url = this.buildEndpointUrl(config);

      const {
        data: responseData,
        cached: isCached,
        status,
        latencyMs: fetchLatencyMs,
      } = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        context?.bustCache ?? context?.debug,
      );

      cached = isCached;
      latencyMs = fetchLatencyMs;

      const parsed = this.parseResponseData(responseData, status, body);
      if (parsed.error) {
        return { error: parsed.error };
      }
      data = parsed.data;
    } catch (err) {
      return {
        error: `API call error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Inputs and outputs can be flagged by content filters.
    // See https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/content-filter
    let flaggedInput = false;
    let flaggedOutput = false;
    let output: any = '';
    let logProbs: any;
    let finishReason: string = '';

    try {
      const errorResult = this.handleErrorResponse(data);
      if (errorResult) {
        if (errorResult.error) {
          return { error: errorResult.error };
        }
        flaggedInput = errorResult.flaggedInput;
        output = errorResult.output;
        finishReason = errorResult.finishReason;
      } else {
        const choice = this.selectChoice(data, config);
        const processed = await this.processChoiceOutput(choice, data, config);
        output = processed.output;
        flaggedOutput = processed.flaggedOutput;
        finishReason = processed.finishReason;
        logProbs = processed.logProbs;
      }

      return {
        output,
        tokenUsage: this.buildTokenUsage(data, cached),
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
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
