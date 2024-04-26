import Replicate from 'replicate';

import fetch from 'node-fetch';
import logger from '../logger';
import { getCache, isCacheEnabled } from '../cache';

import type { ApiProvider, EnvOverrides, ProviderResponse } from '../types.js';

interface ReplicateCompletionOptions {
  apiKey?: string;
  temperature?: number;
  max_length?: number;
  max_new_tokens?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  system_prompt?: string;
  stop_sequences?: string;
  seed?: number;

  prompt?: {
    prefix?: string;
    suffix?: string;
  };

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

    if (this.config.prompt?.prefix) {
      prompt = this.config.prompt.prefix + prompt;
    }
    if (this.config.prompt?.suffix) {
      prompt = prompt + this.config.prompt.suffix;
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
      const getValue = (
        configValue: number | string | undefined,
        envVar: string,
        parseFunc = (val: any) => val,
      ) => {
        const envValue = process.env[envVar];
        if (configValue !== undefined) {
          return configValue;
        } else if (envValue !== undefined) {
          return parseFunc(envValue);
        }
        return undefined;
      };

      const inputOptions = {
        max_length: getValue(this.config.max_length, 'REPLICATE_MAX_LENGTH', parseInt),
        max_new_tokens: getValue(this.config.max_new_tokens, 'REPLICATE_MAX_NEW_TOKENS', parseInt),
        temperature: getValue(this.config.temperature, 'REPLICATE_TEMPERATURE', parseFloat),
        top_p: getValue(this.config.top_p, 'REPLICATE_TOP_P', parseFloat),
        top_k: getValue(this.config.top_k, 'REPLICATE_TOP_K', parseInt),
        repetition_penalty: getValue(
          this.config.repetition_penalty,
          'REPLICATE_REPETITION_PENALTY',
          parseFloat,
        ),
        system_prompt: getValue(this.config.system_prompt, 'REPLICATE_SYSTEM_PROMPT'),
        stop_sequences: getValue(this.config.stop_sequences, 'REPLICATE_STOP_SEQUENCES'),
        seed: getValue(this.config.seed, 'REPLICATE_SEED', parseInt),
      };

      const data = {
        input: {
          ...this.config,
          prompt,
          ...Object.fromEntries(Object.entries(inputOptions).filter(([_, v]) => v !== undefined)),
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
      let formattedOutput;
      if (Array.isArray(response)) {
        if (response.length === 0 || typeof response[0] === 'string') {
          formattedOutput = response.join('');
        } else {
          formattedOutput = JSON.stringify(response);
        }
      } else if (typeof response === 'string') {
        formattedOutput = response;
      } else {
        formattedOutput = JSON.stringify(response);
      }

      const result = {
        output: formattedOutput,
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
