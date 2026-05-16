import { APIError } from '@anthropic-ai/sdk';
import { getCache, isCacheEnabled } from '../../cache';
import { getEnvFloat, getEnvInt } from '../../envars';
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
  getRefusalDetails,
  getTokenUsage,
  isClaudeOpus47Model,
  outputFromMessage,
  parseMessages,
  processAnthropicTools,
} from './util';
import type Anthropic from '@anthropic-ai/sdk';

import type { EnvOverrides } from '../../types/env';
import type { CallApiContextParams, ProviderResponse } from '../../types/index';
import type { AnthropicMessageOptions } from './types';

type ProcessedAnthropicTool = ReturnType<typeof processAnthropicTools>['processedTools'][number];

function parseEnvFloat(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function resolveThinkingConfig(
  configThinking: Anthropic.Messages.ThinkingConfigParam | undefined,
  promptThinking: Anthropic.Messages.ThinkingConfigParam | undefined,
): Anthropic.Messages.ThinkingConfigParam | undefined {
  return configThinking ?? promptThinking;
}

function isThinkingEnabled(thinking: Anthropic.Messages.ThinkingConfigParam | undefined): boolean {
  return thinking?.type === 'enabled' || thinking?.type === 'adaptive';
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
    thinkingEnabled: isThinkingEnabled(params.thinking),
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

function warnForThinkingConflicts(config: AnthropicMessageOptions, thinkingEnabled: boolean): void {
  if (!thinkingEnabled) {
    return;
  }
  if (config.top_k != null) {
    logger.warn(
      'top_k is incompatible with extended thinking and will be omitted. Remove top_k from your config or disable thinking.',
    );
  }
  if (config.temperature != null) {
    logger.warn(
      'temperature is incompatible with extended thinking and will be omitted. Remove temperature from your config or disable thinking.',
    );
  }
  if (config.top_p != null && (config.top_p < 0.95 || config.top_p > 1.0)) {
    logger.warn(
      `top_p must be between 0.95 and 1.0 with extended thinking (got ${config.top_p}). Clamping to valid range.`,
    );
  }
}

function resolveToolChoiceForThinking(
  config: AnthropicMessageOptions,
  thinkingEnabled: boolean,
): Anthropic.Messages.ToolChoice | undefined {
  if (!config.tool_choice) {
    return undefined;
  }
  const transformed = transformToolChoice(
    config.tool_choice,
    'anthropic',
  ) as Anthropic.Messages.ToolChoice;
  if (thinkingEnabled && (transformed.type === 'any' || transformed.type === 'tool')) {
    logger.warn(
      `tool_choice type '${transformed.type}' (forced tool use) is incompatible with extended thinking and will be omitted. Use 'auto' or remove tool_choice.`,
    );
    return undefined;
  }
  return transformed;
}

function resolveTopPForThinking(
  config: AnthropicMessageOptions,
  thinkingEnabled: boolean,
): number | undefined {
  if (config.top_p == null) {
    return undefined;
  }
  return thinkingEnabled ? Math.max(0.95, Math.min(1.0, config.top_p)) : config.top_p;
}

function warnForTemperatureWithTopP(
  config: AnthropicMessageOptions,
  resolvedTopP: number | undefined,
  thinkingEnabled: boolean,
): void {
  if (config.temperature != null && resolvedTopP != null && !thinkingEnabled) {
    logger.warn(
      'temperature is incompatible with top_p on Anthropic and will be omitted. Remove one of these parameters.',
    );
  }
}

function resolveSystemBlocks(
  usingClaudeCodeOAuth: boolean,
  system: Anthropic.TextBlockParam[] | undefined,
): Anthropic.TextBlockParam[] | undefined {
  return usingClaudeCodeOAuth
    ? [{ type: 'text', text: CLAUDE_CODE_IDENTITY_PROMPT }, ...(system ?? [])]
    : system;
}

function buildMessagesHeaders({
  config,
  requiredBetaFeatures,
  processedOutputFormat,
  usingClaudeCodeOAuth,
}: {
  config: AnthropicMessageOptions;
  requiredBetaFeatures: string[];
  processedOutputFormat: Anthropic.Messages.OutputConfig['format'] | undefined;
  usingClaudeCodeOAuth: boolean;
}) {
  const headers: Record<string, string> = { ...(config.headers || {}) };
  let allBetaFeatures = [...(config.beta || []), ...requiredBetaFeatures];
  const userBetaHeader = config.headers?.['anthropic-beta'];

  if (typeof userBetaHeader === 'string' && userBetaHeader.length > 0) {
    allBetaFeatures.push(
      ...userBetaHeader
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );
  }
  if (processedOutputFormat && !allBetaFeatures.includes('structured-outputs-2025-11-13')) {
    allBetaFeatures.push('structured-outputs-2025-11-13');
  }
  if (usingClaudeCodeOAuth) {
    allBetaFeatures.push(...CLAUDE_CODE_OAUTH_BETA_FEATURES);
  }

  allBetaFeatures = [...new Set(allBetaFeatures)];
  if (allBetaFeatures.length > 0) {
    headers['anthropic-beta'] = allBetaFeatures.join(',');
  }
  if (usingClaudeCodeOAuth) {
    headers['user-agent'] = CLAUDE_CODE_USER_AGENT;
    headers['x-app'] = CLAUDE_CODE_X_APP;
  }
  return headers;
}

function getMessageRequestOptions(headers: Record<string, string>) {
  return Object.keys(headers).length > 0 ? { headers } : {};
}

function parseStructuredAnthropicOutput(
  output: unknown,
  processedOutputFormat: Anthropic.Messages.OutputConfig['format'] | undefined,
) {
  if (processedOutputFormat?.type !== 'json_schema' || typeof output !== 'string') {
    return output;
  }
  try {
    return JSON.parse(output);
  } catch (error) {
    logger.error(`Failed to parse JSON output from structured outputs: ${error}`);
    return output;
  }
}

function buildAnthropicProviderResponse({
  response,
  config,
  processedOutputFormat,
  modelName,
  cached,
}: {
  response: Anthropic.Messages.Message;
  config: AnthropicMessageOptions;
  processedOutputFormat: Anthropic.Messages.OutputConfig['format'] | undefined;
  modelName: string;
  cached: boolean;
}): ProviderResponse {
  const finishReason = normalizeFinishReason(response.stop_reason);
  const output = parseStructuredAnthropicOutput(
    outputFromMessage(response, config.showThinking ?? true),
    processedOutputFormat,
  );
  const refusalDetails = getRefusalDetails(response);

  if (refusalDetails && !cached) {
    logger.warn(refusalDetails);
  }

  return {
    output,
    tokenUsage: getTokenUsage(response, cached),
    ...(finishReason && { finishReason }),
    ...(refusalDetails && { guardrails: { flagged: true, reason: refusalDetails } }),
    cost: calculateAnthropicCost(
      modelName,
      config,
      response.usage?.input_tokens,
      response.usage?.output_tokens,
      response.usage?.cache_read_input_tokens ?? undefined,
      response.usage?.cache_creation_input_tokens ?? undefined,
    ),
    ...(cached ? { cached: true } : {}),
  };
}

export class AnthropicMessagesProvider extends AnthropicGenericProvider {
  declare config: AnthropicMessageOptions;
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private opus47TemperatureWarned = false;

  // Messages is the only Anthropic subclass wired to Claude Code OAuth —
  // the legacy text-completion endpoint does not accept OAuth tokens.
  static override readonly SUPPORTS_CLAUDE_CODE_OAUTH = true;

  static ANTHROPIC_MODELS = ANTHROPIC_MODELS;

  static ANTHROPIC_MODELS_NAMES = ANTHROPIC_MODELS.map((model) => model.id);

  constructor(
    modelName: string,
    options: { id?: string; config?: AnthropicMessageOptions; env?: EnvOverrides } = {},
  ) {
    if (!AnthropicMessagesProvider.ANTHROPIC_MODELS_NAMES.includes(modelName)) {
      logger.warn(`Using unknown Anthropic model: ${modelName}`);
    }
    super(modelName, options);
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

  toString(): string {
    if (!this.modelName) {
      throw new Error('Anthropic model name is not set. Please provide a valid model name.');
    }
    return `[Anthropic Messages Provider ${this.modelName}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Wait for MCP initialization if it's in progress
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }

    if (!this.apiKey && !this.usingClaudeCodeOAuth) {
      throw new Error(
        'Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add `apiKey` to the provider config. ' +
          'Alternatively, if you have an active Claude Code session, set `apiKeyRequired: false` in the provider config to authenticate via Claude Code.',
      );
    }

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
      system: 'anthropic',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      // Optional request parameters
      maxTokens: this.config.max_tokens,
      temperature: this.config.temperature,
      // Promptfoo context from test case if available
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
    return withGenAISpan(spanContext, () => this.callApiInternal(prompt, context), resultExtractor);
  }

  private warnForAssistantPrefill(extractedMessages: Anthropic.Messages.MessageParam[]) {
    if (!this.modelName.startsWith('claude-opus-4-6') || extractedMessages.length === 0) {
      return;
    }
    const lastMessage = extractedMessages[extractedMessages.length - 1];
    if (lastMessage.role === 'assistant') {
      logger.warn(
        'Assistant message prefilling is not supported on Claude Opus 4.6 and will cause a 400 error. Remove the trailing assistant message from your prompt.',
      );
    }
  }

  private warnForOpus47Temperature(config: AnthropicMessageOptions) {
    const explicitTemperature =
      config.temperature != null ||
      parseEnvFloat(this.env?.ANTHROPIC_TEMPERATURE) != null ||
      parseEnvFloat(process.env.ANTHROPIC_TEMPERATURE) != null;
    if (
      !isClaudeOpus47Model(this.modelName) ||
      !explicitTemperature ||
      this.opus47TemperatureWarned
    ) {
      return;
    }
    logger.warn(
      'temperature is deprecated on Claude Opus 4.7 and will be omitted. Remove temperature from your config (or unset ANTHROPIC_TEMPERATURE) to silence this warning.',
    );
    this.opus47TemperatureWarned = true;
  }

  private buildMessagesParams({
    config,
    extractedMessages,
    resolvedSystem,
    thinkingEnabled,
    resolvedTopP,
    resolvedToolChoice,
    resolvedThinking,
    allTools,
    processedOutputFormat,
  }: {
    config: AnthropicMessageOptions;
    extractedMessages: Anthropic.Messages.MessageParam[];
    resolvedSystem: Anthropic.TextBlockParam[] | undefined;
    thinkingEnabled: boolean;
    resolvedTopP: number | undefined;
    resolvedToolChoice: Anthropic.Messages.ToolChoice | undefined;
    resolvedThinking: Anthropic.Messages.ThinkingConfigParam | undefined;
    allTools: ProcessedAnthropicTool[];
    processedOutputFormat: Anthropic.Messages.OutputConfig['format'] | undefined;
  }): Anthropic.MessageCreateParams {
    const omitTemperature =
      resolvedTopP != null || thinkingEnabled || isClaudeOpus47Model(this.modelName);
    return {
      model: this.modelName,
      ...(resolvedSystem && resolvedSystem.length > 0 ? { system: resolvedSystem } : {}),
      max_tokens:
        config.max_tokens ?? getEnvInt('ANTHROPIC_MAX_TOKENS', thinkingEnabled ? 2048 : 1024),
      messages: extractedMessages,
      stream: config.stream ?? false,
      ...(omitTemperature
        ? {}
        : {
            temperature:
              config.temperature ??
              parseEnvFloat(this.env?.ANTHROPIC_TEMPERATURE) ??
              getEnvFloat('ANTHROPIC_TEMPERATURE', 0),
          }),
      ...(resolvedTopP == null ? {} : { top_p: resolvedTopP }),
      ...(config.top_k == null || thinkingEnabled ? {} : { top_k: config.top_k }),
      ...(config.cache_control ? { cache_control: config.cache_control } : {}),
      ...(config.service_tier ? { service_tier: config.service_tier } : {}),
      ...(config.stop_sequences?.length ? { stop_sequences: config.stop_sequences } : {}),
      ...(config.metadata ? { metadata: config.metadata } : {}),
      ...(allTools.length > 0 ? { tools: allTools as any } : {}),
      ...(resolvedToolChoice ? { tool_choice: resolvedToolChoice } : {}),
      ...(resolvedThinking ? { thinking: resolvedThinking } : {}),
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
  }

  private buildCacheKey(
    params: Anthropic.MessageCreateParams,
    headers: Record<string, string>,
  ): string {
    const { metadata: _metadata, ...cacheKeyParams } = params;
    const cacheKeyHeaders = normalizeHeadersForCacheKey(headers);
    return `anthropic:messages:${this.modelName}:${this.getCacheIdentityHash()}:${this.getCacheAuthNamespace()}:${hashAnthropicCacheValue(
      {
        ...cacheKeyParams,
        ...(cacheKeyHeaders ? { headers: cacheKeyHeaders } : {}),
      },
    )}`;
  }

  private async getCachedResponse({
    cacheKey,
    cache,
    config,
    processedOutputFormat,
  }: {
    cacheKey: string;
    cache: Awaited<ReturnType<typeof getCache>>;
    config: AnthropicMessageOptions;
    processedOutputFormat: Anthropic.Messages.OutputConfig['format'] | undefined;
  }): Promise<ProviderResponse | undefined> {
    if (!isCacheEnabled()) {
      return undefined;
    }
    const cachedResponse = await cache.get<string | undefined>(cacheKey);
    if (!cachedResponse) {
      return undefined;
    }

    logger.debug('Returning cached Anthropic Messages response', { model: this.modelName });
    try {
      const parsedCachedResponse = JSON.parse(cachedResponse) as Anthropic.Messages.Message;
      return buildAnthropicProviderResponse({
        response: parsedCachedResponse,
        config,
        processedOutputFormat,
        modelName: this.modelName,
        cached: true,
      });
    } catch {
      return {
        output: cachedResponse,
        tokenUsage: createEmptyTokenUsage(),
      };
    }
  }

  private async cacheResponse(
    cache: Awaited<ReturnType<typeof getCache>>,
    cacheKey: string,
    response: Anthropic.Messages.Message,
  ) {
    if (!isCacheEnabled()) {
      return;
    }
    try {
      await cache.set(cacheKey, JSON.stringify(response));
    } catch (err) {
      logger.error(`Failed to cache response: ${String(err)}`);
    }
  }

  private async createAnthropicMessage(
    params: Anthropic.MessageCreateParams,
    headers: Record<string, string>,
  ) {
    if (params.stream) {
      const stream = await this.anthropic.messages.stream(
        params,
        getMessageRequestOptions(headers),
      );
      const finalMessage = await stream.finalMessage();
      logger.debug(`Anthropic Messages API streaming complete`, {
        finalMessage: getMessagesResponseMetadata(finalMessage),
      });
      return finalMessage;
    }

    const response = (await this.anthropic.messages.create(
      params,
      getMessageRequestOptions(headers),
    )) as Anthropic.Messages.Message;
    logger.debug(`Anthropic Messages API response`, {
      response: getMessagesResponseMetadata(response),
    });
    return response;
  }

  /**
   * Internal implementation of callApi without tracing wrapper.
   */
  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const config: AnthropicMessageOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };
    const { system, extractedMessages, thinking } = parseMessages(prompt);

    const mcpTools = this.mcpClient
      ? transformMCPToolsToAnthropic(this.mcpClient.getAllTools())
      : [];
    const loadedTools = (await maybeLoadToolsFromExternalFile(config.tools, context?.vars)) || [];
    const configTools = transformTools(loadedTools, 'anthropic') as typeof loadedTools;
    const { processedTools: processedConfigTools, requiredBetaFeatures } =
      processAnthropicTools(configTools);
    const allTools = [...mcpTools, ...processedConfigTools];
    const processedOutputFormat = maybeLoadResponseFormatFromExternalFile(
      config.output_format,
      context?.vars,
    );

    const resolvedThinking = resolveThinkingConfig(config.thinking, thinking);
    const thinkingEnabled = isThinkingEnabled(resolvedThinking);
    warnForThinkingConflicts(config, thinkingEnabled);
    const resolvedToolChoice = resolveToolChoiceForThinking(config, thinkingEnabled);
    const resolvedTopP = resolveTopPForThinking(config, thinkingEnabled);
    warnForTemperatureWithTopP(config, resolvedTopP, thinkingEnabled);
    this.warnForAssistantPrefill(extractedMessages);
    this.warnForOpus47Temperature(config);

    const params = this.buildMessagesParams({
      config,
      extractedMessages,
      resolvedSystem: resolveSystemBlocks(this.usingClaudeCodeOAuth, system),
      thinkingEnabled,
      resolvedTopP,
      resolvedToolChoice,
      resolvedThinking,
      allTools,
      processedOutputFormat,
    });

    logger.debug('Calling Anthropic Messages API', {
      params: getMessagesRequestMetadata(params),
    });
    const headers = buildMessagesHeaders({
      config,
      requiredBetaFeatures,
      processedOutputFormat,
      usingClaudeCodeOAuth: this.usingClaudeCodeOAuth,
    });

    const cache = await getCache();
    const cacheKey = this.buildCacheKey(params, headers);
    const cachedResponse = await this.getCachedResponse({
      cacheKey,
      cache,
      config,
      processedOutputFormat,
    });
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      const response = await this.createAnthropicMessage(params, headers);
      await this.cacheResponse(cache, cacheKey, response);
      return buildAnthropicProviderResponse({
        response,
        config,
        processedOutputFormat,
        modelName: this.modelName,
        cached: false,
      });
    } catch (err) {
      logger.error(
        `Anthropic Messages API call error: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (err instanceof APIError && err.error) {
        const errorDetails = err.error as { error: { message: string; type: string } };
        return {
          error: `API call error: ${errorDetails.error.message}, status ${err.status}, type ${errorDetails.error.type}`,
        };
      }
      return {
        error: `API call error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
