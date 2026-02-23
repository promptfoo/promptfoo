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
import { AnthropicGenericProvider } from './generic';
import {
  ANTHROPIC_MODELS,
  calculateAnthropicCost,
  getTokenUsage,
  outputFromMessage,
  parseMessages,
  processAnthropicTools,
} from './util';
import type Anthropic from '@anthropic-ai/sdk';

import type { EnvOverrides } from '../../types/env';
import type { CallApiContextParams, ProviderResponse } from '../../types/index';
import type { AnthropicMessageOptions } from './types';

export class AnthropicMessagesProvider extends AnthropicGenericProvider {
  declare config: AnthropicMessageOptions;
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;

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

    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add `apiKey` to the provider config.',
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
   * Build Anthropic API request parameters from config and parsed prompt.
   */
  private buildRequestParams(
    config: AnthropicMessageOptions,
    system: Anthropic.TextBlockParam[] | undefined,
    extractedMessages: Anthropic.MessageParam[],
    thinking: Anthropic.ThinkingConfigParam | undefined,
    allTools: (
      | Anthropic.Tool
      | Anthropic.Beta.BetaWebFetchTool20250910
      | Anthropic.Beta.BetaWebSearchTool20250305
    )[],
    processedOutputFormat: ReturnType<typeof maybeLoadResponseFormatFromExternalFile>,
  ): Anthropic.MessageCreateParams {
    return {
      model: this.modelName,
      ...(system ? { system } : {}),
      max_tokens:
        config?.max_tokens ||
        getEnvInt('ANTHROPIC_MAX_TOKENS', config.thinking || thinking ? 2048 : 1024),
      messages: extractedMessages,
      stream: config.stream ?? false,
      temperature:
        config.thinking || thinking
          ? config.temperature
          : config.temperature || getEnvFloat('ANTHROPIC_TEMPERATURE', 0),
      ...(allTools.length > 0 ? { tools: allTools as any } : {}),
      ...(config.tool_choice
        ? {
            tool_choice: transformToolChoice(
              config.tool_choice,
              'anthropic',
            ) as Anthropic.Messages.ToolChoice,
          }
        : {}),
      ...(config.thinking || thinking ? { thinking: config.thinking || thinking } : {}),
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

  /**
   * Build request headers including beta feature flags.
   */
  private buildHeaders(
    config: AnthropicMessageOptions,
    requiredBetaFeatures: string[],
    processedOutputFormat: ReturnType<typeof maybeLoadResponseFormatFromExternalFile>,
  ): Record<string, string> {
    const headers: Record<string, string> = { ...(config.headers || {}) };
    let allBetaFeatures = [...(config.beta || []), ...requiredBetaFeatures];

    if (processedOutputFormat && !allBetaFeatures.includes('structured-outputs-2025-11-13')) {
      allBetaFeatures.push('structured-outputs-2025-11-13');
    }

    allBetaFeatures = [...new Set(allBetaFeatures)];

    if (allBetaFeatures.length > 0) {
      headers['anthropic-beta'] = allBetaFeatures.join(',');
    }

    return headers;
  }

  /**
   * Try to return a cached Anthropic response. Returns undefined if no cache hit.
   */
  private async tryGetCachedResponse(
    prompt: string,
    cacheKey: string,
    config: AnthropicMessageOptions,
    processedOutputFormat: ReturnType<typeof maybeLoadResponseFormatFromExternalFile>,
  ): Promise<ProviderResponse | undefined> {
    if (!isCacheEnabled()) {
      return undefined;
    }
    const cache = await getCache();
    const cachedResponse = await cache.get<string | undefined>(cacheKey);
    if (!cachedResponse) {
      return undefined;
    }

    logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
    try {
      const parsedCachedResponse = JSON.parse(cachedResponse) as Anthropic.Messages.Message;
      const finishReason = normalizeFinishReason(parsedCachedResponse.stop_reason);
      let output = outputFromMessage(parsedCachedResponse, config.showThinking ?? true);

      if (processedOutputFormat?.type === 'json_schema' && typeof output === 'string') {
        try {
          output = JSON.parse(output);
        } catch (error) {
          logger.error(`Failed to parse JSON output from structured outputs: ${error}`);
        }
      }

      return {
        output,
        tokenUsage: getTokenUsage(parsedCachedResponse, true),
        ...(finishReason && { finishReason }),
        cost: calculateAnthropicCost(
          this.modelName,
          config,
          parsedCachedResponse.usage?.input_tokens,
          parsedCachedResponse.usage?.output_tokens,
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

  /**
   * Parse and optionally JSON-parse output from an Anthropic message.
   */
  private parseMessageOutput(
    message: Anthropic.Messages.Message,
    config: AnthropicMessageOptions,
    processedOutputFormat: ReturnType<typeof maybeLoadResponseFormatFromExternalFile>,
  ): ReturnType<typeof outputFromMessage> {
    let output = outputFromMessage(message, config.showThinking ?? true);

    if (processedOutputFormat?.type === 'json_schema' && typeof output === 'string') {
      try {
        output = JSON.parse(output);
      } catch (error) {
        logger.error(`Failed to parse JSON output from structured outputs: ${error}`);
      }
    }

    return output;
  }

  /**
   * Execute a streaming Anthropic request and return the provider response.
   */
  private async executeStreamingRequest(
    params: Anthropic.MessageCreateParams,
    headers: Record<string, string>,
    cacheKey: string,
    config: AnthropicMessageOptions,
    processedOutputFormat: ReturnType<typeof maybeLoadResponseFormatFromExternalFile>,
  ): Promise<ProviderResponse> {
    const stream = await this.anthropic.messages.stream(params, {
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });

    const finalMessage = await stream.finalMessage();
    logger.debug('Anthropic Messages API streaming complete', { finalMessage });

    if (isCacheEnabled()) {
      try {
        const cache = await getCache();
        await cache.set(cacheKey, JSON.stringify(finalMessage));
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }

    const finishReason = normalizeFinishReason(finalMessage.stop_reason);
    const output = this.parseMessageOutput(finalMessage, config, processedOutputFormat);

    return {
      output,
      tokenUsage: getTokenUsage(finalMessage, false),
      ...(finishReason && { finishReason }),
      cost: calculateAnthropicCost(
        this.modelName,
        config,
        finalMessage.usage?.input_tokens,
        finalMessage.usage?.output_tokens,
      ),
    };
  }

  /**
   * Execute a non-streaming Anthropic request and return the provider response.
   */
  private async executeNonStreamingRequest(
    params: Anthropic.MessageCreateParams,
    headers: Record<string, string>,
    cacheKey: string,
    config: AnthropicMessageOptions,
    processedOutputFormat: ReturnType<typeof maybeLoadResponseFormatFromExternalFile>,
  ): Promise<ProviderResponse> {
    const response = (await this.anthropic.messages.create(params, {
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    })) as Anthropic.Messages.Message;
    logger.debug('Anthropic Messages API response', { response });

    if (isCacheEnabled()) {
      try {
        const cache = await getCache();
        await cache.set(cacheKey, JSON.stringify(response));
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }

    const finishReason = normalizeFinishReason(response.stop_reason);
    const output = this.parseMessageOutput(response, config, processedOutputFormat);

    return {
      output,
      tokenUsage: getTokenUsage(response, false),
      ...(finishReason && { finishReason }),
      cost: calculateAnthropicCost(
        this.modelName,
        config,
        response.usage?.input_tokens,
        response.usage?.output_tokens,
      ),
    };
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
    const mcpTools: Anthropic.Tool[] = this.mcpClient
      ? transformMCPToolsToAnthropic(this.mcpClient.getAllTools())
      : [];

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

    const params = this.buildRequestParams(
      config,
      system,
      extractedMessages,
      thinking,
      allTools,
      processedOutputFormat,
    );

    logger.debug('Calling Anthropic Messages API', { params });

    const headers = this.buildHeaders(config, requiredBetaFeatures, processedOutputFormat);

    const cacheKey = `anthropic:${JSON.stringify(params)}`;

    const cachedResult = await this.tryGetCachedResponse(
      prompt,
      cacheKey,
      config,
      processedOutputFormat,
    );
    if (cachedResult) {
      return cachedResult;
    }

    const shouldStream = config.stream ?? false;
    try {
      if (shouldStream) {
        return await this.executeStreamingRequest(
          params,
          headers,
          cacheKey,
          config,
          processedOutputFormat,
        );
      }
      return await this.executeNonStreamingRequest(
        params,
        headers,
        cacheKey,
        config,
        processedOutputFormat,
      );
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
