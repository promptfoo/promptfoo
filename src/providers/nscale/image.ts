import { getEnvString } from '../../envars';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { callOpenAiImageApi, formatOutput, OpenAiImageProvider } from '../openai/image';
import { REQUEST_TIMEOUT_MS } from '../shared';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { EnvOverrides } from '../../types/env';
import type { ApiProvider } from '../../types/providers';
import type { OpenAiSharedOptions } from '../openai/types';

type NscaleImageOptions = OpenAiSharedOptions & {
  n?: number;
  response_format?: 'url' | 'b64_json';
  user?: string;
  size?: string;
};

export class NscaleImageProvider extends OpenAiImageProvider {
  config: NscaleImageOptions;

  constructor(
    modelName: string,
    options: { config?: NscaleImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiBaseUrl: 'https://inference.api.nscale.com/v1',
        apiKey: NscaleImageProvider.getApiKey(options),
      },
    });
    this.config = options.config || {};
  }

  private static getApiKey(options: {
    config?: NscaleImageOptions;
    env?: EnvOverrides;
  }): string | undefined {
    const config = options.config || {};
    // Prefer service tokens over API keys (API keys deprecated Oct 30, 2025)
    return (
      config.apiKey ||
      options.env?.NSCALE_SERVICE_TOKEN ||
      getEnvString('NSCALE_SERVICE_TOKEN') ||
      options.env?.NSCALE_API_KEY ||
      getEnvString('NSCALE_API_KEY')
    );
  }

  getApiKey(): string | undefined {
    return this.config?.apiKey || NscaleImageProvider.getApiKey({ config: this.config });
  }

  getApiUrlDefault(): string {
    return 'https://inference.api.nscale.com/v1';
  }

  id(): string {
    return `nscale:image:${this.modelName}`;
  }

  toString(): string {
    return `[Nscale Image Provider ${this.modelName}]`;
  }

  private calculateImageCost(modelName: string, n: number = 1): number {
    // Nscale pricing varies by model - these are approximate based on their pricing page
    const costPerImage: Record<string, number> = {
      'flux/flux.1-schnell': 0.0013, // $0.0013 per 1M pixels for 1024x1024
      'stable-diffusion/xl-1.0': 0.003, // $0.003 per 1M pixels
      'bytedance/sdxl-lightning-4step': 0.0008, // $0.0008 per 1M pixels
      'bytedance/sdxl-lightning-8step': 0.0016, // $0.0016 per 1M pixels
    };

    const baseCost = costPerImage[modelName] || 0.002; // Default cost
    return baseCost * n;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Nscale service token is not set. Set the NSCALE_SERVICE_TOKEN environment variable or add `apiKey` to the provider config.',
      );
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    } as NscaleImageOptions;

    const model = this.modelName;
    const responseFormat = config.response_format || 'b64_json'; // Default to b64_json for Nscale
    const endpoint = '/images/generations';

    const body: Record<string, any> = {
      model,
      prompt,
      n: config.n || 1,
      response_format: responseFormat,
    };

    if (config.size) {
      body.size = config.size;
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
    try {
      ({ data, cached, status, statusText } = await callOpenAiImageApi(
        `${this.getApiUrl()}${endpoint}`,
        body,
        headers,
        REQUEST_TIMEOUT_MS,
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
      const formattedOutput = formatOutput(data, prompt, responseFormat);
      if (typeof formattedOutput === 'object') {
        return formattedOutput;
      }

      const cost = cached ? 0 : this.calculateImageCost(this.modelName, config.n || 1);

      return {
        output: formattedOutput,
        cached,
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

export function createNscaleImageProvider(
  providerPath: string,
  options: { config?: NscaleImageOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(2).join(':');
  invariant(modelName, 'Model name is required');
  return new NscaleImageProvider(modelName, options);
}
