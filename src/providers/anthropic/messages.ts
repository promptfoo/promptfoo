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

  /**
   * Internal implementation of callApi without tracing wrapper.
   */
  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
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

    const resolvedThinking = resolveThinkingConfig(config.thinking, thinking);
    const thinkingEnabled = isThinkingEnabled(resolvedThinking);

    // Validate and warn about thinking-incompatible params
    if (thinkingEnabled) {
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

    // Resolve tool_choice, suppressing forced tool use when thinking is enabled
    let resolvedToolChoice: Anthropic.Messages.ToolChoice | undefined;
    if (config.tool_choice) {
      const transformed = transformToolChoice(
        config.tool_choice,
        'anthropic',
      ) as Anthropic.Messages.ToolChoice;
      if (thinkingEnabled && (transformed.type === 'any' || transformed.type === 'tool')) {
        logger.warn(
          `tool_choice type '${transformed.type}' (forced tool use) is incompatible with extended thinking and will be omitted. Use 'auto' or remove tool_choice.`,
        );
      } else {
        resolvedToolChoice = transformed;
      }
    }

    // Resolve top_p: clamp to [0.95, 1.0] when thinking is enabled
    let resolvedTopP: number | undefined;
    if (config.top_p != null) {
      resolvedTopP = thinkingEnabled ? Math.max(0.95, Math.min(1.0, config.top_p)) : config.top_p;
    }

    // Warn when temperature is silently omitted due to top_p (even without thinking)
    if (config.temperature != null && resolvedTopP != null && !thinkingEnabled) {
      logger.warn(
        'temperature is incompatible with top_p on Anthropic and will be omitted. Remove one of these parameters.',
      );
    }

    // Warn about assistant prefilling on Opus 4.6 (not supported, returns 400)
    const isOpus46 = this.modelName.startsWith('claude-opus-4-6');
    if (isOpus46 && extractedMessages.length > 0) {
      const lastMessage = extractedMessages[extractedMessages.length - 1];
      if (lastMessage.role === 'assistant') {
        logger.warn(
          'Assistant message prefilling is not supported on Claude Opus 4.6 and will cause a 400 error. Remove the trailing assistant message from your prompt.',
        );
      }
    }

    // Opus 4.7 deprecated `temperature` at the model level — the API returns
    // 400 `invalid_request_error` for any request that includes it, including
    // promptfoo's built-in default of 0. Suppress the parameter entirely and
    // warn once per provider instance when the user supplied an explicit
    // temperature via config or the ANTHROPIC_TEMPERATURE env var (the
    // built-in default stays silent to avoid spamming every request).
    const isOpus47 = isClaudeOpus47Model(this.modelName);
    const explicitTemperature =
      config.temperature != null ||
      parseEnvFloat(this.env?.ANTHROPIC_TEMPERATURE) != null ||
      parseEnvFloat(process.env.ANTHROPIC_TEMPERATURE) != null;
    if (isOpus47 && explicitTemperature && !this.opus47TemperatureWarned) {
      logger.warn(
        'temperature is deprecated on Claude Opus 4.7 and will be omitted. Remove temperature from your config (or unset ANTHROPIC_TEMPERATURE) to silence this warning.',
      );
      this.opus47TemperatureWarned = true;
    }

    // Anthropic rejects `temperature` alongside `top_p`, with extended thinking,
    // and on Opus 4.7 (deprecated at the model level). Collapse all three cases
    // into one predicate so the params spread stays readable.
    const omitTemperature = resolvedTopP != null || thinkingEnabled || isOpus47;

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
      max_tokens:
        config.max_tokens ?? getEnvInt('ANTHROPIC_MAX_TOKENS', thinkingEnabled ? 2048 : 1024),
      messages: extractedMessages,
      stream: shouldStream,
      ...(omitTemperature
        ? {}
        : {
            temperature:
              config.temperature ??
              parseEnvFloat(this.env?.ANTHROPIC_TEMPERATURE) ??
              getEnvFloat('ANTHROPIC_TEMPERATURE', 0),
          }),
      ...(resolvedTopP == null ? {} : { top_p: resolvedTopP }),
      // Anthropic docs: top_k is incompatible with extended thinking
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

    logger.debug('Calling Anthropic Messages API', {
      params: getMessagesRequestMetadata(params),
    });

    const headers: Record<string, string> = {
      ...(config.headers || {}),
    };

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

    const cache = await getCache();
    const { metadata: _metadata, ...cacheKeyParams } = params;
    const cacheKeyHeaders = normalizeHeadersForCacheKey(headers);
    const cacheKey = `anthropic:messages:${this.modelName}:${this.getCacheIdentityHash()}:${this.getCacheAuthNamespace()}:${hashAnthropicCacheValue(
      {
        ...cacheKeyParams,
        ...(cacheKeyHeaders ? { headers: cacheKeyHeaders } : {}),
      },
    )}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get<string | undefined>(cacheKey);
      if (cachedResponse) {
        logger.debug('Returning cached Anthropic Messages response', { model: this.modelName });
        try {
          const parsedCachedResponse = JSON.parse(cachedResponse) as Anthropic.Messages.Message;
          const finishReason = normalizeFinishReason(parsedCachedResponse.stop_reason);
          let output = outputFromMessage(parsedCachedResponse, config.showThinking ?? true);

          // Handle structured JSON output parsing
          if (processedOutputFormat?.type === 'json_schema' && typeof output === 'string') {
            try {
              output = JSON.parse(output);
            } catch (error) {
              logger.error(`Failed to parse JSON output from structured outputs: ${error}`);
            }
          }

          const cachedRefusalDetails = getRefusalDetails(parsedCachedResponse);

          return {
            output,
            tokenUsage: getTokenUsage(parsedCachedResponse, true),
            ...(finishReason && { finishReason }),
            ...(cachedRefusalDetails && {
              guardrails: { flagged: true, reason: cachedRefusalDetails },
            }),
            cost: calculateAnthropicCost(
              this.modelName,
              config,
              parsedCachedResponse.usage?.input_tokens,
              parsedCachedResponse.usage?.output_tokens,
              parsedCachedResponse.usage?.cache_read_input_tokens ?? undefined,
              parsedCachedResponse.usage?.cache_creation_input_tokens ?? undefined,
            ),
            cached: true,
          };
        } catch {
          // Could be an old cache item, which was just the text content from TextBlock.
          return {
            output: cachedResponse,
            tokenUsage: createEmptyTokenUsage(),
          };
        }
      }
    }

    try {
      if (shouldStream) {
        // Handle streaming request
        const stream = await this.anthropic.messages.stream(params, {
          ...(typeof headers === 'object' && Object.keys(headers).length > 0 ? { headers } : {}),
        });

        // Wait for the stream to complete and get the final message
        const finalMessage = await stream.finalMessage();
        logger.debug(`Anthropic Messages API streaming complete`, {
          finalMessage: getMessagesResponseMetadata(finalMessage),
        });

        if (isCacheEnabled()) {
          try {
            await cache.set(cacheKey, JSON.stringify(finalMessage));
          } catch (err) {
            logger.error(`Failed to cache response: ${String(err)}`);
          }
        }

        const finishReason = normalizeFinishReason(finalMessage.stop_reason);
        let output = outputFromMessage(finalMessage, config.showThinking ?? true);

        // Handle structured JSON output parsing
        if (processedOutputFormat?.type === 'json_schema' && typeof output === 'string') {
          try {
            output = JSON.parse(output);
          } catch (error) {
            logger.error(`Failed to parse JSON output from structured outputs: ${error}`);
          }
        }

        const refusalDetails = getRefusalDetails(finalMessage);
        if (refusalDetails) {
          logger.warn(refusalDetails);
        }

        return {
          output,
          tokenUsage: getTokenUsage(finalMessage, false),
          ...(finishReason && { finishReason }),
          ...(refusalDetails && { guardrails: { flagged: true, reason: refusalDetails } }),
          cost: calculateAnthropicCost(
            this.modelName,
            config,
            finalMessage.usage?.input_tokens,
            finalMessage.usage?.output_tokens,
            finalMessage.usage?.cache_read_input_tokens ?? undefined,
            finalMessage.usage?.cache_creation_input_tokens ?? undefined,
          ),
        };
      } else {
        // Handle non-streaming request
        const response = (await this.anthropic.messages.create(params, {
          ...(typeof headers === 'object' && Object.keys(headers).length > 0 ? { headers } : {}),
        })) as Anthropic.Messages.Message;
        logger.debug(`Anthropic Messages API response`, {
          response: getMessagesResponseMetadata(response),
        });

        if (isCacheEnabled()) {
          try {
            await cache.set(cacheKey, JSON.stringify(response));
          } catch (err) {
            logger.error(`Failed to cache response: ${String(err)}`);
          }
        }

        const finishReason = normalizeFinishReason(response.stop_reason);
        let output = outputFromMessage(response, config.showThinking ?? true);

        // Handle structured JSON output parsing
        if (processedOutputFormat?.type === 'json_schema' && typeof output === 'string') {
          try {
            output = JSON.parse(output);
          } catch (error) {
            logger.error(`Failed to parse JSON output from structured outputs: ${error}`);
          }
        }

        const refusalDetails = getRefusalDetails(response);
        if (refusalDetails) {
          logger.warn(refusalDetails);
        }

        return {
          output,
          tokenUsage: getTokenUsage(response, false),
          ...(finishReason && { finishReason }),
          ...(refusalDetails && { guardrails: { flagged: true, reason: refusalDetails } }),
          cost: calculateAnthropicCost(
            this.modelName,
            config,
            response.usage?.input_tokens,
            response.usage?.output_tokens,
            response.usage?.cache_read_input_tokens ?? undefined,
            response.usage?.cache_creation_input_tokens ?? undefined,
          ),
        };
      }
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
