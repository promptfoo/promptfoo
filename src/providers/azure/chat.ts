import { FetchResponseParseError, fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { HttpRateLimitError } from '../../util/fetch/errors';
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

import type { FetchWithCacheResult } from '../../cache';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { AzureChatResponsesOptions, AzureProviderOptions } from './types';

const SAFE_MESSAGE_ROLES = new Set([
  'assistant',
  'developer',
  'function',
  'system',
  'tool',
  'user',
]);
const SAFE_RESPONSE_FORMAT_TYPES = new Set(['json_object', 'json_schema', 'text']);
const FILTERED_PROMPT_OUTPUT = 'Azure content filtering blocked the prompt.';
const SAFE_FILTERED_PROMPT_OUTPUTS = new Set([
  "The response was filtered due to the prompt triggering Azure OpenAI's content management policy.",
  "The response was filtered due to the prompt triggering Azure OpenAI's content management policy. Please modify your prompt and retry. To learn more about our content filtering policies please read our documentation: https://go.microsoft.com/fwlink/?linkid=2198766",
]);

function getFilteredPromptOutput(message: unknown): string {
  return typeof message === 'string' && SAFE_FILTERED_PROMPT_OUTPUTS.has(message)
    ? message
    : FILTERED_PROMPT_OUTPUT;
}

function getSafeErrorType(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown';
  }
  return ['AbortError', 'Error', 'TypeError'].includes(error.name) ? error.name : 'Error';
}

function isAzureChatResponseCacheable(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }
  const response = data as Record<string, any>;
  return !response.error && Array.isArray(response.choices) && response.choices.length > 0;
}

async function evictAzureChatResponse(deleteFromCache?: () => Promise<void>): Promise<void> {
  try {
    await deleteFromCache?.();
  } catch (error) {
    logger.debug('[Azure Chat] Failed to evict response from cache', {
      errorType: getSafeErrorType(error),
    });
  }
}

function getAzureChatRateLimitResponse(error: HttpRateLimitError): ProviderResponse {
  const resetAt =
    typeof error.resetAt === 'number' && Number.isFinite(error.resetAt) ? error.resetAt : undefined;
  const retryAfterMs =
    typeof error.retryAfterMs === 'number'
      ? error.retryAfterMs
      : resetAt === undefined
        ? undefined
        : Math.max(resetAt - Date.now(), 0);
  const retryDetail =
    error.kind === 'rate_limit' && retryAfterMs !== undefined
      ? ` [retry after ${Math.round(retryAfterMs / 1000)}s]`
      : '';
  return {
    error:
      error.kind === 'quota'
        ? `Quota exceeded: HTTP ${error.status}. Retries will not help — check your billing or daily quota.`
        : `Rate limit exceeded: HTTP ${error.status}${retryDetail}`,
    metadata: {
      rateLimitKind: error.kind,
      http: {
        status: error.status,
        statusText: error.status === 429 ? 'Too Many Requests' : 'Rate Limited',
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
        ...(resetAt === undefined ? {} : { resetAt }),
        ...(retryAfterMs === undefined
          ? {}
          : { headers: { 'retry-after-ms': String(retryAfterMs) } }),
      },
    },
  };
}

function getAzureChatRequestMetadata(body: any) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const messageRoleCounts: Record<string, number> = {};

  for (const message of messages) {
    const role =
      typeof message?.role === 'string' && SAFE_MESSAGE_ROLES.has(message.role)
        ? message.role
        : 'other';
    messageRoleCounts[role] = (messageRoleCounts[role] ?? 0) + 1;
  }

  const responseFormatType =
    typeof body?.response_format?.type === 'string' ? body.response_format.type : undefined;
  const maxTokens = body?.max_tokens ?? body?.max_completion_tokens;

  return {
    messageCount: messages.length,
    messageRoleCounts,
    messageContentLengths: messages.map((message: any) =>
      typeof message?.content === 'string' ? message.content.length : undefined,
    ),
    toolCount: Array.isArray(body?.tools) ? body.tools.length : undefined,
    hasResponseFormat: Boolean(body?.response_format),
    responseFormatType:
      responseFormatType && SAFE_RESPONSE_FORMAT_TYPES.has(responseFormatType)
        ? responseFormatType
        : responseFormatType
          ? 'custom'
          : undefined,
    maxTokens: typeof maxTokens === 'number' ? maxTokens : undefined,
  };
}

function getAzureChatResponseMetadata(data: unknown, status?: number) {
  if (typeof data === 'string') {
    return {
      status,
      responseType: 'string',
      responseLength: data.length,
    };
  }

  if (!data || typeof data !== 'object') {
    return {
      status,
      responseType: typeof data,
    };
  }

  const response = data as Record<string, any>;

  return {
    status,
    responseType: Array.isArray(data) ? 'array' : 'object',
    responseKeyCount: Object.keys(response).length,
    hasError: Boolean(response.error),
    hasErrorCode: typeof response.error?.code === 'string',
    choiceCount: Array.isArray(response.choices) ? response.choices.length : undefined,
    hasUsage: Boolean(response.usage),
  };
}

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

    // Parse chat prompt
    let messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }], {
      redactErrors: true,
    });

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
    const isClaudeOpus47 = this.isClaudeOpus47();

    // Get max tokens based on model type
    const maxTokensDefault = config.omitDefaults
      ? getEnvString('OPENAI_MAX_TOKENS') === undefined
        ? undefined
        : getEnvInt('OPENAI_MAX_TOKENS')
      : getEnvInt('OPENAI_MAX_TOKENS', 1024);
    const maxTokens = config.max_tokens ?? maxTokensDefault;
    const maxCompletionTokens =
      config.max_completion_tokens ?? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS') ?? maxTokens;

    const temperatureDefault = config.omitDefaults
      ? getEnvString('OPENAI_TEMPERATURE') === undefined
        ? undefined
        : getEnvFloat('OPENAI_TEMPERATURE')
      : getEnvFloat('OPENAI_TEMPERATURE', 0);
    const temperature = config.temperature ?? temperatureDefault;

    const topP = config.omitDefaults
      ? (config.top_p ?? getEnvFloat('OPENAI_TOP_P'))
      : (config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1));
    const presencePenalty = config.omitDefaults
      ? (config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY'))
      : (config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0));
    const frequencyPenalty = config.omitDefaults
      ? (config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY'))
      : (config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0));

    // Get reasoning effort for reasoning models
    const reasoningEffort = config.reasoning_effort ?? (config.omitDefaults ? undefined : 'medium');

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
            ...(reasoningEffort === undefined
              ? {}
              : { reasoning_effort: renderVarsInObject(reasoningEffort, context?.vars) }),
            ...(maxCompletionTokens === undefined
              ? {}
              : { max_completion_tokens: maxCompletionTokens }),
          }
        : {
            ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
            ...(temperature === undefined || isClaudeOpus47 ? {} : { temperature }),
          }),
      ...(topP === undefined ? {} : { top_p: topP }),
      ...(presencePenalty === undefined ? {} : { presence_penalty: presencePenalty }),
      ...(frequencyPenalty === undefined ? {} : { frequency_penalty: frequencyPenalty }),
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

    let data: any;
    let fetchResult!: FetchWithCacheResult<any>;

    try {
      const url = config.dataSources
        ? `${this.getApiBaseUrl()}/openai/deployments/${
            this.deploymentName
          }/extensions/chat/completions?api-version=${config.apiVersion || DEFAULT_AZURE_API_VERSION}`
        : `${this.getApiBaseUrl()}/openai/deployments/${
            this.deploymentName
          }/chat/completions?api-version=${config.apiVersion || DEFAULT_AZURE_API_VERSION}`;

      fetchResult = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
            ...this.config.headers,
            'x-promptfoo-silent': 'true',
          },
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
        'json',
        {
          bust: context?.bustCache ?? context?.debug,
          isResponseCacheable: isAzureChatResponseCacheable,
        },
      );

      data = fetchResult.data;
    } catch (err) {
      if (err instanceof FetchResponseParseError) {
        const responseMetadata = {
          status: err.status,
          responseType: 'string',
          responseLength: err.responseLength,
        };
        return {
          error: `API returned invalid JSON response (status ${err.status})\n\nResponse metadata: ${JSON.stringify(responseMetadata, null, 2)}\n\nRequest metadata: ${JSON.stringify(getAzureChatRequestMetadata(body), null, 2)}`,
        };
      }
      // Preserve the structured rate-limit signal so the scheduler honors
      // the transport-layer fail-fast contract (no retry on hard quotas).
      if (err instanceof HttpRateLimitError) {
        return getAzureChatRateLimitResponse(err);
      }
      return {
        error: `API call error (${getSafeErrorType(err)})`,
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
        await evictAzureChatResponse(fetchResult.deleteFromCache);
        // Was the input prompt deemed inappropriate?
        if (data.error.status === 400 && data.error.code === FINISH_REASON_MAP.content_filter) {
          flaggedInput = true;
          output = getFilteredPromptOutput(data.error.message);
          finishReason = FINISH_REASON_MAP.content_filter;
        } else {
          return {
            error: `API response error (status ${fetchResult.status})\n\nResponse metadata: ${JSON.stringify(getAzureChatResponseMetadata(data, fetchResult.status), null, 2)}`,
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
        if (choice?.content_filter_results?.error) {
          logger.warn('Azure content filtering system could not complete the request', {
            hasCode: typeof choice.content_filter_results.error.code === 'string',
            hasMessage: typeof choice.content_filter_results.error.message === 'string',
          });
        } else {
          // Was the completion filtered?
          flaggedOutput = finishReason === FINISH_REASON_MAP.content_filter;
        }

        if (output == null) {
          // Handle tool_calls and function_call
          const toolCalls = message?.tool_calls;
          const functionCall = message?.function_call;

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
            logger.error('Failed to parse JSON output', {
              errorType: err instanceof Error ? err.constructor.name : typeof err,
              outputType: typeof output,
              outputLength: typeof output === 'string' ? output.length : undefined,
            });
          }
        }

        logProbs = data.choices[0].logprobs?.content?.map(
          (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
        );
      }

      return {
        output,
        tokenUsage: fetchResult.cached
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
        cached: fetchResult.cached,
        latencyMs: fetchResult.latencyMs,
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
      await evictAzureChatResponse(fetchResult.deleteFromCache);
      logger.debug('[Azure Chat] Failed to process response', {
        errorType: getSafeErrorType(err),
      });
      return {
        error: `API response error (status ${fetchResult.status})\n\nResponse metadata: ${JSON.stringify(getAzureChatResponseMetadata(data, fetchResult.status), null, 2)}`,
      };
    }
  }
}
