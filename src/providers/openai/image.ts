import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { ellipsize } from '../../util/text';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { OpenAiGenericProvider } from '.';
import { formatOpenAiError } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

type OpenAiImageModel =
  | 'dall-e-2'
  | 'dall-e-3'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5';
type OpenAiImageOperation = 'generation' | 'variation' | 'edit';
type DallE2Size = '256x256' | '512x512' | '1024x1024';
type DallE3Size = '1024x1024' | '1792x1024' | '1024x1792';
type GptImage1Size = '1024x1024' | '1024x1536' | '1536x1024';

const DALLE2_VALID_SIZES: DallE2Size[] = ['256x256', '512x512', '1024x1024'];
const DALLE3_VALID_SIZES: DallE3Size[] = ['1024x1024', '1792x1024', '1024x1792'];
const GPT_IMAGE1_VALID_SIZES: GptImage1Size[] = ['1024x1024', '1024x1536', '1536x1024'];
const DEFAULT_SIZE = '1024x1024';

export const DALLE2_COSTS: Record<DallE2Size, number> = {
  '256x256': 0.016,
  '512x512': 0.018,
  '1024x1024': 0.02,
};

export const DALLE3_COSTS: Record<string, number> = {
  standard_1024x1024: 0.04,
  standard_1024x1792: 0.08,
  standard_1792x1024: 0.08,
  hd_1024x1024: 0.08,
  hd_1024x1792: 0.12,
  hd_1792x1024: 0.12,
};

export const GPT_IMAGE1_COSTS: Record<string, number> = {
  low_1024x1024: 0.011,
  low_1024x1536: 0.016,
  low_1536x1024: 0.016,
  medium_1024x1024: 0.042,
  medium_1024x1536: 0.063,
  medium_1536x1024: 0.063,
  high_1024x1024: 0.167,
  high_1024x1536: 0.25,
  high_1536x1024: 0.25,
};

export const GPT_IMAGE1_MINI_COSTS: Record<string, number> = {
  low_1024x1024: 0.005,
  low_1024x1536: 0.006,
  low_1536x1024: 0.006,
  medium_1024x1024: 0.011,
  medium_1024x1536: 0.015,
  medium_1536x1024: 0.015,
  high_1024x1024: 0.036,
  high_1024x1536: 0.052,
  high_1536x1024: 0.052,
};

// GPT Image 1.5 uses token-based pricing: $32/1M output image tokens
// Estimated token counts: low ~2K, medium ~4K, high ~6K tokens per image
// Larger images use proportionally more tokens
export const GPT_IMAGE1_5_COSTS: Record<string, number> = {
  low_1024x1024: 0.064,
  low_1024x1536: 0.096,
  low_1536x1024: 0.096,
  medium_1024x1024: 0.128,
  medium_1024x1536: 0.192,
  medium_1536x1024: 0.192,
  high_1024x1024: 0.192,
  high_1024x1536: 0.288,
  high_1536x1024: 0.288,
};

type CommonImageOptions = {
  n?: number;
  response_format?: 'url' | 'b64_json';
};

type DallE3Options = CommonImageOptions & {
  size?: DallE3Size;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
};

type GptImage1Background = 'transparent' | 'opaque' | 'auto';
type GptImage1OutputFormat = 'png' | 'jpeg' | 'webp';
type GptImage1Moderation = 'auto' | 'low';

type GptImage1Options = {
  n?: number;
  size?: GptImage1Size | 'auto';
  quality?: 'low' | 'medium' | 'high' | 'auto';
  background?: GptImage1Background;
  output_format?: GptImage1OutputFormat;
  output_compression?: number;
  moderation?: GptImage1Moderation;
};

type DallE2Options = CommonImageOptions & {
  size?: DallE2Size;
  image?: string; // Base64-encoded image or image URL
  mask?: string; // Base64-encoded mask image
  operation?: OpenAiImageOperation;
};

type OpenAiImageOptions = OpenAiSharedOptions & {
  model?: OpenAiImageModel;
} & (DallE2Options | DallE3Options | GptImage1Options);

// Helper functions to check model types (including dated variants like gpt-image-1.5-2025-12-16)
function isGptImage1(model: string): boolean {
  return model === 'gpt-image-1' || model.startsWith('gpt-image-1-2025');
}

function isGptImage1Mini(model: string): boolean {
  return model === 'gpt-image-1-mini' || model.startsWith('gpt-image-1-mini-2025');
}

function isGptImage15(model: string): boolean {
  return model === 'gpt-image-1.5' || model.startsWith('gpt-image-1.5-2025');
}

function isGptImageModel(model: string): boolean {
  return isGptImage1(model) || isGptImage1Mini(model) || isGptImage15(model);
}

export function validateSizeForModel(
  size: string,
  model: string,
): { valid: boolean; message?: string } {
  if (model === 'dall-e-3' && !DALLE3_VALID_SIZES.includes(size as DallE3Size)) {
    return {
      valid: false,
      message: `Invalid size "${size}" for DALL-E 3. Valid sizes are: ${DALLE3_VALID_SIZES.join(', ')}`,
    };
  }

  if (model === 'dall-e-2' && !DALLE2_VALID_SIZES.includes(size as DallE2Size)) {
    return {
      valid: false,
      message: `Invalid size "${size}" for DALL-E 2. Valid sizes are: ${DALLE2_VALID_SIZES.join(', ')}`,
    };
  }

  if (
    isGptImageModel(model) &&
    size !== 'auto' &&
    !GPT_IMAGE1_VALID_SIZES.includes(size as GptImage1Size)
  ) {
    let modelName = model;
    if (isGptImage15(model)) {
      modelName = 'GPT Image 1.5';
    } else if (isGptImage1Mini(model)) {
      modelName = 'GPT Image 1 Mini';
    } else if (isGptImage1(model)) {
      modelName = 'GPT Image 1';
    }
    return {
      valid: false,
      message: `Invalid size "${size}" for ${modelName}. Valid sizes are: ${GPT_IMAGE1_VALID_SIZES.join(', ')}, auto`,
    };
  }

  return { valid: true };
}

export function formatOutput(
  data: any,
  prompt: string,
  responseFormat?: string,
): string | { error: string } {
  if (responseFormat === 'b64_json') {
    const b64Json = data.data[0].b64_json;
    if (!b64Json) {
      return { error: `No base64 image data found in response: ${JSON.stringify(data)}` };
    }

    return JSON.stringify(data);
  } else {
    const url = data.data[0].url;
    if (!url) {
      return { error: `No image URL found in response: ${JSON.stringify(data)}` };
    }

    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);

    return `![${ellipsizedPrompt}](${url})`;
  }
}

export function prepareRequestBody(
  model: string,
  prompt: string,
  size: string,
  responseFormat: string,
  config: any,
): Record<string, any> {
  const body: Record<string, any> = {
    model,
    prompt,
    n: config.n || 1,
    size,
  };

  // GPT Image models don't support response_format - they always return b64_json
  // and use output_format for the image file format instead
  if (!isGptImageModel(model)) {
    body.response_format = responseFormat;
  }

  if (model === 'dall-e-3') {
    if ('quality' in config && config.quality) {
      body.quality = config.quality;
    }

    if ('style' in config && config.style) {
      body.style = config.style;
    }
  }

  if (isGptImageModel(model)) {
    // Quality: low, medium, high, or auto
    if ('quality' in config && config.quality) {
      body.quality = config.quality;
    }

    // Background: transparent, opaque, or auto (only works with png/webp)
    if ('background' in config && config.background) {
      body.background = config.background;
    }

    // Output format: png, jpeg, or webp
    if ('output_format' in config && config.output_format) {
      body.output_format = config.output_format;
    }

    // Compression level for jpeg/webp (0-100)
    if ('output_compression' in config && config.output_compression !== undefined) {
      body.output_compression = config.output_compression;
    }

    // Moderation: auto or low
    if ('moderation' in config && config.moderation) {
      body.moderation = config.moderation;
    }
  }

  return body;
}

export function calculateImageCost(
  model: string,
  size: string,
  quality?: string,
  n: number = 1,
): number {
  const imageQuality = quality || 'standard';

  if (model === 'dall-e-3') {
    const costKey = `${imageQuality}_${size}`;
    const costPerImage = DALLE3_COSTS[costKey] || DALLE3_COSTS['standard_1024x1024'];
    return costPerImage * n;
  } else if (model === 'dall-e-2') {
    const costPerImage = DALLE2_COSTS[size as DallE2Size] || DALLE2_COSTS['1024x1024'];
    return costPerImage * n;
  } else if (isGptImage1(model)) {
    const q = (quality as 'low' | 'medium' | 'high') || 'low';
    const costKey = `${q}_${size}`;
    const costPerImage = GPT_IMAGE1_COSTS[costKey] || GPT_IMAGE1_COSTS['low_1024x1024'];
    return costPerImage * n;
  } else if (isGptImage1Mini(model)) {
    const q = (quality as 'low' | 'medium' | 'high') || 'low';
    const costKey = `${q}_${size}`;
    const costPerImage = GPT_IMAGE1_MINI_COSTS[costKey] || GPT_IMAGE1_MINI_COSTS['low_1024x1024'];
    return costPerImage * n;
  } else if (isGptImage15(model)) {
    const q = (quality as 'low' | 'medium' | 'high') || 'low';
    const costKey = `${q}_${size}`;
    const costPerImage = GPT_IMAGE1_5_COSTS[costKey] || GPT_IMAGE1_5_COSTS['low_1024x1024'];
    return costPerImage * n;
  }

  return 0.04 * n;
}

export async function callOpenAiImageApi(
  url: string,
  body: Record<string, any>,
  headers: Record<string, string>,
  timeout: number,
): Promise<{ data: any; cached: boolean; status: number; statusText: string; latencyMs?: number }> {
  return await fetchWithCache(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    timeout,
  );
}

export async function processApiResponse(
  data: any,
  prompt: string,
  responseFormat: string,
  cached: boolean,
  model: string,
  size: string,
  latencyMs?: number,
  quality?: string,
  n: number = 1,
): Promise<ProviderResponse> {
  if (data.error) {
    await data?.deleteFromCache?.();
    return {
      error: formatOpenAiError(data),
    };
  }

  try {
    const formattedOutput = formatOutput(data, prompt, responseFormat);
    if (typeof formattedOutput === 'object') {
      return formattedOutput;
    }

    const cost = cached ? 0 : calculateImageCost(model, size, quality, n);

    return {
      output: formattedOutput,
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

export class OpenAiImageProvider extends OpenAiGenericProvider {
  config: OpenAiImageOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const model = config.model || this.modelName;
    const operation = ('operation' in config && config.operation) || 'generation';
    // GPT Image models always return b64_json, so we treat them as such regardless of config
    const responseFormat = isGptImageModel(model) ? 'b64_json' : config.response_format || 'url';

    if (operation !== 'generation') {
      return {
        error: `Only 'generation' operations are currently supported. '${operation}' operations are not implemented.`,
      };
    }

    const endpoint = '/images/generations';
    const size = config.size || DEFAULT_SIZE;

    const sizeValidation = validateSizeForModel(size as string, model);
    if (!sizeValidation.valid) {
      return { error: sizeValidation.message };
    }

    const body = prepareRequestBody(model, prompt, size as string, responseFormat, config);

    const headers = {
      'Content-Type': 'application/json',
      ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
      ...config.headers,
    };

    let data, status, statusText;
    let cached = false;
    let latencyMs: number | undefined;
    try {
      ({ data, cached, status, statusText, latencyMs } = await callOpenAiImageApi(
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

    return processApiResponse(
      data,
      prompt,
      responseFormat,
      cached,
      model,
      size,
      latencyMs,
      config.quality,
      config.n || 1,
    );
  }
}
