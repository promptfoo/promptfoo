import type Anthropic from '@anthropic-ai/sdk';
import { APIError } from '@anthropic-ai/sdk';
import { getCache, isCacheEnabled } from '../../cache';
import { getEnvInt, getEnvFloat } from '../../envars';
import logger from '../../logger';
import type { ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { maybeLoadFromExternalFile } from '../../util';
import { AnthropicGenericProvider } from './generic';
import type { AnthropicMessageOptions } from './types';
import {
  outputFromMessage,
  parseMessages,
  calculateAnthropicCost,
  getTokenUsage,
  ANTHROPIC_MODELS,
} from './util';

export class AnthropicMessagesProvider extends AnthropicGenericProvider {
  declare config: AnthropicMessageOptions;

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
  }

  toString(): string {
    if (!this.modelName) {
      throw new Error('Anthropic model name is not set. Please provide a valid model name.');
    }
    return `[Anthropic Messages Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    if (!this.modelName) {
      throw new Error('Anthropic model name is not set. Please provide a valid model name.');
    }

    const { system, extractedMessages, thinking } = parseMessages(prompt);

    const params: Anthropic.MessageCreateParams = {
      model: this.modelName,
      ...(system ? { system } : {}),
      max_tokens:
        this.config?.max_tokens ||
        getEnvInt('ANTHROPIC_MAX_TOKENS', this.config.thinking || thinking ? 2048 : 1024),
      messages: extractedMessages,
      stream: false,
      temperature:
        this.config.thinking || thinking
          ? this.config.temperature
          : this.config.temperature || getEnvFloat('ANTHROPIC_TEMPERATURE', 0),
      ...(this.config.tools ? { tools: maybeLoadFromExternalFile(this.config.tools) } : {}),
      ...(this.config.tool_choice ? { tool_choice: this.config.tool_choice } : {}),
      ...(this.config.thinking || thinking ? { thinking: this.config.thinking || thinking } : {}),
      ...(typeof this.config?.extra_body === 'object' && this.config.extra_body
        ? this.config.extra_body
        : {}),
    };

    logger.debug(`Calling Anthropic Messages API: ${JSON.stringify(params)}`);

    const headers: Record<string, string> = {
      ...(this.config.headers || {}),
    };

    // Add beta features header if specified
    if (this.config.beta?.length) {
      headers['anthropic-beta'] = this.config.beta.join(',');
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
          return {
            output: outputFromMessage(parsedCachedResponse, this.config.showThinking ?? true),
            tokenUsage: getTokenUsage(parsedCachedResponse, true),
            cost: calculateAnthropicCost(
              this.modelName,
              this.config,
              parsedCachedResponse.usage?.input_tokens,
              parsedCachedResponse.usage?.output_tokens,
            ),
          };
        } catch {
          // Could be an old cache item, which was just the text content from TextBlock.
          return {
            output: cachedResponse,
            tokenUsage: {},
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

      return {
        output: outputFromMessage(response, this.config.showThinking ?? true),
        tokenUsage: getTokenUsage(response, false),
        cost: calculateAnthropicCost(
          this.modelName,
          this.config,
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
