import { createHmac } from 'crypto';

import { getCache, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { ellipsize } from '../util/text';
import type { Cache } from 'cache-manager';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../types/index';

type FalProviderOptions = {
  apiKey?: string;
  client?: FalClientOptions;
};

type FalProxyUrl =
  | string
  | {
      url: string;
      when?: 'browser' | 'always';
    };

type FalClientOptions = {
  proxyUrl?: FalProxyUrl;
};

interface FalResult<T = unknown> {
  data: T;
  requestId: string;
}

const FAL_CACHE_KEY_HMAC_KEY = 'promptfoo:fal:cache-key:v1';

function sortObject(obj: any, seen = new WeakSet<object>()): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);
    return obj.map((item) => sortObject(item, seen));
  }

  if (typeof obj === 'object') {
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);
    return Object.keys(obj)
      .sort()
      .reduce<any>((result, key) => {
        result[key] = sortObject(obj[key], seen);
        return result;
      }, {});
  }

  return obj;
}

function omitFalSecretConfigFields(config: FalProviderOptions): Record<string, unknown> {
  const { apiKey, ...rest } = config;
  return rest;
}

function getFalModelInput(config: FalProviderOptions): Record<string, unknown> {
  const { apiKey, client, ...input } = config;
  return input;
}

function generateConfigHash(config: FalProviderOptions): string {
  const sortedConfig = sortObject(omitFalSecretConfigFields(config));
  return createHmac('sha256', FAL_CACHE_KEY_HMAC_KEY)
    .update(JSON.stringify(sortedConfig))
    .digest('hex');
}

function getAuthCacheNamespace(apiKey: string | undefined): string {
  if (!apiKey) {
    return 'no-api-key';
  }

  return createHmac('sha256', apiKey).update(`${FAL_CACHE_KEY_HMAC_KEY}:auth`).digest('hex');
}

function generateInputHash(input: unknown): string {
  return createHmac('sha256', FAL_CACHE_KEY_HMAC_KEY)
    .update(JSON.stringify(sortObject(input)))
    .digest('hex');
}

class FalProvider<Input = Record<string, unknown>> implements ApiProvider {
  modelName: string;
  modelType: 'image';
  apiKey?: string;
  config: FalProviderOptions;
  clientConfig: FalClientOptions;
  input: Input;

  private fal: typeof import('@fal-ai/client') | null = null;

  constructor(
    modelType: 'image',
    modelName: string,
    options: { config?: FalProviderOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    this.modelType = modelType;
    this.modelName = modelName;

    const { config, id, env } = options;
    this.id = id ? () => id : this.id;

    this.config = config ?? {};
    const { apiKey, client } = this.config;
    this.apiKey = apiKey ?? env?.FAL_KEY ?? getEnvString('FAL_KEY');
    this.clientConfig = client ?? {};
    this.input = getFalModelInput(this.config) as Input;
  }

  id(): string {
    return `fal:${this.modelType}:${this.modelName}`;
  }

  toString(): string {
    return `[fal.ai Inference Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  requiresApiKey(): boolean {
    return true;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'fal.ai API key is not set. Set the FAL_KEY environment variable or or add `apiKey` to the provider config.',
      );
    }

    let response: FalResult<unknown> | undefined;
    let cache: Cache | undefined;
    let cached = false;

    const input = {
      prompt,
      ...this.input,
      ...getFalModelInput((context?.prompt?.config ?? {}) as FalProviderOptions),
    };

    const cacheEnabled = isCacheEnabled();
    let cacheKey: string | undefined;
    if (cacheEnabled) {
      cacheKey = `fal:${this.modelName}:${generateConfigHash(this.config)}:${getAuthCacheNamespace(
        this.apiKey,
      )}:${generateInputHash(input)}`;
      cache = getCache();
      const cachedResponse = await cache.get<string>(cacheKey);
      response = cachedResponse ? JSON.parse(cachedResponse) : undefined;
      cached = response !== undefined;
    }

    if (!this.fal) {
      try {
        this.fal = await import('@fal-ai/client');
      } catch (err) {
        logger.error(`Error loading @fal-ai/client: ${err}`);
        throw new Error(
          'The @fal-ai/client package is required. Please install it with: npm install @fal-ai/client',
        );
      }
    }

    this.fal.fal.config({
      credentials: this.apiKey,
      ...this.clientConfig,
    } as Parameters<typeof this.fal.fal.config>[0]);

    if (!response) {
      response = await this.runInference(input);
    }

    if (!cached && cacheEnabled && cache && cacheKey) {
      try {
        await cache.set(cacheKey, JSON.stringify(response));
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }

    return {
      cached,
      output: response,
    };
  }

  async runInference<Result = FalResult<unknown>>(input: Input): Promise<Result> {
    if (!this.fal) {
      try {
        this.fal = await import('@fal-ai/client');
      } catch (err) {
        logger.error(`Error loading @fal-ai/client: ${err}`);
        throw new Error(
          'The @fal-ai/client package is required. Please install it with: npm install @fal-ai/client',
        );
      }
    }

    const result = await this.fal.fal.subscribe(this.modelName, {
      input: input as Record<string, unknown>,
    });
    return result as Result;
  }
}

type FalImageGenerationOptions = FalProviderOptions & {
  seed?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  image_size?: {
    width: number;
    height: number;
  };
};

type FalImageGenerationInput = FalImageGenerationOptions & {
  prompt: string;
};

interface FalImageOutput {
  images?: Array<{ url: string }>;
  image?: { url: string };
}

export class FalImageGenerationProvider extends FalProvider<FalImageGenerationInput> {
  constructor(
    modelName: string,
    options: { config?: FalImageGenerationOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super('image', modelName, options);
  }

  toString(): string {
    return `[fal.ai Image Generation Provider ${this.modelName}]`;
  }

  async runInference<Result = string>(input: FalImageGenerationInput): Promise<Result> {
    const result = await super.runInference<FalResult<FalImageOutput>>(input);
    const url = this.resolveImageUrl(result.data);
    const sanitizedPrompt = input.prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    return `![${ellipsizedPrompt}](${url})` as Result;
  }

  protected resolveImageUrl(output: FalImageOutput): string {
    if (Array.isArray(output.images) && output.images.length > 0) {
      return output.images[0].url;
    }
    if (
      typeof output.image === 'object' &&
      output.image !== null &&
      'url' in output.image &&
      typeof output.image.url === 'string'
    ) {
      return output.image.url;
    }
    throw new Error('Failed to resolve image URL.');
  }
}
