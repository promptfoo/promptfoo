import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../shared';

import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { ApiProvider } from '../../types/providers';

export type HyperbolicImageOptions = {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiBaseUrl?: string;
  model_name?: string;
  prompt?: string;
  height?: number;
  width?: number;
  backend?: 'auto' | 'tvm' | 'torch';
  prompt_2?: string;
  negative_prompt?: string;
  negative_prompt_2?: string;
  image?: string;
  strength?: number;
  seed?: number;
  cfg_scale?: number;
  sampler?: string;
  steps?: number;
  style_preset?: string;
  enable_refiner?: boolean;
  controlnet_name?: string;
  controlnet_image?: string;
  loras?: Record<string, number>;
  response_format?: 'url' | 'b64_json';
};

const HYPERBOLIC_IMAGE_MODELS = [
  {
    id: 'Flux.1-dev',
    aliases: ['flux-dev', 'flux.1-dev', 'FLUX.1-dev'],
    cost: 0.025, // $0.025 per image
  },
  {
    id: 'SDXL1.0-base',
    aliases: ['sdxl', 'sdxl-base'],
    cost: 0.01, // $0.01 per image
  },
  {
    id: 'SD1.5',
    aliases: ['stable-diffusion-1.5', 'sd-1.5'],
    cost: 0.005, // $0.005 per image
  },
  {
    id: 'SD2',
    aliases: ['stable-diffusion-2', 'sd-2'],
    cost: 0.008, // $0.008 per image
  },
  {
    id: 'SSD',
    aliases: ['segmind-sd-1b'],
    cost: 0.005, // $0.005 per image
  },
  {
    id: 'SDXL-turbo',
    aliases: ['sdxl-turbo'],
    cost: 0.008, // $0.008 per image
  },
  {
    id: 'SDXL-ControlNet',
    aliases: ['sdxl-controlnet'],
    cost: 0.015, // $0.015 per image
  },
  {
    id: 'SD1.5-ControlNet',
    aliases: ['sd1.5-controlnet'],
    cost: 0.008, // $0.008 per image
  },
];

export function formatHyperbolicImageOutput(
  imageData: string,
  prompt: string,
  responseFormat?: string,
): string {
  if (responseFormat === 'b64_json') {
    // Return structured JSON for b64_json format
    return JSON.stringify({
      data: [{ b64_json: imageData }],
    });
  } else {
    // For URL format or default, format as data URL for proper rendering
    // Determine image format from base64 header
    let mimeType = 'image/jpeg'; // Default to JPEG
    if (imageData.startsWith('/9j/')) {
      mimeType = 'image/jpeg';
    } else if (imageData.startsWith('iVBORw0KGgo')) {
      mimeType = 'image/png';
    } else if (imageData.startsWith('UklGR')) {
      mimeType = 'image/webp';
    }

    // Return as data URL for proper image rendering in the viewer
    return `data:${mimeType};base64,${imageData}`;
  }
}

export class HyperbolicImageProvider implements ApiProvider {
  modelName: string;
  config: HyperbolicImageOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: HyperbolicImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
  }

  getApiKey(): string | undefined {
    if (this.config?.apiKey) {
      return this.config.apiKey;
    }
    return this.env?.HYPERBOLIC_API_KEY || getEnvString('HYPERBOLIC_API_KEY');
  }

  getApiUrl(): string {
    return this.config?.apiBaseUrl || 'https://api.hyperbolic.xyz/v1';
  }

  id(): string {
    return `hyperbolic:image:${this.modelName}`;
  }

  toString(): string {
    return `[Hyperbolic Image Provider ${this.modelName}]`;
  }

  private getApiModelName(): string {
    const model = HYPERBOLIC_IMAGE_MODELS.find(
      (m) => m.id === this.modelName || (m.aliases && m.aliases.includes(this.modelName)),
    );
    return model?.id || this.modelName;
  }

  private calculateImageCost(): number {
    const model = HYPERBOLIC_IMAGE_MODELS.find(
      (m) => m.id === this.modelName || (m.aliases && m.aliases.includes(this.modelName)),
    );
    return model?.cost || 0.01; // Default to $0.01 per image
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Hyperbolic API key is not set. Set the HYPERBOLIC_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    } as HyperbolicImageOptions;

    const modelName = config.model_name || this.getApiModelName();
    const endpoint = '/image/generation';
    const responseFormat = config.response_format || 'url';

    const body: Record<string, any> = {
      model_name: modelName,
      prompt,
      height: config.height || 1024,
      width: config.width || 1024,
      backend: config.backend || 'auto',
    };

    // Add optional parameters
    if (config.prompt_2) {
      body.prompt_2 = config.prompt_2;
    }
    if (config.negative_prompt) {
      body.negative_prompt = config.negative_prompt;
    }
    if (config.negative_prompt_2) {
      body.negative_prompt_2 = config.negative_prompt_2;
    }
    if (config.image) {
      body.image = config.image;
    }
    if (config.strength !== undefined) {
      body.strength = config.strength;
    }
    if (config.seed !== undefined) {
      body.seed = config.seed;
    }
    if (config.cfg_scale !== undefined) {
      body.cfg_scale = config.cfg_scale;
    }
    if (config.sampler) {
      body.sampler = config.sampler;
    }
    if (config.steps !== undefined) {
      body.steps = config.steps;
    }
    if (config.style_preset) {
      body.style_preset = config.style_preset;
    }
    if (config.enable_refiner !== undefined) {
      body.enable_refiner = config.enable_refiner;
    }
    if (config.controlnet_name) {
      body.controlnet_name = config.controlnet_name;
    }
    if (config.controlnet_image) {
      body.controlnet_image = config.controlnet_image;
    }
    if (config.loras) {
      body.loras = config.loras;
    }

    logger.debug(`Calling Hyperbolic Image API: ${JSON.stringify(body)}`);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    } as Record<string, string>;

    let data: any, status: number, statusText: string;
    let cached = false;
    try {
      ({ data, cached, status, statusText } = await fetchWithCache(
        `${this.getApiUrl()}${endpoint}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      ));

      if (status < 200 || status >= 300) {
        return {
          error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tHyperbolic image API response: ${JSON.stringify(data)}`);

    if (data.error) {
      return {
        error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
      };
    }

    try {
      if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
        return {
          error: 'No images returned from API',
        };
      }

      const imageData = data.images[0].image;
      const cost = cached ? 0 : this.calculateImageCost();

      // Format the output for proper rendering
      const formattedOutput = formatHyperbolicImageOutput(imageData, prompt, responseFormat);

      return {
        output: formattedOutput,
        cached,
        cost,
        ...(responseFormat === 'b64_json' ? { isBase64: true, format: 'json' } : {}),
      };
    } catch (err) {
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export function createHyperbolicImageProvider(
  providerPath: string,
  options: { config?: HyperbolicImageOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(2).join(':') || 'SDXL1.0-base';
  return new HyperbolicImageProvider(modelName, options);
}
