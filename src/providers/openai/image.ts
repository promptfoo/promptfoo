import { OpenAiGenericProvider } from '.';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { ellipsize } from '../../util/text';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { OpenAiSharedOptions } from './types';
import { formatOpenAiError } from './util';

export type OpenAiImageModel = 'dall-e-2' | 'dall-e-3' | 'gpt-image-1';
export type OpenAiImageOperation = 'generation' | 'variation' | 'edit';
export type DallE2Size = '256x256' | '512x512' | '1024x1024';
export type DallE3Size = '1024x1024' | '1792x1024' | '1024x1792';
export type GptImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
export type GptImageQuality = 'low' | 'medium' | 'high' | 'auto';

export const DALLE2_VALID_SIZES: DallE2Size[] = ['256x256', '512x512', '1024x1024'];
export const DALLE3_VALID_SIZES: DallE3Size[] = ['1024x1024', '1792x1024', '1024x1792'];
export const GPT_IMAGE_VALID_SIZES: GptImageSize[] = ['1024x1024', '1536x1024', '1024x1536', 'auto'];
export const GPT_IMAGE_VALID_QUALITIES: GptImageQuality[] = ['low', 'medium', 'high', 'auto'];
export const DEFAULT_SIZE = '1024x1024';
export const DEFAULT_QUALITY = 'auto';

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

export const GPT_IMAGE_COSTS: Record<string, number> = {
  low_1024x1024: 0.002 * 272,    // 272 tokens
  low_1024x1536: 0.002 * 408,    // 408 tokens
  low_1536x1024: 0.002 * 400,    // 400 tokens
  medium_1024x1024: 0.002 * 1056, // 1056 tokens
  medium_1024x1536: 0.002 * 1584, // 1584 tokens
  medium_1536x1024: 0.002 * 1568, // 1568 tokens
  high_1024x1024: 0.002 * 4160,  // 4160 tokens
  high_1024x1536: 0.002 * 6240,  // 6240 tokens
  high_1536x1024: 0.002 * 6208,  // 6208 tokens
};

type CommonImageOptions = {
  n?: number;
  response_format?: 'url' | 'b64_json';
};

type GptImageOptions = CommonImageOptions & {
  size?: GptImageSize;
  quality?: GptImageQuality;
  background?: 'transparent' | 'opaque' | 'auto';
  output_format?: 'png' | 'jpeg' | 'webp';
  output_compression?: number;
  mask?: string; // Base64-encoded mask image
  moderation?: 'auto' | 'low';
};

type DallE3Options = CommonImageOptions & {
  size?: DallE3Size;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
};

type DallE2Options = CommonImageOptions & {
  size?: DallE2Size;
  image?: string; // Base64-encoded image or image URL
  mask?: string; // Base64-encoded mask image
  operation?: OpenAiImageOperation;
};

type OpenAiImageOptions = OpenAiSharedOptions & {
  model?: OpenAiImageModel;
} & (DallE2Options | DallE3Options | GptImageOptions);

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
  
  if (model === 'gpt-image-1' && !GPT_IMAGE_VALID_SIZES.includes(size as GptImageSize)) {
    return {
      valid: false,
      message: `Invalid size "${size}" for GPT Image. Valid sizes are: ${GPT_IMAGE_VALID_SIZES.join(', ')}`,
    };
  }

  return { valid: true };
}

export function validateQualityForModel(
  quality: string,
  model: string,
): { valid: boolean; message?: string } {
  if (model === 'gpt-image-1' && quality && !GPT_IMAGE_VALID_QUALITIES.includes(quality as GptImageQuality)) {
    return {
      valid: false,
      message: `Invalid quality "${quality}" for GPT Image. Valid qualities are: ${GPT_IMAGE_VALID_QUALITIES.join(', ')}`,
    };
  }

  return { valid: true };
}

export function formatOutput(
  data: any,
  prompt: string,
  responseFormat?: string,
  model?: string,
): string | { error: string } {
  // GPT Image always returns b64_json, regardless of response_format setting
  const usesBase64 = responseFormat === 'b64_json' || model === 'gpt-image-1';
  
  if (usesBase64) {
    const b64Json = data.data[0].b64_json;
    if (!b64Json) {
      return { error: `No base64 image data found in response: ${JSON.stringify(data)}` };
    }

    // For gpt-image-1 model, create a markdown image tag with embedded base64 data
    if (model === 'gpt-image-1') {
      const format = data.data[0]?.format || 'png'; // Default to png if format not specified
      const sanitizedPrompt = prompt
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')');
      const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
      
      return `![${ellipsizedPrompt}](data:image/${format};base64,${b64Json})`;
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
  
  // Only add response_format for DALL-E models, not for gpt-image-1
  if (model !== 'gpt-image-1') {
    body.response_format = responseFormat;
  }

  if (model === 'dall-e-3') {
    if ('quality' in config && config.quality) {
      body.quality = config.quality;
    }

    if ('style' in config && config.style) {
      body.style = config.style;
    }
  } else if (model === 'gpt-image-1') {
    if ('quality' in config && config.quality) {
      body.quality = config.quality;
    }
    
    if ('background' in config && config.background) {
      body.background = config.background;
    }
    
    if ('output_format' in config && config.output_format) {
      body.output_format = config.output_format;
    }
    
    if ('output_compression' in config && config.output_compression !== undefined) {
      body.output_compression = config.output_compression;
    }
    
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
  const imageQuality = quality || (model === 'gpt-image-1' ? DEFAULT_QUALITY : 'standard');

  if (model === 'dall-e-3') {
    const costKey = `${imageQuality}_${size}`;
    const costPerImage = DALLE3_COSTS[costKey] || DALLE3_COSTS['standard_1024x1024'];
    return costPerImage * n;
  } else if (model === 'dall-e-2') {
    const costPerImage = DALLE2_COSTS[size as DallE2Size] || DALLE2_COSTS['1024x1024'];
    return costPerImage * n;
  } else if (model === 'gpt-image-1') {
    // For 'auto' quality, default to medium for cost calculation
    const effectiveQuality = imageQuality === 'auto' ? 'medium' : imageQuality;
    // For 'auto' size, default to 1024x1024 for cost calculation
    const effectiveSize = size === 'auto' ? '1024x1024' : size;
    
    const costKey = `${effectiveQuality}_${effectiveSize}`;
    const costPerImage = GPT_IMAGE_COSTS[costKey] || GPT_IMAGE_COSTS['medium_1024x1024'];
    return costPerImage * n;
  }

  return 0.04 * n;
}

export async function callOpenAiImageApi(
  url: string,
  body: Record<string, any>,
  headers: Record<string, string>,
  timeout: number,
): Promise<{ data: any; cached: boolean; status: number; statusText: string }> {
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
    const formattedOutput = formatOutput(data, prompt, responseFormat, model);
    if (typeof formattedOutput === 'object') {
      return formattedOutput;
    }

    const cost = cached ? 0 : calculateImageCost(model, size, quality, n);

    // Different metadata based on model and format
    const responseMetadata = (() => {
      // For gpt-image-1, we're embedding the base64 image in a markdown format
      if (model === 'gpt-image-1') {
        return { format: 'markdown_with_embedded_image' };
      } 
      // For regular base64 response
      else if (responseFormat === 'b64_json') {
        return { isBase64: true, format: 'json' };
      }
      // Default (URL response)
      return {};
    })();

    return {
      output: formattedOutput,
      cached,
      cost,
      ...responseMetadata,
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
    callApiOptions?: CallApiOptionsParams,
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
    const responseFormat = config.response_format || 'url';

    if (operation !== 'generation' && operation !== 'edit') {
      return {
        error: `Only 'generation' and 'edit' operations are currently supported. '${operation}' operations are not implemented.`,
      };
    }

    let endpoint = '/images/generations';
    
    if (operation === 'edit') {
      if (model === 'dall-e-3') {
        return {
          error: `The 'edit' operation is not supported for DALL-E 3.`,
        };
      }
      endpoint = '/images/edits';
    }
    
    const size = config.size || DEFAULT_SIZE;
    const quality = ('quality' in config) ? config.quality : undefined;

    const sizeValidation = validateSizeForModel(size as string, model);
    if (!sizeValidation.valid) {
      return { error: sizeValidation.message };
    }
    
    if (quality) {
      const qualityValidation = validateQualityForModel(quality as string, model);
      if (!qualityValidation.valid) {
        return { error: qualityValidation.message };
      }
    }

    const body = prepareRequestBody(model, prompt, size as string, responseFormat, config);

    logger.debug(`Calling OpenAI Image API: ${JSON.stringify(body)}`);

    const headers = {
      'Content-Type': 'application/json',
      ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
      ...config.headers,
    };

    let data, status, statusText;
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

    logger.debug(`\tOpenAI image API response: ${JSON.stringify(data)}`);

    return processApiResponse(
      data,
      prompt,
      responseFormat,
      cached,
      model,
      size,
      quality,
      config.n || 1,
    );
  }
}

