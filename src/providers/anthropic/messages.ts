import { APIError } from '@anthropic-ai/sdk';
import { getCache, isCacheEnabled } from '../../cache';
import { getEnvFloat, getEnvInt } from '../../envars';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile } from '../../util';
import { normalizeFinishReason } from '../../util/finishReason';
import { createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToAnthropic } from '../mcp/transform';
import { AnthropicGenericProvider } from './generic';
import {
  ANTHROPIC_MODELS,
  calculateAnthropicCost,
  getTokenUsage,
  outputFromMessage,
  parseMessages,
} from './util';
import type Anthropic from '@anthropic-ai/sdk';

import type { CallApiContextParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
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
    if (this.initializationPromise) {
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
    const fileTools = maybeLoadToolsFromExternalFile(config.tools) || [];
    const allTools = [...mcpTools, ...fileTools];

    const params: Anthropic.MessageCreateParams = {
      model: this.modelName,
      ...(system ? { system } : {}),
      max_tokens:
        config?.max_tokens ||
        getEnvInt('ANTHROPIC_MAX_TOKENS', config.thinking || thinking ? 2048 : 1024),
      messages: extractedMessages,
      stream: false,
      temperature:
        config.thinking || thinking
          ? config.temperature
          : config.temperature || getEnvFloat('ANTHROPIC_TEMPERATURE', 0),
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.thinking || thinking ? { thinking: config.thinking || thinking } : {}),
      ...(typeof config?.extra_body === 'object' && config.extra_body ? config.extra_body : {}),
    };

    logger.debug(`Calling Anthropic Messages API: ${JSON.stringify(params)}`);

    const headers: Record<string, string> = {
      ...(config.headers || {}),
    };

    // Add beta features header if specified
    if (config.beta?.length) {
      headers['anthropic-beta'] = config.beta.join(',');
    }

    const cache = await getCache();
    const cacheKey = `anthropic:${JSON.stringify(params)}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get<string | undefined>(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        try {
          const parsedCachedResponse = JSON.parse(cachedResponse) as Anthropic.Messages.Message;
          const finishReason = normalizeFinishReason(parsedCachedResponse.stop_reason);
          return {
            output: outputFromMessage(parsedCachedResponse, config.showThinking ?? true),
            tokenUsage: getTokenUsage(parsedCachedResponse, true),
            ...(finishReason && { finishReason }),
            cost: calculateAnthropicCost(
              this.modelName,
              config,
              parsedCachedResponse.usage?.input_tokens,
              parsedCachedResponse.usage?.output_tokens,
            ),
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
      const response = await this.anthropic.messages.create(params, {
        ...(typeof headers === 'object' && Object.keys(headers).length > 0 ? { headers } : {}),
      });
      logger.debug(`Anthropic Messages API response: ${JSON.stringify(response)}`);

      if (isCacheEnabled()) {
        try {
          await cache.set(cacheKey, JSON.stringify(response));
        } catch (err) {
          logger.error(`Failed to cache response: ${String(err)}`);
        }
      }

      if ('stream' in response) {
        // Handle streaming response
        return {
          output: 'Streaming response not supported in this context',
          error: 'Streaming should be disabled for this use case',
        };
      }

      const finishReason = normalizeFinishReason(response.stop_reason);
      return {
        output: outputFromMessage(response, config.showThinking ?? true),
        tokenUsage: getTokenUsage(response, false),
        ...(finishReason && { finishReason }),
        cost: calculateAnthropicCost(
          this.modelName,
          config,
          response.usage?.input_tokens,
          response.usage?.output_tokens,
        ),
      };
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
