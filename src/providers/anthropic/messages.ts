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
   * Internal implementation of callApi without tracing wrapper.
   */
  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    // Use test-scoped logger if available, fallback to global logger
    const log = context?.logger ?? logger;

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

    const shouldStream = config.stream ?? false;
    const params: Anthropic.MessageCreateParams = {
      model: this.modelName,
      ...(system ? { system } : {}),
      max_tokens:
        config?.max_tokens ||
        getEnvInt('ANTHROPIC_MAX_TOKENS', config.thinking || thinking ? 2048 : 1024),
      messages: extractedMessages,
      stream: shouldStream,
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
      ...(processedOutputFormat ? { output_config: { format: processedOutputFormat } } : {}),
      ...(typeof config?.extra_body === 'object' && config.extra_body ? config.extra_body : {}),
    };

    log.debug('Calling Anthropic Messages API', { params });

    const headers: Record<string, string> = {
      ...(config.headers || {}),
    };

    // Add beta features header if specified
    let allBetaFeatures = [...(config.beta || []), ...requiredBetaFeatures];

    // Automatically add structured-outputs beta when output_format is used
    if (processedOutputFormat && !allBetaFeatures.includes('structured-outputs-2025-11-13')) {
      allBetaFeatures.push('structured-outputs-2025-11-13');
    }

    // Deduplicate beta features
    allBetaFeatures = [...new Set(allBetaFeatures)];

    if (allBetaFeatures.length > 0) {
      headers['anthropic-beta'] = allBetaFeatures.join(',');
    }

    const cache = await getCache();
    const cacheKey = `anthropic:${JSON.stringify(params)}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get<string | undefined>(cacheKey);
      if (cachedResponse) {
        log.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        try {
          const parsedCachedResponse = JSON.parse(cachedResponse) as Anthropic.Messages.Message;
          const finishReason = normalizeFinishReason(parsedCachedResponse.stop_reason);
          let output = outputFromMessage(parsedCachedResponse, config.showThinking ?? true);

          // Handle structured JSON output parsing
          if (processedOutputFormat?.type === 'json_schema' && typeof output === 'string') {
            try {
              output = JSON.parse(output);
            } catch (error) {
              log.error(`Failed to parse JSON output from structured outputs: ${error}`);
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
    }

    try {
      if (shouldStream) {
        // Handle streaming request
        const stream = await this.anthropic.messages.stream(params, {
          ...(typeof headers === 'object' && Object.keys(headers).length > 0 ? { headers } : {}),
        });

        // Wait for the stream to complete and get the final message
        const finalMessage = await stream.finalMessage();
        log.debug(`Anthropic Messages API streaming complete`, { finalMessage });

        if (isCacheEnabled()) {
          try {
            await cache.set(cacheKey, JSON.stringify(finalMessage));
          } catch (err) {
            log.error(`Failed to cache response: ${String(err)}`);
          }
        }

        const finishReason = normalizeFinishReason(finalMessage.stop_reason);
        let output = outputFromMessage(finalMessage, config.showThinking ?? true);

        // Handle structured JSON output parsing
        if (processedOutputFormat?.type === 'json_schema' && typeof output === 'string') {
          try {
            output = JSON.parse(output);
          } catch (error) {
            log.error(`Failed to parse JSON output from structured outputs: ${error}`);
          }
        }

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
      } else {
        // Handle non-streaming request
        const response = (await this.anthropic.messages.create(params, {
          ...(typeof headers === 'object' && Object.keys(headers).length > 0 ? { headers } : {}),
        })) as Anthropic.Messages.Message;
        log.debug(`Anthropic Messages API response`, { response });

        if (isCacheEnabled()) {
          try {
            await cache.set(cacheKey, JSON.stringify(response));
          } catch (err) {
            log.error(`Failed to cache response: ${String(err)}`);
          }
        }

        const finishReason = normalizeFinishReason(response.stop_reason);
        let output = outputFromMessage(response, config.showThinking ?? true);

        // Handle structured JSON output parsing
        if (processedOutputFormat?.type === 'json_schema' && typeof output === 'string') {
          try {
            output = JSON.parse(output);
          } catch (error) {
            log.error(`Failed to parse JSON output from structured outputs: ${error}`);
          }
        }

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
    } catch (err) {
      log.error(
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
