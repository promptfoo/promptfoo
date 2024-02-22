import Replicate from 'replicate';

import fetch, {Request,RequestInit, Response} from 'node-fetch';
import logger from '../logger';
import { getCache, isCacheEnabled } from '../cache';

import type { ApiProvider, EnvOverrides, ProviderResponse } from '../types.js';

interface ReplicateCompletionOptions {
  apiKey?: string;
  temperature?: number;
  max_length?: number;
  max_new_tokens?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;

  // Any other key-value pairs will be passed to the Replicate API as-is
  [key: string]: any;
}

export class ReplicateProvider implements ApiProvider {
  modelName: string;
  apiKey?: string;
  replicate: any;
  config: ReplicateCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: ReplicateCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.modelName = modelName;
    this.apiKey =
      config?.apiKey ||
      env?.REPLICATE_API_KEY ||
      env?.REPLICATE_API_TOKEN ||
      process.env.REPLICATE_API_TOKEN ||
      process.env.REPLICATE_API_KEY;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `replicate:${this.modelName}`;
  }

  toString(): string {
    return `[Replicate Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Replicate API key is not set. Set the REPLICATE_API_TOKEN environment variable or or add `apiKey` to the provider config.',
      );
    }

    let cache;
    let cacheKey;
    if (isCacheEnabled()) {
      cache = await getCache();
      cacheKey = `replicate:${this.modelName}:${JSON.stringify(this.config)}:${prompt}`;

      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        return JSON.parse(cachedResponse as string);
      }
    }

    const replicate = new Replicate({
      auth: this.apiKey,
      fetch: fetch as any,
    });

    logger.debug(`Calling Replicate: ${prompt}`);
    let response;
    try {
      const data = {
        input: {
          ...this.config,
          prompt,
          max_length:
            this.config.max_length || parseInt(process.env.REPLICATE_MAX_LENGTH || '2046', 10),
          max_new_tokens:
            this.config.max_new_tokens || parseInt(process.env.REPLICATE_MAX_NEW_TOKENS || '1024', 10),
          temperature:
            this.config.temperature || parseFloat(process.env.REPLICATE_TEMPERATURE || '0.01'),
          top_p:
            this.config.top_p || parseFloat(process.env.REPLICATE_TOP_P || '1.0'),
          top_k:
            this.config.top_k || parseInt(process.env.REPLICATE_TOP_K || '0', 10),
          repetition_penalty:
            this.config.repetition_penalty ||
            parseFloat(process.env.REPLICATE_REPETITION_PENALTY || '1.0'),
        },
      };
      response = await replicate.run(this.modelName as any, data);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tReplicate API response: ${JSON.stringify(response)}`);
    try {
      const result = {
        output: (response as string[]).join(''),
        tokenUsage: {}, // TODO: add token usage once Replicate API supports it
      };
      if (cache && cacheKey) {
        await cache.set(cacheKey, JSON.stringify(result));
      }
      return result;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response)}`,
      };
    }
  }
}
