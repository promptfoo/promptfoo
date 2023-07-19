import Replicate from 'replicate';

import fetch from 'node-fetch';
import logger from '../logger';
import { getCache, isCacheEnabled } from '../cache';

import type { ApiProvider, ProviderResponse } from '../types.js';

export class ReplicateProvider implements ApiProvider {
  modelName: string;
  apiKey?: string;
  replicate: any;

  constructor(modelName: string, apiKey?: string) {
    this.modelName = modelName;
    this.apiKey = apiKey || process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
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
        'Replicate API key is not set. Set REPLICATE_API_TOKEN environment variable or pass it as an argument to the constructor.',
      );
    }

    let cache;
    let cacheKey;
    if (isCacheEnabled()) {
      cache = await getCache();
      cacheKey = `replicate:${this.modelName}:${prompt}`;

      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        return JSON.parse(cachedResponse as string);
      }
    }

    const replicate = new Replicate({
      auth: this.apiKey,
      fetch,
    });

    logger.debug(`Calling Replicate: ${prompt}`);
    let response;
    try {
      response = await replicate.run(this.modelName as any, {
        input: {
          prompt,
          max_length: process.env.REPLICATE_MAX_LENGTH || 2046,
          temperature: process.env.REPLICATE_TEMPERATURE || 0.5,
          repetition_penalty: process.env.REPLICATE_REPETITION_PENALTY || 1.0,
        },
      });
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
