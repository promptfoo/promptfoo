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
    // Transform tools from NormalizedTool format if needed
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
      const url = config.dataSources
        ? `${this.getApiBaseUrl()}/openai/deployments/${
            this.deploymentName
          }/extensions/chat/completions?api-version=${config.apiVersion || DEFAULT_AZURE_API_VERSION}`
        : `${this.getApiBaseUrl()}/openai/deployments/${
            this.deploymentName
          }/chat/completions?api-version=${config.apiVersion || DEFAULT_AZURE_API_VERSION}`;

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

      // Handle the response data
      if (typeof responseData === 'string') {
        try {
          data = JSON.parse(responseData);
        } catch {
          return {
            error: `API returned invalid JSON response (status ${status}): ${responseData}\n\nRequest body: ${JSON.stringify(body, null, 2)}`,
          };
        }
      } else {
        data = responseData;
      }
    } catch (err) {
      return {
        error: `API call error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Inputs and outputs can be flagged by content filters.
    // See https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/content-filter
    let flaggedInput = false;
    let flaggedOutput = false;
    let output = '';
    let logProbs: any;
    let finishReason: string;

    try {
      if (data.error) {
        // Was the input prompt deemed inappropriate?
        if (data.error.status === 400 && data.error.code === FINISH_REASON_MAP.content_filter) {
          flaggedInput = true;
          output = data.error.message;
          finishReason = FINISH_REASON_MAP.content_filter;
        } else {
          return {
            error: `API response error: ${data.error.code} ${data.error.message}`,
          };
        }
      } else {
        const hasDataSources = !!config.dataSources || !!config.data_sources;
        const choice = hasDataSources
          ? data.choices.find(
              (choice: { message: { role: string; content: string } }) =>
                choice.message.role === 'assistant',
            )
          : data.choices[0];

        const message = choice?.message;

        // NOTE: The `n` parameter is currently (250709) not supported; if and when it is, `finish_reason` must be
        // checked on all choices; in other words, if n>1 responses are requested, n>1 responses can trigger filters.
        finishReason = normalizeFinishReason(choice?.finish_reason) as string;

        // Handle structured output
        output = message?.content;

        // Check for errors indicating that the content filters did not run on the completion.
        if (choice.content_filter_results && choice.content_filter_results.error) {
          const { code, message } = choice.content_filter_results.error;
          logger.warn(
            `Content filtering system is down or otherwise unable to complete the request in time: ${code} ${message}`,
          );
        } else {
          // Was the completion filtered?
          flaggedOutput = finishReason === FINISH_REASON_MAP.content_filter;
        }

        if (output == null) {
          // Handle tool_calls and function_call
          const toolCalls = message.tool_calls;
          const functionCall = message.function_call;

          // Process function/tool calls if callbacks are configured or MCP is available
          if (
            (config.functionToolCallbacks && (toolCalls || functionCall)) ||
            (this.mcpClient && (toolCalls || functionCall))
          ) {
            // Combine all calls into a single array for processing
            const allCalls = [];
            if (toolCalls) {
              allCalls.push(...(Array.isArray(toolCalls) ? toolCalls : [toolCalls]));
            }
            if (functionCall) {
              allCalls.push(functionCall);
            }

            output = await this.functionCallbackHandler.processCalls(
              allCalls.length === 1 ? allCalls[0] : allCalls,
              config.functionToolCallbacks,
            );
          } else {
            // No callbacks configured, return raw tool/function calls
            output = toolCalls ?? functionCall;
          }
        } else if (
          config.response_format?.type === 'json_schema' ||
          config.response_format?.type === 'json_object'
        ) {
          try {
            output = JSON.parse(output);
          } catch (err) {
            logger.error(`Failed to parse JSON output: ${err}. Output was: ${output}`);
          }
        }

        logProbs = data.choices[0].logprobs?.content?.map(
          (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
        );
      }

      return {
        output,
        tokenUsage: cached
          ? { cached: data.usage?.total_tokens, total: data?.usage?.total_tokens }
          : {
              total: data.usage?.total_tokens,
              prompt: data.usage?.prompt_tokens,
              completion: data.usage?.completion_tokens,
              ...(data.usage?.completion_tokens_details
                ? {
                    completionDetails: {
                      reasoning: data.usage.completion_tokens_details.reasoning_tokens,
                      acceptedPrediction:
                        data.usage.completion_tokens_details.accepted_prediction_tokens,
                      rejectedPrediction:
                        data.usage.completion_tokens_details.rejected_prediction_tokens,
                    },
                  }
                : {}),
            },
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
