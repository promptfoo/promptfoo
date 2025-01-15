import type { Cache } from 'cache-manager';
import { getCache, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../types';
import type { EnvOverrides } from '../types/env';
import { ellipsize } from '../utils/text';

type FalProviderOptions = {
  apiKey?: string;
};

class FalProvider<Input = any> implements ApiProvider {
  modelName: string;
  modelType: 'image';
  apiKey?: string;
  config: FalProviderOptions;
  input: Input;

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  private fal: typeof import('@fal-ai/serverless-client') | null = null;

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
    const { apiKey, ...input } = this.config;
    this.apiKey = apiKey ?? env?.FAL_KEY ?? getEnvString('FAL_KEY');
    this.input = input as Input;
  }

  id(): string {
    return `fal:${this.modelType}:${this.modelName}`;
  }

  toString(): string {
    return `[fal.ai Inference Provider ${this.modelName}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'fal.ai API key is not set. Set the FAL_KEY environment variable or or add `apiKey` to the provider config.',
      );
    }

    let response: any;
    let cache: Cache | undefined;
    let cached = false;

    const input = {
      prompt,
      ...this.input,
      ...(context?.prompt?.config ?? {}),
    };
    const cacheKey = `fal:${this.modelName}:${JSON.stringify(input)}`;
    if (isCacheEnabled()) {
      cache = getCache();
      const cachedResponse = await cache.get<string>(cacheKey);
      response = cachedResponse ? JSON.parse(cachedResponse) : undefined;
      cached = response !== undefined;
    }

    if (!this.fal) {
      this.fal = await import('@fal-ai/serverless-client');
    }

    this.fal.config({
      credentials: this.apiKey,
      fetch: fetch as any, // TODO fix type incompatibility
    });

    if (!response) {
      response = await this.runInference(input);
    }

    if (!cached && isCacheEnabled() && cache) {
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

  async runInference<Result = any>(input: Input): Promise<Result> {
    if (!this.fal) {
      this.fal = await import('@fal-ai/serverless-client');
    }

    const result = await this.fal.subscribe(this.modelName, {
      input,
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
    const result = await super.runInference(input);
    const url = this.resolveImageUrl(result);
    const sanitizedPrompt = input.prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    return `![${ellipsizedPrompt}](${url})` as Result;
  }

  protected resolveImageUrl(output: any): string {
    if (Array.isArray(output.images) && output.images.length > 0) {
      return output.images[0].url;
    }
    if (
      typeof output.image === 'object' &&
      'url' in output.image &&
      typeof output.image.url === 'string'
    ) {
      return output.image.url;
    }
    throw new Error('Failed to resolve image URL.');
  }
}
