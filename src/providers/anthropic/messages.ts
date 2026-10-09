import { APIError } from '@anthropic-ai/sdk';
import {
  getCache,
  getCacheClearGeneration,
  getCacheTtlMs,
  getScopedCacheKey,
  isCacheEnabled,
} from '../../cache';
import { getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { maybeLoadResponseFormatFromExternalFile } from '../../util/file';
import { normalizeFinishReason } from '../../util/finishReason';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import { createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToAnthropic } from '../mcp/transform';
import { getMcpErrorMessage, isMcpErrorResult, normalizeMcpToolContent } from '../mcp/util';
import { transformToolChoice, transformTools } from '../shared';
import {
  CLAUDE_CODE_IDENTITY_PROMPT,
  CLAUDE_CODE_OAUTH_BETA_FEATURES,
  CLAUDE_CODE_USER_AGENT,
  CLAUDE_CODE_X_APP,
  isCredentialExpired,
} from './claudeCodeAuth';
import { AnthropicGenericProvider, hashAnthropicCacheValue } from './generic';
import {
  ANTHROPIC_MODELS,
  calculateAnthropicCost,
  clampMaxTokensForThinkingBudget,
  claudeThinkingConsumesTokens,
  getClaudeModelWarningName,
  getFileReferences,
  getRefusalDetails,
  getTokenUsage,
  isAlwaysOnAdaptiveThinkingClaudeModel,
  isBetweenToolsLowestThinkingClaudeModel,
  isClaudeSonnet55Model,
  isClaudeThinkingEnabled,
  isDisabledThinkingRejectedAtEffort,
  isForcedToolChoiceUnsupportedClaudeModel,
  isSamplingParamsDeprecatedClaudeModel,
  normalizeAnthropicModelName,
  normalizeClaudeThinkingConfig,
  outputFromMessage,
  parseMessages,
  processAnthropicTools,
  resolveClaudeSamplingParams,
} from './util';
import type Anthropic from '@anthropic-ai/sdk';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { McpToolCallEntry } from '../mcp/types';
import type { AnthropicMessageOptions, ClaudeEffort, ClaudeThinkingConfig } from './types';

const DEFAULT_MAX_MCP_TOOL_CALLS = 8;
// Each resume re-sends the turn so far, so a pausing run stops after this many.
const MAX_PAUSE_TURN_RESUMES = 5;

type AnthropicMessageStream = {
  finalMessage(): Promise<Anthropic.Messages.Message>;
  on?(
    event: 'streamEvent',
    listener: (event: Anthropic.Messages.MessageStreamEvent) => void,
  ): unknown;
};

async function finalMessageWithStreamedStopDetails(
  stream: AnthropicMessageStream,
): Promise<Anthropic.Messages.Message> {
  let streamedStopDetails: Anthropic.Messages.RefusalStopDetails | null | undefined;

  stream.on?.('streamEvent', (event) => {
    if (event.type === 'message_delta' && event.delta.stop_details != null) {
      streamedStopDetails = event.delta.stop_details;
    }
  });

  const finalMessage = await stream.finalMessage();
  return finalMessage.stop_details == null && streamedStopDetails != null
    ? { ...finalMessage, stop_details: streamedStopDetails }
    : finalMessage;
}

function parseEnvFloat(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeHeadersForCacheKey(headers: Record<string, string>) {
  if (Object.keys(headers).length === 0) {
    return undefined;
  }

  return Object.entries(headers)
    .map(([name, value]) => ({
      name: name.toLowerCase(),
      valueHash: hashAnthropicCacheValue(value),
    }))
    .sort((headerA, headerB) => {
      const nameComparison = headerA.name.localeCompare(headerB.name);
      return nameComparison === 0
        ? headerA.valueHash.localeCompare(headerB.valueHash)
        : nameComparison;
    });
}

function getMessagesRequestMetadata(params: Anthropic.Messages.MessageCreateParams) {
  const mcpServers = (params as { mcp_servers?: unknown }).mcp_servers;
  return {
    model: params.model,
    max_tokens: params.max_tokens,
    messageCount: params.messages.length,
    stream: params.stream,
    temperature: params.temperature,
    hasSystem: params.system !== undefined,
    stopSequenceCount: Array.isArray(params.stop_sequences)
      ? params.stop_sequences.length
      : undefined,
    thinkingEnabled: isClaudeThinkingEnabled(params.thinking),
    toolCount: Array.isArray(params.tools) ? params.tools.length : undefined,
    hasToolChoice: params.tool_choice !== undefined,
    hasMetadata: params.metadata !== undefined,
    hasMcpServers: Array.isArray(mcpServers) && mcpServers.length > 0,
    hasOutputConfig: params.output_config !== undefined,
  };
}

function getMessagesResponseMetadata(response: Anthropic.Messages.Message) {
  return {
    model: response.model,
    type: response.type,
    contentBlockCount: Array.isArray(response.content) ? response.content.length : undefined,
    stopReason: response.stop_reason,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    cacheReadInputTokens: response.usage?.cache_read_input_tokens,
    cacheCreationInputTokens: response.usage?.cache_creation_input_tokens,
  };
}

function getMaxMcpToolCalls(config: AnthropicMessageOptions): number {
  if (config.max_tool_calls == null) {
    return DEFAULT_MAX_MCP_TOOL_CALLS;
  }

  // Negative or non-finite values are invalid and fall back to the default;
  // 0 is honored as an explicit "disable automatic MCP tool execution" setting.
  if (!Number.isFinite(config.max_tool_calls) || config.max_tool_calls < 0) {
    return DEFAULT_MAX_MCP_TOOL_CALLS;
  }

  return Math.floor(config.max_tool_calls);
}

function getMcpContinuationParams(
  params: Anthropic.Messages.MessageCreateParams,
  messages: Anthropic.Messages.MessageCreateParams['messages'],
): Anthropic.Messages.MessageCreateParams {
  if (params.tool_choice?.type === 'any' || params.tool_choice?.type === 'tool') {
    const { tool_choice: _toolChoice, ...continuationParams } = params;
    return { ...continuationParams, messages };
  }

  return { ...params, messages };
}

/** Reuse the turn's container unless the caller pinned a different one. */
function withTurnContainer(
  params: Anthropic.Messages.MessageCreateParams,
  responses: Anthropic.Messages.Message[],
): Anthropic.Messages.MessageCreateParams {
  const requested = params.container;
  if (typeof requested === 'string' || requested?.id != null) {
    return params;
  }
  for (let i = responses.length - 1; i >= 0; i--) {
    const container = responses[i].container;
    if (container) {
      return {
        ...params,
        container: requested ? { ...requested, id: container.id } : container.id,
      };
    }
  }
  return params;
}

function coerceMcpToolInput(input: unknown): Record<string, unknown> {
  if (input == null || input === '') {
    return {};
  }
  if (typeof input === 'string') {
    const parsed = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  }
  return typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function mergeAnthropicUsage(
  messages: Anthropic.Messages.Message[],
): Anthropic.Messages.Message['usage'] | undefined {
  const usageEntries = messages.map((message) => message.usage).filter((usage) => usage != null);

  if (usageEntries.length === 0) {
    return undefined;
  }

  const [firstUsage, ...remainingUsageEntries] = usageEntries;

  return remainingUsageEntries.reduce<NonNullable<Anthropic.Messages.Message['usage']>>(
    (acc, usage) => ({
      ...usage,
      input_tokens: acc.input_tokens + (usage.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (usage.output_tokens ?? 0),
      cache_creation_input_tokens:
        (acc.cache_creation_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
      cache_creation:
        acc.cache_creation || usage.cache_creation
          ? {
              ephemeral_5m_input_tokens:
                (acc.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
                (usage.cache_creation?.ephemeral_5m_input_tokens ?? 0),
              ephemeral_1h_input_tokens:
                (acc.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
                (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0),
            }
          : null,
      cache_read_input_tokens:
        (acc.cache_read_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      output_tokens_details:
        acc.output_tokens_details || usage.output_tokens_details
          ? {
              thinking_tokens:
                (acc.output_tokens_details?.thinking_tokens ?? 0) +
                (usage.output_tokens_details?.thinking_tokens ?? 0),
            }
          : null,
    }),
    firstUsage,
  );
}

function withMergedAnthropicUsage(
  response: Anthropic.Messages.Message,
  responses: Anthropic.Messages.Message[],
): Anthropic.Messages.Message {
  const usage = mergeAnthropicUsage(responses);
  return usage ? { ...response, usage } : response;
}

/** The fields that price one Messages API request. */
type BilledCall = Pick<Anthropic.Messages.Message, 'stop_details' | 'stop_reason' | 'usage'>;

// Price each request separately, including unbilled refusals. Structured output uses
// the final response's text rather than any preamble from a paused response.
type CachedAnthropicMessage = Anthropic.Messages.Message & {
  billedCalls?: BilledCall[];
  finalText?: string;
  fileReferences?: ReturnType<typeof getFileReferences>;
};

function toCachedMessage(
  message: Anthropic.Messages.Message,
  responses: Anthropic.Messages.Message[],
): CachedAnthropicMessage {
  if (responses.length === 1) {
    return message;
  }
  return {
    ...message,
    fileReferences: responses.flatMap((response) => response.content.flatMap(getFileReferences)),
    finalText: responses[responses.length - 1].content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(''),
    billedCalls: responses.map(({ stop_details, stop_reason, usage }) => ({
      stop_details,
      stop_reason,
      usage,
    })),
  };
}

export class AnthropicMessagesProvider extends AnthropicGenericProvider {
  declare config: AnthropicMessageOptions;

  protected calculateMessageCost(
    config: AnthropicMessageOptions,
    message: BilledCall,
    modelName = this.modelName,
  ): number | undefined {
    // Since September 24, 2026, only these categories bill refusals before any output.
    if (
      message.stop_reason === 'refusal' &&
      message.usage?.output_tokens === 0 &&
      !['bio', 'frontier_llm', 'reasoning_extraction'].includes(
        message.stop_details?.category ?? '',
      )
    ) {
      return 0;
    }
    return calculateAnthropicCost(
      modelName,
      config,
      message.usage?.input_tokens,
      message.usage?.output_tokens,
      message.usage?.cache_read_input_tokens ?? undefined,
      message.usage?.cache_creation_input_tokens ?? undefined,
      message.usage?.cache_creation?.ephemeral_1h_input_tokens ?? undefined,
      message.usage?.inference_geo,
    );
  }

  private calculateMessageCosts(
    config: AnthropicMessageOptions,
    calls: BilledCall[],
  ): number | undefined {
    return calls.reduce<number | undefined>((total, call) => {
      const callCost = this.calculateMessageCost(config, call);
      return total != null && callCost != null ? total + callCost : undefined;
    }, 0);
  }

  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private samplingParamsDeprecationWarned = false;
  private manualThinkingConversionWarned = false;
  private disabledThinkingRemovalWarned = false;

  // Messages is the only Anthropic subclass wired to Claude Code OAuth —
  // the legacy text-completion endpoint does not accept OAuth tokens.
  static override readonly SUPPORTS_CLAUDE_CODE_OAUTH: boolean = true;

  static ANTHROPIC_MODELS = ANTHROPIC_MODELS;

  static ANTHROPIC_MODELS_NAMES = ANTHROPIC_MODELS.map((model) => model.id);

  // Subclasses that serve non-Anthropic model catalogs over the Messages wire
  // format (e.g. Meta's Anthropic-compatible endpoint) set this to false so
  // their model ids don't trigger the unknown-Anthropic-model warning.
  static readonly WARNS_ON_UNKNOWN_MODEL: boolean = true;

  constructor(
    modelName: string,
    options: {
      id?: string;
      label?: string;
      config?: AnthropicMessageOptions;
      env?: EnvOverrides;
    } = {},
  ) {
    super(modelName, options);
    if (
      (this.constructor as typeof AnthropicMessagesProvider).WARNS_ON_UNKNOWN_MODEL &&
      !AnthropicMessagesProvider.ANTHROPIC_MODELS_NAMES.includes(
        normalizeAnthropicModelName(modelName),
      )
    ) {
      logger.warn(`Using unknown Anthropic model: ${modelName}`);
    }
    const { id } = options;
    this.id = id ? () => id : this.id;

    // Start initialization if MCP is enabled
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

  /** Resume paused server-tool turns, retaining each request for usage and cost. */
  private async sendMessage(
    params: Anthropic.Messages.MessageCreateParams,
    headers: Record<string, string>,
    shouldStream: boolean,
    responses: Anthropic.Messages.Message[],
    signal?: AbortSignal,
  ): Promise<Anthropic.Messages.Message> {
    const requestOptions = {
      ...(Object.keys(headers).length > 0 && { headers }),
      ...(signal && { signal }),
    };
    const send = async (requestParams: Anthropic.Messages.MessageCreateParams) => {
      signal?.throwIfAborted();
      requestParams = withTurnContainer(requestParams, responses);
      const message = shouldStream
        ? await finalMessageWithStreamedStopDetails(
            await this.anthropic.messages.stream(requestParams, requestOptions),
          )
        : ((await this.anthropic.messages.create(
            requestParams,
            requestOptions,
          )) as Anthropic.Messages.Message);
      logger.debug('Anthropic Messages API response', {
        response: getMessagesResponseMetadata(message),
      });
      responses.push(message);
      return message;
    };

    let message = await send(params);
    if (message.stop_reason !== 'pause_turn') {
      return message;
    }
    let turnContent = message.content;
    for (let resumes = 0; message.stop_reason === 'pause_turn'; resumes++) {
      if (resumes === MAX_PAUSE_TURN_RESUMES) {
        logger.warn(
          `Claude's turn was still paused (stop_reason: pause_turn) after ${MAX_PAUSE_TURN_RESUMES} resumes, so the output may be incomplete. Lower the tool max_uses or split the task.`,
        );
        break;
      }
      try {
        message = await send({
          ...params,
          messages: [
            ...params.messages,
            {
              role: 'assistant',
              content: turnContent as Anthropic.Messages.ContentBlockParam[],
            },
          ],
        });
      } catch (err) {
        signal?.throwIfAborted();
        // Keep the paused output rather than failing a row that already has a partial answer.
        logger.warn(
          `Could not resume a paused Claude turn, so the output may be incomplete: ${err instanceof Error ? err.message : String(err)}`,
        );
        break;
      }
      turnContent = [...turnContent, ...message.content];
    }
    return { ...message, content: turnContent };
  }

  private async resolveMcpToolUse({
    config,
    headers,
    initialResponse,
    params,
    responses,
    shouldStream,
    signal,
  }: {
    config: AnthropicMessageOptions;
    headers: Record<string, string>;
    initialResponse: Anthropic.Messages.Message;
    params: Anthropic.Messages.MessageCreateParams;
    /** Every API call made so far, for usage and cost. */
    responses: Anthropic.Messages.Message[];
    shouldStream: boolean;
    signal?: AbortSignal;
  }): Promise<{
    error?: string;
    response: Anthropic.Messages.Message;
    responses: Anthropic.Messages.Message[];
    toolCalls: McpToolCallEntry[];
  }> {
    // Every return below carries `toolCalls`, including the bail-out paths: a run that
    // trips max_tool_calls or mixes MCP and non-MCP blocks is exactly when you want to
    // see which tools did run.
    const toolCalls: McpToolCallEntry[] = [];
    const unchanged = () => ({
      response: withMergedAnthropicUsage(initialResponse, responses),
      responses,
      toolCalls,
    });

    if (!this.mcpClient) {
      return unchanged();
    }

    const mcpToolNames = new Set(this.mcpClient.getAllTools().map((tool) => tool.name));
    if (mcpToolNames.size === 0) {
      return unchanged();
    }

    const maxToolCalls = getMaxMcpToolCalls(config);
    if (maxToolCalls === 0) {
      // max_tool_calls: 0 explicitly disables automatic MCP tool execution.
      // Return the model's initial response (which may contain tool_use
      // blocks) unchanged rather than treating unexecuted tools as an error.
      return unchanged();
    }

    let response = initialResponse;
    let messages = params.messages;
    let executedMcpToolCalls = 0;

    for (let iteration = 0; iteration < maxToolCalls; iteration++) {
      signal?.throwIfAborted();
      const responseToolUses = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      );
      const toolUses = responseToolUses.filter((block) => mcpToolNames.has(block.name));

      if (toolUses.length === 0) {
        return { response: withMergedAnthropicUsage(response, responses), responses, toolCalls };
      }

      if (toolUses.length !== responseToolUses.length) {
        logger.warn(
          'Skipping Anthropic MCP continuation because the response mixes MCP and non-MCP tool_use blocks.',
        );
        return { response: withMergedAnthropicUsage(response, responses), responses, toolCalls };
      }

      if (executedMcpToolCalls + toolUses.length > maxToolCalls) {
        return {
          response: withMergedAnthropicUsage(response, responses),
          responses,
          error: `Anthropic MCP tool execution exceeded max_tool_calls=${maxToolCalls}. Increase provider config.max_tool_calls if this evaluation legitimately needs more tool calls.`,
          toolCalls,
        };
      }

      executedMcpToolCalls += toolUses.length;
      const toolResultBlocks = await Promise.all(
        toolUses.map((toolUse) => this.callMcpToolForAnthropic(toolUse)),
      );

      toolUses.forEach((toolUse, index) => {
        const resultBlock = toolResultBlocks[index];
        toolCalls.push({
          id: toolUse.id,
          name: toolUse.name,
          input: coerceMcpToolInput(toolUse.input),
          output: resultBlock.content,
          is_error: resultBlock.is_error ?? false,
        });
      });

      messages = [
        ...messages,
        {
          role: 'assistant',
          content: response.content as Anthropic.Messages.ContentBlockParam[],
        },
        {
          role: 'user',
          content: toolResultBlocks,
        },
      ];

      response = await this.sendMessage(
        getMcpContinuationParams(params, messages),
        headers,
        shouldStream,
        responses,
        signal,
      );
    }

    const unresolvedToolUses = response.content.filter(
      (block) => block.type === 'tool_use' && mcpToolNames.has(block.name),
    );

    return {
      response: withMergedAnthropicUsage(response, responses),
      responses,
      toolCalls,
      ...(unresolvedToolUses.length > 0
        ? {
            error: `Anthropic MCP tool execution exceeded max_tool_calls=${maxToolCalls}. Increase provider config.max_tool_calls if this evaluation legitimately needs more tool calls.`,
          }
        : {}),
    };
  }

  private async callMcpToolForAnthropic(
    toolUse: Anthropic.Messages.ToolUseBlock,
  ): Promise<Anthropic.Messages.ToolResultBlockParam> {
    try {
      const result = await this.mcpClient!.callTool(
        toolUse.name,
        coerceMcpToolInput(toolUse.input),
      );

      if (isMcpErrorResult(result)) {
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `MCP Tool Error (${toolUse.name}): ${getMcpErrorMessage(result)}`,
          is_error: true,
        };
      }

      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: normalizeMcpToolContent(result.content),
      };
    } catch (error) {
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `MCP Tool Error (${toolUse.name}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        is_error: true,
      };
    }
  }

  toString(): string {
    if (!this.modelName) {
      throw new Error('Anthropic model name is not set. Please provide a valid model name.');
    }
    return `[Anthropic Messages Provider ${this.modelName}]`;
  }

  // The `gen_ai.provider.name` span attribute. Subclasses serving a different vendor
  // through the Anthropic wire format override this so traces attribute to the
  // actual provider system.
  protected getGenAISystem(): string {
    return 'anthropic';
  }

  protected sanitizeRequestHeaders(headers: Record<string, string>): Record<string, string> {
    return headers;
  }

  // Compatible gateways can assign arbitrary model aliases. Dedicated passthrough providers
  // may override this when they guarantee requests reach Anthropic without alias translation.
  protected allowsClaudeGenerationFallback(): boolean {
    return (
      URL.canParse(this.anthropic.baseURL) &&
      new URL(this.anthropic.baseURL).hostname.toLowerCase() === 'api.anthropic.com'
    );
  }

  /** Adapters with transport-managed authentication can defer validation to HTTP dispatch. */
  protected validateAuthentication(): void {
    if (!this.apiKey && !this.usingClaudeCodeOAuth) {
      throw new Error(
        'Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add `apiKey` to the provider config. ' +
          'Alternatively, if you have an active Claude Code session, set `apiKeyRequired: false` in the provider config to authenticate via Claude Code.',
      );
    }
  }

  /** Independent of authentication: adapters decide whether their response cache is safe. */
  protected shouldCacheResponses(): boolean {
    return true;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (options?.abortSignal?.aborted) {
      return { error: 'Operation aborted' };
    }
    // Wait for MCP initialization if it's in progress
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }

    this.validateAuthentication();

    // Re-check expiry at request time so we fail with an actionable message
    // ("run `claude /login`") instead of a raw 401 from the SDK. The
    // constructor already warned on expiry, but that log is easy to miss in
    // long eval runs where the provider is built minutes before the first
    // call. Credentials without an `expiresAt` are treated as non-expired.
    if (
      this.usingClaudeCodeOAuth &&
      this.claudeCodeCredential &&
      isCredentialExpired(this.claudeCodeCredential)
    ) {
      throw new Error(
        'Claude Code OAuth credential is expired. Run `claude /login` to refresh it, then re-run the eval.',
      );
    }

    if (!this.modelName) {
      throw new Error('Anthropic model name is not set. Please provide a valid model name.');
    }

    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: this.getGenAISystem(),
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      // Optional request parameters
      maxTokens: this.config.max_tokens,
      temperature: this.config.temperature,
      // Promptfoo context from test case if available
      testIndex: context?.testIdx ?? (context?.test?.vars?.__testIdx as number | undefined),
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
          completionDetails: response.tokenUsage.completionDetails,
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
      () => this.callApiInternal(prompt, context, options),
      resultExtractor,
    );
  }

  /**
   * Reconcile a requested thinking config with what the target model actually accepts, and
   * report whether the request will end up thinking.
   *
   * Three model-level rules apply, each verified against the live API:
   * - Manual budget thinking (`type: 'enabled'`) is rejected on adaptive-only models and is
   *   converted to `type: 'adaptive'`.
   * - `type: 'disabled'` is rejected outright on always-on models, and on
   *   Opus 5 when `effort` is `xhigh`/`max`. In both cases it is dropped rather than sent.
   * - On Opus 5 and Sonnet 5 an *omitted* thinking config still runs adaptive thinking, so it
   *   consumes output tokens — callers size the default `max_tokens` off this, and treating it
   *   as disabled truncates responses mid-answer.
   *
   * Warnings are emitted at most once per provider instance.
   */
  private resolveModelThinking(
    requested: ClaudeThinkingConfig | undefined,
    effort: ClaudeEffort | undefined,
    flags: {
      samplingParamsDeprecated: boolean;
      alwaysOnAdaptiveThinking: boolean;
      modelWarningName: string;
    },
  ): {
    thinking: ClaudeThinkingConfig | undefined;
    /**
     * Thinking was explicitly turned on (or is always on). Callers combine this with
     * model sampling capabilities before applying legacy extended-thinking restrictions.
     */
    thinkingEnabled: boolean;
    /**
     * Thinking will consume output tokens, including the Opus 5 / Sonnet 5 case where an omitted
     * `thinking` field still runs adaptive. Only used to size the default `max_tokens`:
     * a request that thinks by default needs headroom or it truncates mid-answer.
     */
    thinkingConsumesTokens: boolean;
  } {
    const { samplingParamsDeprecated, alwaysOnAdaptiveThinking, modelWarningName } = flags;

    if ((samplingParamsDeprecated || alwaysOnAdaptiveThinking) && requested?.type === 'enabled') {
      if (!this.manualThinkingConversionWarned) {
        logger.warn(
          alwaysOnAdaptiveThinking
            ? `Adaptive thinking is always on for ${modelWarningName}. Manual thinking budgets have been removed; use effort to control reasoning depth.`
            : `Manual extended thinking (thinking.type "enabled") is not supported on ${modelWarningName} and has been converted to adaptive thinking. Use thinking: { type: "adaptive" } with effort to control reasoning depth.`,
        );
        this.manualThinkingConversionWarned = true;
      }
    } else if (requested?.type === 'disabled' && !this.disabledThinkingRemovalWarned) {
      const betweenTools = isBetweenToolsLowestThinkingClaudeModel(this.modelName);
      if (alwaysOnAdaptiveThinking) {
        logger.warn(
          `Adaptive thinking is always on for ${modelWarningName}. thinking.type "disabled" has been omitted.`,
        );
        this.disabledThinkingRemovalWarned = true;
      } else if (isDisabledThinkingRejectedAtEffort(this.modelName, effort)) {
        logger.warn(
          `${modelWarningName} only accepts thinking.type "${betweenTools ? 'between_tools' : 'disabled'}" at effort "high" or below (got "${effort}"), so thinking.type "disabled" has been omitted. Lower effort to "high" if you need thinking off.`,
        );
        this.disabledThinkingRemovalWarned = true;
      } else if (betweenTools) {
        logger.warn(
          `${modelWarningName} does not accept thinking.type "disabled", so it has been sent as "between_tools", the model's lowest setting, which turns off up-front thinking. Set thinking.type "between_tools" to silence this warning.`,
        );
        this.disabledThinkingRemovalWarned = true;
      }
    } else if (
      requested?.type === 'between_tools' &&
      !this.disabledThinkingRemovalWarned &&
      isBetweenToolsLowestThinkingClaudeModel(this.modelName) &&
      isDisabledThinkingRejectedAtEffort(this.modelName, effort)
    ) {
      logger.warn(
        `${modelWarningName} only accepts thinking.type "between_tools" at effort "high" or below (got "${effort}"), so it has been omitted and the model thinks adaptively. Lower effort to "high" to turn off up-front thinking.`,
      );
      this.disabledThinkingRemovalWarned = true;
    }

    const resolved = normalizeClaudeThinkingConfig(this.modelName, requested, effort, {
      allowGenerationFallback: samplingParamsDeprecated,
    });
    const thinkingEnabled = alwaysOnAdaptiveThinking || isClaudeThinkingEnabled(resolved);
    // Deliberately NOT folded into thinkingEnabled: adaptive thinking is compatible with a
    // forced tool_choice (verified against the live API on Opus 5 and Opus 4.8), so treating
    // thinks-by-default as "thinking enabled" would silently drop a user's tool_choice.
    const thinkingConsumesTokens = claudeThinkingConsumesTokens(this.modelName, resolved);
    return { thinking: resolved, thinkingEnabled, thinkingConsumesTokens };
  }

  /**
   * Build the ProviderResponse for a completed Anthropic message.
   *
   * Shared by the cache-hit and fresh-call paths, which are otherwise identical. `cached`
   * drives the only three differences: token usage is attributed to the cache, the refusal
   * warning is suppressed (it was already logged when the response was first fetched), and
   * the `cached` marker is set. Keeping one builder is what stops the two paths drifting —
   * they have diverged before, which is why the cached-refusal regression test exists.
   */
  private buildMessageResponse(
    message: CachedAnthropicMessage,
    config: AnthropicMessageOptions,
    processedOutputFormat: { type?: string } | undefined,
    cached: boolean,
  ): ProviderResponse {
    const finishReason = normalizeFinishReason(message.stop_reason);
    let output = outputFromMessage(message, config.showThinking ?? true);
    const isStructuredOutput = processedOutputFormat?.type === 'json_schema';
    const fileReferences = message.fileReferences ?? message.content.flatMap(getFileReferences);

    if (isStructuredOutput) {
      // Parse completed JSON text, keeping file references in metadata and unfinished
      // tool turns in output so callers can still inspect them.
      const hasPendingTools =
        message.stop_reason === 'pause_turn' ||
        message.content.some((block) => block.type === 'tool_use');
      const text = hasPendingTools
        ? ''
        : (message.finalText ??
          message.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join(''));
      try {
        output = JSON.parse(text || output);
      } catch (error) {
        logger.error(`Failed to parse JSON output from structured outputs: ${error}`);
      }
    }

    const refusalDetails = getRefusalDetails(message);
    if (refusalDetails && !cached) {
      logger.warn(refusalDetails);
    }

    return {
      output,
      ...(fileReferences.length > 0 && { metadata: { fileReferences } }),
      tokenUsage: getTokenUsage(message, cached),
      ...(finishReason && { finishReason }),
      ...(refusalDetails && { guardrails: { flagged: true, reason: refusalDetails } }),
      cost: this.calculateMessageCosts(config, message.billedCalls ?? [message]),
      ...(cached && { cached: true }),
    };
  }

  /**
   * Internal implementation of callApi without tracing wrapper.
   */
  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Merge configs from the provider and the prompt
    const config: AnthropicMessageOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const { system, extractedMessages, thinking } = parseMessages(prompt);

    // Get MCP tools if client is initialized
    let mcpTools: Anthropic.Tool[] = [];
    if (this.mcpClient) {
      mcpTools = transformMCPToolsToAnthropic(this.mcpClient.getAllTools());
    }

    // Load and process tools from config (handles both external files and inline tool definitions)
    const loadedTools = (await maybeLoadToolsFromExternalFile(config.tools, context?.vars)) || [];
    // Transform tools to Anthropic format if needed
    const configTools = transformTools(loadedTools, 'anthropic') as typeof loadedTools;
    const { processedTools: processedConfigTools, requiredBetaFeatures } =
      processAnthropicTools(configTools);

    // Combine all tools
    const allTools = [...mcpTools, ...processedConfigTools];

    // Process output_format with external file loading and variable rendering
    const processedOutputFormat = maybeLoadResponseFormatFromExternalFile(
      config.output_format,
      context?.vars,
    );

    // Newer Claude models are adaptive-only — manual budget-based thinking
    // (`thinking: { type: 'enabled', budget_tokens }`) returns a 400. Translate a
    // migrated Opus 4.6 config to adaptive thinking so it keeps working; effort
    // controls reasoning depth on these models.
    const samplingParamsDeprecated = isSamplingParamsDeprecatedClaudeModel(this.modelName, {
      allowGenerationFallback: this.allowsClaudeGenerationFallback(),
    });
    const alwaysOnAdaptiveThinking = isAlwaysOnAdaptiveThinkingClaudeModel(this.modelName);
    const modelWarningName = getClaudeModelWarningName(this.modelName) ?? 'this Claude model';
    const {
      thinking: resolvedThinking,
      thinkingEnabled,
      thinkingConsumesTokens,
    } = this.resolveModelThinking(
      // Provider config wins over a thinking block embedded in the prompt.
      config.thinking ?? thinking,
      config.effort,
      { samplingParamsDeprecated, alwaysOnAdaptiveThinking, modelWarningName },
    );

    // Legacy budget-based thinking and Fable/Mythos 5.1 reject forced tool use.
    // Earlier adaptive models, including Fable 5, accept forced choices. Do not gate
    // this on thinkingEnabled: doing so would silently change their tool-routing evals.
    const modelRejectsForcedToolChoice = isForcedToolChoiceUnsupportedClaudeModel(this.modelName);
    const forcedToolChoiceRejected =
      resolvedThinking?.type === 'enabled' || modelRejectsForcedToolChoice;
    let resolvedToolChoice: Anthropic.Messages.ToolChoice | undefined;
    if (config.tool_choice) {
      const transformed = transformToolChoice(
        config.tool_choice,
        'anthropic',
      ) as Anthropic.Messages.ToolChoice;
      if (forcedToolChoiceRejected && (transformed.type === 'any' || transformed.type === 'tool')) {
        logger.warn(
          modelRejectsForcedToolChoice
            ? `tool_choice type '${transformed.type}' (forced tool use) is not supported on ${modelWarningName} and will be omitted. Use 'auto' or 'none' instead.`
            : `tool_choice type '${transformed.type}' (forced tool use) is incompatible with extended thinking and will be omitted. Use 'auto' or remove tool_choice.`,
        );
      } else {
        resolvedToolChoice = transformed;
      }
    }

    const envTemperature = parseEnvFloat(
      this.env?.ANTHROPIC_TEMPERATURE ?? getEnvString('ANTHROPIC_TEMPERATURE'),
    );
    // The rules Claude enforces for temperature, top_p, top_k, and thinking live in one helper
    // shared with the Vertex and Bedrock paths.
    const { sampling, warnings: samplingWarnings } = resolveClaudeSamplingParams(config, {
      thinkingEnabled,
      samplingParamsDeprecated,
      defaultTemperature: envTemperature ?? 0,
    });
    for (const warning of samplingWarnings) {
      logger.warn(warning);
    }

    // Newer Claude models deprecate manual sampling controls at the model level —
    // `temperature`, `top_p`, and `top_k` are adaptive, and pinning any of them
    // returns 400 `invalid_request_error` (including promptfoo's built-in
    // `temperature` default of 0). Suppress all three and warn once per provider
    // instance when the user supplied any of them via config or the
    // ANTHROPIC_TEMPERATURE env var (the built-in default stays silent to avoid
    // spamming every request).
    const explicitSamplingParam =
      config.temperature != null ||
      config.top_p != null ||
      config.top_k != null ||
      envTemperature != null;
    if (
      samplingParamsDeprecated &&
      explicitSamplingParam &&
      !this.samplingParamsDeprecationWarned
    ) {
      logger.warn(
        alwaysOnAdaptiveThinking
          ? `temperature, top_p, and top_k are not supported on ${modelWarningName} and will be omitted. Remove these sampling parameters from your config (or unset ANTHROPIC_TEMPERATURE) to silence this warning.`
          : `temperature is deprecated on ${modelWarningName} and will be omitted (along with top_p and top_k). Remove these sampling parameters from your config (or unset ANTHROPIC_TEMPERATURE) to silence this warning.`,
      );
      this.samplingParamsDeprecationWarned = true;
    }

    // When authenticating via a Claude Code OAuth token, Anthropic's API
    // requires the Claude Code identity as the first system block — as of
    // 2025-Q4, sending any other leading system block returns HTTP 400
    // `invalid_request_error`. Prepend it as its own block so the
    // user-provided system prompt still flows through. If the user's own
    // system prompt happens to start with the same string the API tolerates
    // the duplicate.
    const resolvedSystem: Anthropic.TextBlockParam[] | undefined = this.usingClaudeCodeOAuth
      ? [{ type: 'text', text: CLAUDE_CODE_IDENTITY_PROMPT }, ...(system ?? [])]
      : system;

    const shouldStream = config.stream ?? false;
    const params: Anthropic.MessageCreateParams = {
      model: this.modelName,
      ...(resolvedSystem && resolvedSystem.length > 0 ? { system: resolvedSystem } : {}),
      // resolvedThinking, not the raw config: a sampling-deprecated model has already had
      // its manual budget converted to adaptive, and there is nothing left to clamp against.
      max_tokens: clampMaxTokensForThinkingBudget(
        config.max_tokens ??
          getEnvInt('ANTHROPIC_MAX_TOKENS', thinkingConsumesTokens ? 2048 : 1024),
        resolvedThinking,
      ),
      messages: extractedMessages,
      stream: shouldStream,
      ...sampling,
      ...(config.cache_control ? { cache_control: config.cache_control } : {}),
      ...(config.service_tier ? { service_tier: config.service_tier } : {}),
      ...(config.stop_sequences?.length ? { stop_sequences: config.stop_sequences } : {}),
      ...(config.metadata ? { metadata: config.metadata } : {}),
      ...(allTools.length > 0 ? { tools: allTools as any } : {}),
      ...(resolvedToolChoice ? { tool_choice: resolvedToolChoice } : {}),
      // The pinned SDK forwards between_tools unchanged but does not yet type it.
      ...(resolvedThinking
        ? { thinking: resolvedThinking as Anthropic.Messages.ThinkingConfigParam }
        : {}),
      ...(processedOutputFormat || config.effort
        ? {
            output_config: {
              ...(processedOutputFormat ? { format: processedOutputFormat } : {}),
              ...(config.effort ? { effort: config.effort } : {}),
            } as Anthropic.Messages.OutputConfig,
          }
        : {}),
      ...(typeof config?.extra_body === 'object' && config.extra_body ? config.extra_body : {}),
    };

    logger.debug('Calling Anthropic Messages API', {
      params: getMessagesRequestMetadata(params),
    });

    const headers = this.sanitizeRequestHeaders({ ...(config.headers || {}) });

    // Add beta features header if specified
    let allBetaFeatures = [...(config.beta || []), ...requiredBetaFeatures];

    // Merge any `anthropic-beta` the user passed via `config.headers` so it
    // isn't silently dropped when we rebuild the header below. The SDK
    // accepts a comma-separated list, so we split, trim, and dedupe.
    const userBetaHeader = config.headers?.['anthropic-beta'];
    if (typeof userBetaHeader === 'string' && userBetaHeader.length > 0) {
      allBetaFeatures.push(
        ...userBetaHeader
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      );
    }

    // Automatically add structured-outputs beta when output_format is used
    if (processedOutputFormat && !allBetaFeatures.includes('structured-outputs-2025-11-13')) {
      allBetaFeatures.push('structured-outputs-2025-11-13');
    }

    // Claude Code OAuth tokens require additional beta flags. These are also
    // set as default SDK headers by the generic provider, but we merge them
    // into per-request headers as well so explicit `config.headers` or
    // `config.beta` entries don't drop them.
    if (this.usingClaudeCodeOAuth) {
      allBetaFeatures.push(...CLAUDE_CODE_OAUTH_BETA_FEATURES);
    }

    // Deduplicate beta features
    allBetaFeatures = [...new Set(allBetaFeatures)];

    if (allBetaFeatures.length > 0) {
      headers['anthropic-beta'] = allBetaFeatures.join(',');
    }

    // Force the Claude Code identity headers when authenticating via OAuth.
    // These are also set on the SDK client as `defaultHeaders`, but per-request
    // `headers` override those, so a user-supplied `config.headers['user-agent']`
    // (or `x-app`) would otherwise break OAuth — Anthropic gates OAuth tokens
    // to the Claude Code app identity and responds with 401 if either header
    // doesn't match.
    if (this.usingClaudeCodeOAuth) {
      headers['user-agent'] = CLAUDE_CODE_USER_AGENT;
      headers['x-app'] = CLAUDE_CODE_X_APP;
    }

    const shouldUseResponseCache =
      isCacheEnabled() &&
      config.mcp?.enabled !== true &&
      this.shouldCacheResponses() &&
      !this.hasCustomHeaders() &&
      Object.keys(config.headers ?? {}).length === 0;
    const cache = shouldUseResponseCache ? await getCache() : undefined;
    const { metadata: _metadata, ...cacheKeyParams } = params;
    const cacheKeyHeaders = normalizeHeadersForCacheKey(headers);
    const cacheKey = shouldUseResponseCache
      ? `anthropic:messages:${this.modelName}:${this.getCacheIdentityHash()}:${this.getCacheNamespace()}:${hashAnthropicCacheValue(
          {
            ...cacheKeyParams,
            ...(cacheKeyHeaders ? { headers: cacheKeyHeaders } : {}),
          },
        )}`
      : undefined;
    const ephemeralCacheKey = cacheKey ? getScopedCacheKey(cacheKey) : undefined;
    const cacheClearGeneration = getCacheClearGeneration();

    if (cache && cacheKey && ephemeralCacheKey) {
      // Try to get the cached response
      const cachedResponse = await this.getCachedResponse(
        cache,
        cacheKey,
        ephemeralCacheKey,
        cacheClearGeneration,
      );
      if (cachedResponse) {
        try {
          // Stays inside this try: the catch below is the legacy plain-string cache fallback,
          // and it must keep covering parse/format failures from the whole build.
          const cachedMessage = JSON.parse(cachedResponse) as CachedAnthropicMessage;
          if (cachedMessage.stop_reason !== 'pause_turn') {
            logger.debug('Returning cached Anthropic Messages response', { model: this.modelName });
            return this.buildMessageResponse(cachedMessage, config, processedOutputFormat, true);
          }
        } catch {
          // Could be an old cache item, which was just the text content from TextBlock.
          return {
            output: cachedResponse,
            cached: true,
            tokenUsage: createEmptyTokenUsage(),
          };
        }
      }
    }

    const responses: Anthropic.Messages.Message[] = [];
    try {
      const signal = options?.abortSignal;
      const initialMessage = await this.sendMessage(
        params,
        headers,
        shouldStream,
        responses,
        signal,
      );
      signal?.throwIfAborted();

      const {
        error,
        response: resolvedMessage,
        toolCalls,
      } = await this.resolveMcpToolUse({
        config,
        headers,
        initialResponse: initialMessage,
        params,
        responses,
        shouldStream,
        signal,
      });
      const cost = this.calculateMessageCosts(config, responses);

      // Only attach the key when a tool actually ran: an always-present empty array
      // would break downstream filters that test `metadata?.toolCalls?.length > 0`.
      const mcpMetadata = toolCalls.length > 0 ? { toolCalls } : undefined;

      if (error) {
        // max_tool_calls was exceeded — tokens were still spent across the loop,
        // so surface the cost alongside the error so it doesn't disappear from
        // eval cost tracking.
        return {
          error,
          tokenUsage: getTokenUsage(resolvedMessage, false),
          cost,
          ...(mcpMetadata ? { metadata: mcpMetadata } : {}),
        };
      }

      const message = toCachedMessage(resolvedMessage, responses);
      if (cache && cacheKey && ephemeralCacheKey && message.stop_reason !== 'pause_turn') {
        try {
          await this.setCachedResponse(
            cache,
            cacheKey,
            ephemeralCacheKey,
            cacheClearGeneration,
            getCacheTtlMs(),
            JSON.stringify(message),
          );
        } catch (err) {
          logger.error(`Failed to cache response: ${String(err)}`);
        }
      }

      // Sonnet 5.5 returns progress between tool calls in thinking blocks.
      const outputMessage = isClaudeSonnet55Model(this.modelName)
        ? {
            ...message,
            content: [
              ...responses
                .slice(0, -1)
                .flatMap((turn) =>
                  turn.content.filter(
                    (block) => block.type === 'thinking' && !message.content.includes(block),
                  ),
                ),
              ...message.content,
            ],
          }
        : message;
      const response = this.buildMessageResponse(
        outputMessage,
        config,
        processedOutputFormat,
        false,
      );
      return mcpMetadata
        ? { ...response, metadata: { ...response.metadata, ...mcpMetadata } }
        : response;
    } catch (err) {
      logger.error(
        `Anthropic Messages API call error: ${err instanceof Error ? err.message : String(err)}`,
      );
      let error = `API call error: ${err instanceof Error ? err.message : String(err)}`;
      if (err instanceof APIError && err.error) {
        const errorDetails = err.error as { error: { message: string; type: string } };
        error = `API call error: ${errorDetails.error.message}, status ${err.status}, type ${errorDetails.error.type}`;
      }
      const lastResponse = responses[responses.length - 1];
      return {
        error,
        ...(lastResponse
          ? {
              tokenUsage: getTokenUsage(withMergedAnthropicUsage(lastResponse, responses), false),
              cost: this.calculateMessageCosts(config, responses),
            }
          : {}),
      };
    }
  }
}
