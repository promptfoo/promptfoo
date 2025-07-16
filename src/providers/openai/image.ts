import { OpenAiGenericProvider } from '.';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { saveBase64Asset } from '../../util/assetStorage';
import { ellipsize } from '../../util/text';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { OpenAiSharedOptions } from './types';
import { formatOpenAiError } from './util';

type OpenAiImageModel = 'dall-e-2' | 'dall-e-3' | 'gpt-image-1';
type OpenAiImageOperation = 'generation' | 'variation' | 'edit';
type DallE2Size = '256x256' | '512x512' | '1024x1024';
type DallE3Size = '1024x1024' | '1792x1024' | '1024x1792';
type GptImage1Size = '1024x1024' | '1536x1024' | '1024x1536' | 'auto';

const DALLE2_VALID_SIZES: DallE2Size[] = ['256x256', '512x512', '1024x1024'];
const DALLE3_VALID_SIZES: DallE3Size[] = ['1024x1024', '1792x1024', '1024x1792'];
const GPT_IMAGE_1_VALID_SIZES: GptImage1Size[] = ['1024x1024', '1536x1024', '1024x1536', 'auto'];
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

// GPT-image-1 uses token-based pricing
// Approximate costs per image based on quality and size
export const GPT_IMAGE_1_COSTS: Record<string, number> = {
  low_1024x1024: 0.01,
  low_1536x1024: 0.015,
  low_1024x1536: 0.015,
  medium_1024x1024: 0.04,
  medium_1536x1024: 0.06,
  medium_1024x1536: 0.06,
  high_1024x1024: 0.17,
  high_1536x1024: 0.255,
  high_1024x1536: 0.255,
  auto_1024x1024: 0.04, // Default to medium
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

type DallE2Options = CommonImageOptions & {
  size?: DallE2Size;
  image?: string; // Base64-encoded image or image URL
  mask?: string; // Base64-encoded mask image
  operation?: OpenAiImageOperation;
};

type GptImage1Options = CommonImageOptions & {
  size?: GptImage1Size;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  output_compression?: number; // 0-100 for JPEG and WEBP
  output_format?: 'jpeg' | 'png' | 'webp';
  background?: 'transparent'; // Only for PNG or WEBP
  image?: string[]; // Array of base64-encoded images or URLs (up to 10)
  mask?: string; // Base64-encoded mask image with alpha channel
  operation?: OpenAiImageOperation;
};

type OpenAiImageOptions = OpenAiSharedOptions & {
  model?: OpenAiImageModel;
} & (DallE2Options | DallE3Options | GptImage1Options);

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

  if (model === 'gpt-image-1' && !GPT_IMAGE_1_VALID_SIZES.includes(size as GptImage1Size)) {
    return {
      valid: false,
      message: `Invalid size "${size}" for GPT-image-1. Valid sizes are: ${GPT_IMAGE_1_VALID_SIZES.join(', ')}`,
    };
  }

  return { valid: true };
}

export function formatOutput(
  data: any,
  prompt: string,
  responseFormat?: string,
  model?: string,
  outputFormat?: string,
): string | { error: string } {
  // Handle gpt-image-1 response format
  if (model === 'gpt-image-1') {
    logger.debug(`GPT-image-1 response: ${JSON.stringify(data)}`);
    
    // Check if we have the expected structure
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const firstItem = data.data[0];
      
      // GPT-image-1 primarily returns base64 data
      if (firstItem.b64_json) {
        // Save base64 as asset file
        let mimeType = 'image/png'; // Default
        if (outputFormat === 'jpeg' || outputFormat === 'jpg') {
          mimeType = 'image/jpeg';
        } else if (outputFormat === 'webp') {
          mimeType = 'image/webp';
        }
        
        const sanitizedPrompt = prompt
          .replace(/\r?\n|\r/g, ' ')
          .replace(/\[/g, '(')
          .replace(/\]/g, ')');
        const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
        
        const asset = saveBase64Asset(
          firstItem.b64_json,
          mimeType,
          `${ellipsizedPrompt}.${outputFormat || 'png'}`
        );
        
        return `![${ellipsizedPrompt}](${asset.url})`;
      }
      
      // But can also return URLs (for compatibility/testing)
      if (firstItem.url) {
        const url = firstItem.url;
        const sanitizedPrompt = prompt
          .replace(/\r?\n|\r/g, ' ')
          .replace(/\[/g, '(')
          .replace(/\]/g, ')');
        const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
        return `![${ellipsizedPrompt}](${url})`;
      }
    }
    
    // Handle single base64 response at top level
    if (data.b64_json) {
      let mimeType = 'image/png'; // Default
      if (outputFormat === 'jpeg' || outputFormat === 'jpg') {
        mimeType = 'image/jpeg';
      } else if (outputFormat === 'webp') {
        mimeType = 'image/webp';
      }
      
      const sanitizedPrompt = prompt
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')');
      const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
      
      const asset = saveBase64Asset(
        data.b64_json,
        mimeType,
        `${ellipsizedPrompt}.${outputFormat || 'png'}`
      );
      
      return `![${ellipsizedPrompt}](${asset.url})`;
    }
    
    // Check for error conditions
    if (data.created && !data.data) {
      return { error: `GPT-image-1 may not be available yet or requires special access. Response has 'created' field but no 'data' array.` };
    }
    
    // If we get a different structure, return error
    return { error: `Unexpected GPT-image-1 response format: ${JSON.stringify(data)}` };
  }

  // Handle other models (DALL-E 2/3)
  if (responseFormat === 'b64_json') {
    const b64Json = data.data[0].b64_json;
    if (!b64Json) {
      return { error: `No base64 image data found in response: ${JSON.stringify(data)}` };
    }

    // Save base64 as asset file
    const mimeType = 'image/png';
    
    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    
    const asset = saveBase64Asset(
      b64Json,
      mimeType,
      `${ellipsizedPrompt}.png`
    );
    
    return `![${ellipsizedPrompt}](${asset.url})`;
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
    size: size === 'auto' ? undefined : size,
  };

  // Only add response_format for models that support it
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
  }

  if (model === 'gpt-image-1') {
    if ('quality' in config && config.quality) {
      body.quality = config.quality;
    }

    if ('output_compression' in config && config.output_compression !== undefined) {
      body.output_compression = config.output_compression;
    }

    if ('output_format' in config && config.output_format) {
      body.output_format = config.output_format;
    }

    if ('background' in config && config.background) {
      body.background = config.background;
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
  } else if (model === 'gpt-image-1') {
    const gptQuality = quality || 'medium';
    const actualSize = size === 'auto' ? '1024x1024' : size;
    const costKey = `${gptQuality}_${actualSize}`;
    const costPerImage = GPT_IMAGE_1_COSTS[costKey] || GPT_IMAGE_1_COSTS['medium_1024x1024'];
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
  outputFormat?: string,
): Promise<ProviderResponse> {
  if (data.error) {
    await data?.deleteFromCache?.();
    return {
      error: formatOpenAiError(data),
    };
  }

  try {
    const formattedOutput = formatOutput(data, prompt, responseFormat, model, outputFormat);
    if (typeof formattedOutput === 'object') {
      return formattedOutput;
    }

    const cost = cached ? 0 : calculateImageCost(model, size, quality, n);

    return {
      output: formattedOutput,
      cached,
      cost,
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

    // Handle different operations and endpoints
    let endpoint = '/images/generations';
    if (model === 'gpt-image-1' && operation === 'edit' && (config.image || config.mask)) {
      endpoint = '/images/edits';
    } else if (operation !== 'generation') {
      return {
        error: `Only 'generation' operations are currently supported for ${model}. '${operation}' operations are not implemented.`,
      };
    }

    const size = config.size || DEFAULT_SIZE;

    const sizeValidation = validateSizeForModel(size as string, model);
    if (!sizeValidation.valid) {
      return { error: sizeValidation.message };
    }

    let body = prepareRequestBody(model, prompt, size as string, responseFormat, config);

    // Handle gpt-image-1 edit mode with images
    if (model === 'gpt-image-1' && endpoint === '/images/edits') {
      body = {
        ...body,
        image: config.image || [],
        ...(config.mask && { mask: config.mask }),
      };
    }

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
      config.quality,
      config.n || 1,
      config.output_format,
    );
  }
}
