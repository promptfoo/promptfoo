import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../shared';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
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
  _prompt: string,
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
    _callApiOptions?: CallApiOptionsParams,
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
    addHyperbolicOptionalParams(body, config);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    } as Record<string, string>;

    let data: any, status: number, statusText: string, latencyMs: number | undefined;
    let cached = false;
    try {
      ({ data, cached, status, statusText, latencyMs } = await fetchWithCache(
        `${this.getApiUrl()}${endpoint}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
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
        latencyMs,
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

function addHyperbolicOptionalParams(body: Record<string, any>, config: HyperbolicImageOptions) {
  const optionalParams: Array<keyof HyperbolicImageOptions> = [
    'prompt_2',
    'negative_prompt',
    'negative_prompt_2',
    'image',
    'strength',
    'seed',
    'cfg_scale',
    'sampler',
    'steps',
    'style_preset',
    'enable_refiner',
    'controlnet_name',
    'controlnet_image',
    'loras',
  ];

  for (const key of optionalParams) {
    const value = config[key];
    if (value !== undefined && value !== null && value !== '') {
      body[key] = value;
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
