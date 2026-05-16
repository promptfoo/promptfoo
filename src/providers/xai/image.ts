import { getEnvString } from '../../envars';
import logger from '../../logger';
import invariant from '../../util/invariant';
import {
  buildSafeStructuredImageOutputs,
  callOpenAiImageApi,
  formatStructuredImageOutput,
  OpenAiImageProvider,
} from '../openai/image';
import { getRequestTimeoutMs } from '../shared';
import { getXAICostInUsd } from './chat';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { ApiProvider } from '../../types/providers';
import type { OpenAiSharedOptions } from '../openai/types';

type XaiImageOptions = OpenAiSharedOptions & {
  region?: string;
  n?: number;
  response_format?: 'url' | 'b64_json';
  user?: string;
  aspect_ratio?: string;
  quality?: 'low' | 'medium' | 'high';
  resolution?: '1k' | '2k';
  image?: { url: string };
  images?: { url: string }[];
  mask?: { url: string };
};

export class XAIImageProvider extends OpenAiImageProvider {
  config: XaiImageOptions;

  constructor(
    modelName: string,
    options: { config?: XaiImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const userConfig = options.config || {};
    // Resolve the base URL up front so `region` actually takes effect: the OpenAI
    // base provider reads `config.apiBaseUrl` directly and never calls our
    // `getApiUrlDefault()` when it's set, so an unconditional default would
    // silently swallow a regional override.
    const apiBaseUrl =
      userConfig.apiBaseUrl ??
      (userConfig.region ? `https://${userConfig.region}.api.x.ai/v1` : 'https://api.x.ai/v1');

    super(modelName, {
      ...options,
      config: {
        ...userConfig,
        apiKeyEnvar: 'XAI_API_KEY',
        apiBaseUrl,
      },
    });
    this.config = userConfig;
  }

  getApiKey(): string | undefined {
    if (this.config?.apiKey) {
      return this.config.apiKey;
    }
    return getEnvString('XAI_API_KEY');
  }

  getApiUrlDefault(): string {
    if (this.config.region) {
      return `https://${this.config.region}.api.x.ai/v1`;
    }
    return 'https://api.x.ai/v1';
  }

  id(): string {
    return `xai:image:${this.modelName}`;
  }

  toString(): string {
    return `[xAI Image Provider ${this.modelName}]`;
  }

  private getApiModelName(): string {
    const modelMap: Record<string, string> = {
      'grok-imagine-image': 'grok-imagine-image',
      // Dated alias for grok-imagine-image, as listed by xAI's image-generation-models API.
      'grok-imagine-image-2026-03-02': 'grok-imagine-image',
      'grok-imagine-image-quality': 'grok-imagine-image-quality',
      // xAI exposes dated and -latest aliases for the quality model; route them to
      // the canonical slug so fallback pricing and request routing stay consistent.
      'grok-imagine-image-quality-latest': 'grok-imagine-image-quality',
      'grok-imagine-image-quality-20260403': 'grok-imagine-image-quality',
      'grok-imagine-image-pro': 'grok-imagine-image-pro',
      'grok-2-image': 'grok-2-image',
      'grok-image': 'grok-2-image',
    };
    if (modelMap[this.modelName]) {
      return modelMap[this.modelName];
    }
    // Preserve unknown Grok Imagine slugs as-is rather than silently routing
    // them to the legacy `grok-2-image` model. This avoids surprising downgrades
    // when xAI publishes new aliases that promptfoo has not yet indexed.
    if (this.modelName.startsWith('grok-imagine-')) {
      return this.modelName;
    }
    return 'grok-2-image';
  }

  private calculateImageCost(
    model: string,
    n: number = 1,
    resolution: XaiImageOptions['resolution'] = '1k',
    sourceImageCount: number = 0,
  ): number {
    // xAI redirects this retired slug to the quality model after May 15, 2026.
    const pricingModel = model === 'grok-imagine-image-pro' ? 'grok-imagine-image-quality' : model;

    if (pricingModel === 'grok-imagine-image') {
      return 0.02 * n + 0.002 * sourceImageCount;
    }
    if (pricingModel === 'grok-imagine-image-quality') {
      const perImage = resolution === '2k' ? 0.07 : 0.05;
      return perImage * n + 0.01 * sourceImageCount;
    }

    // Legacy grok-2-image pricing.
    return 0.07 * n;
  }

  private countSourceImages(config: XaiImageOptions): number {
    return Number(Boolean(config.image)) + (config.images?.length || 0);
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(
        'xAI API key is not set. Set the XAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    } as XaiImageOptions;

    const model = this.getApiModelName();
    const responseFormat = config.response_format || 'url';
    const isEdit = Boolean(config.image || config.images?.length || config.mask);
    const endpoint = isEdit ? '/images/edits' : '/images/generations';

    const body: Record<string, any> = {
      model,
      prompt,
      n: config.n || 1,
      response_format: responseFormat,
    };
    if (config.aspect_ratio) {
      body.aspect_ratio = config.aspect_ratio;
    }
    if (config.quality) {
      body.quality = config.quality;
    }
    if (config.resolution) {
      body.resolution = config.resolution;
    }
    if (config.image) {
      body.image = config.image;
    }
    if (config.images?.length) {
      body.images = config.images;
    }
    if (config.mask) {
      body.mask = config.mask;
    }
    if (config.user) {
      body.user = config.user;
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
      ...config.headers,
    } as Record<string, string>;

    let data: any, status: number, statusText: string;
    let cached = false;
    let latencyMs: number | undefined;
    try {
      ({ data, cached, status, statusText, latencyMs } = await callOpenAiImageApi(
        `${this.getApiUrl()}${endpoint}`,
        body,
        headers,
        getRequestTimeoutMs(),
      ));
      if (status < 200 || status >= 300) {
        return {
          error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      await data?.deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    if (data.error) {
      await data?.deleteFromCache?.();
      return {
        error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
      };
    }

    try {
      const images = await buildSafeStructuredImageOutputs(data, undefined, context);
      const formattedOutput = formatStructuredImageOutput(
        data,
        prompt,
        responseFormat,
        undefined,
        images,
      );
      if (typeof formattedOutput === 'object') {
        await data?.deleteFromCache?.();
        return formattedOutput;
      }

      const reportedCost = getXAICostInUsd(data.usage);
      const cost = cached
        ? 0
        : (reportedCost ??
          this.calculateImageCost(
            model,
            config.n || 1,
            config.resolution,
            this.countSourceImages(config),
          ));

      return {
        output: formattedOutput,
        images,
        cached,
        latencyMs,
        cost,
        ...(responseFormat === 'b64_json' ? { isBase64: true, format: 'json' } : {}),
      };
    } catch (err) {
      await data?.deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export function createXAIImageProvider(
  providerPath: string,
  options: { config?: XaiImageOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(2).join(':');
  invariant(modelName, 'Model name is required');
  return new XAIImageProvider(modelName, options);
}
