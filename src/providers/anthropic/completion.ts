import Anthropic from '@anthropic-ai/sdk';
import { getCache, isCacheEnabled } from '../../cache';
import { getEnvString, getEnvInt, getEnvFloat } from '../../envars';
import logger from '../../logger';
import type { ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { AnthropicGenericProvider } from './generic';
import type { AnthropicCompletionOptions } from './types';

export class AnthropicCompletionProvider extends AnthropicGenericProvider {
  static ANTHROPIC_COMPLETION_MODELS = [
    'claude-1',
    'claude-1-100k',
    'claude-instant-1',
    'claude-instant-1.2',
    'claude-instant-1-100k',
    'claude-2',
    'claude-2.1',
  ];

  declare config: AnthropicCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: AnthropicCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    let stop: string[];
    try {
      stop = getEnvString('ANTHROPIC_STOP')
        ? JSON.parse(getEnvString('ANTHROPIC_STOP') || '')
        : ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`ANTHROPIC_STOP is not a valid JSON string: ${err}`);
    }

    const params: Anthropic.CompletionCreateParams = {
      model: this.modelName,
      prompt: `${Anthropic.HUMAN_PROMPT} ${prompt} ${Anthropic.AI_PROMPT}`,
      max_tokens_to_sample:
        this.config?.max_tokens_to_sample || getEnvInt('ANTHROPIC_MAX_TOKENS', 1024),
      temperature: this.config.temperature ?? getEnvFloat('ANTHROPIC_TEMPERATURE', 0),
      stop_sequences: stop,
    };

    logger.debug(`Calling Anthropic API: ${JSON.stringify(params)}`);

    const cache = await getCache();
    const cacheKey = `anthropic:${JSON.stringify(params)}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        return {
          output: JSON.parse(cachedResponse as string),
          tokenUsage: {},
        };
      }
    }

    let response;
    try {
      response = await this.anthropic.completions.create(params);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tAnthropic API response: ${JSON.stringify(response)}`);
    if (isCacheEnabled()) {
      try {
        await cache.set(cacheKey, JSON.stringify(response.completion));
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }
    try {
      return {
        output: response.completion,
        tokenUsage: {}, // TODO: add token usage once Anthropic API supports it
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response)}`,
      };
    }
  }
}
