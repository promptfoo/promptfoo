import { getEnvString } from '../../envars';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { callOpenAiImageApi, formatOutput, OpenAiImageProvider } from '../openai/image';
import { REQUEST_TIMEOUT_MS } from '../shared';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { ApiProvider } from '../../types/providers';
import type { OpenAiSharedOptions } from '../openai/types';

/**
 * Configuration options for Nscale image generation.
 * Extends OpenAI shared options with Nscale-specific parameters.
 */
type NscaleImageOptions = OpenAiSharedOptions & {
  /** Number of images to generate (default: 1) */
  n?: number;
  /** Response format for generated images */
  response_format?: 'url' | 'b64_json';
  /** User identifier for tracking */
  user?: string;
  /** Image size specification (e.g., '1024x1024') */
  size?: string;
};

/**
 * Nscale image generation provider.
 *
 * Provides text-to-image generation capabilities using Nscale's Serverless Inference API.
 * Supports various image models including Flux.1 Schnell, SDXL Lightning, and Stable Diffusion XL.
 *
 * Authentication uses service tokens (preferred) or API keys.
 * Defaults to base64 JSON response format for compatibility with Nscale API.
 */
export class NscaleImageProvider extends OpenAiImageProvider {
  config: NscaleImageOptions & any;

  /**
   * Create a new Nscale image provider instance.
   *
   * @param modelName - The Nscale image model name (e.g., 'ByteDance/SDXL-Lightning-4step')
   * @param options - Provider configuration options
   */
  constructor(
    modelName: string,
    options: { config?: NscaleImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const nscaleConfig = options.config || {};
    super(modelName, {
      ...options,
      config: {
        ...nscaleConfig,
        apiBaseUrl: 'https://inference.api.nscale.com/v1',
        apiKey: NscaleImageProvider.getApiKey(options),
      } as any, // Use type assertion since Nscale supports OpenAI-compatible parameters
    });
    this.config = nscaleConfig;
  }

  /**
   * Retrieves the API key for authentication with Nscale API.
   * Prefers service tokens over API keys as API keys are deprecated as of Oct 30, 2025.
   *
   * @param options - Configuration and environment options
   * @returns The API key or service token, or undefined if not found
   */
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

  /**
   * Gets the API key for this provider instance.
   *
   * @returns The API key or service token, or undefined if not found
   */
  getApiKey(): string | undefined {
    return this.config?.apiKey || NscaleImageProvider.getApiKey({ config: this.config });
  }

  /**
   * Gets the default API URL for Nscale image generation endpoint.
   *
   * @returns The default Nscale API base URL
   */
  getApiUrlDefault(): string {
    return 'https://inference.api.nscale.com/v1';
  }

  /**
   * Gets the unique identifier for this provider instance.
   *
   * @returns Provider ID in the format "nscale:image:{modelName}"
   */
  id(): string {
    return `nscale:image:${this.modelName}`;
  }

  /**
   * Gets a string representation of this provider.
   *
   * @returns Human-readable provider description
   */
  toString(): string {
    return `[Nscale Image Provider ${this.modelName}]`;
  }

  /**
   * Calculates the cost for generating images with the specified model.
   * Pricing is based on Nscale's pricing page and varies by model.
   *
   * @param modelName - The name of the image generation model
   * @param n - Number of images to generate (default: 1)
   * @returns The estimated cost in USD
   */
  private calculateImageCost(modelName: string, n: number = 1): number {
    // Nscale pricing varies by model - these are approximate based on their pricing page
    const costPerImage: Record<string, number> = {
      'BlackForestLabs/FLUX.1-schnell': 0.0013, // $0.0013 per 1M pixels for 1024x1024
      'stabilityai/stable-diffusion-xl-base-1.0': 0.003, // $0.003 per 1M pixels
      'ByteDance/SDXL-Lightning-4step': 0.0008, // $0.0008 per 1M pixels
      'ByteDance/SDXL-Lightning-8step': 0.0016, // $0.0016 per 1M pixels
    };

    const baseCost = costPerImage[modelName] || 0.002; // Default cost
    return baseCost * n;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
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

/**
 * Factory function to create a new Nscale image provider instance.
 * Parses the provider path to extract the model name and creates the provider.
 *
 * @param providerPath - Provider path in format "nscale:image:modelName"
 * @param options - Configuration options for the provider
 * @returns A new NscaleImageProvider instance
 * @throws Error if model name is missing from the provider path
 */
export function createNscaleImageProvider(
  providerPath: string,
  options: { config?: NscaleImageOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(2).join(':');
  invariant(modelName, 'Model name is required');
  return new NscaleImageProvider(modelName, options);
}
