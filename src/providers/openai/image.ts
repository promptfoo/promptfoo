import { OpenAiGenericProvider } from '.';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { ellipsize } from '../../util/text';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { OpenAiSharedOptions } from './types';
import { formatOpenAiError } from './util';

export type OpenAiImageModel = 'dall-e-2' | 'dall-e-3';
export type OpenAiImageOperation = 'generation' | 'variation' | 'edit';
export type DallE2Size = '256x256' | '512x512' | '1024x1024';
export type DallE3Size = '1024x1024' | '1792x1024' | '1024x1792';

export const DALLE2_VALID_SIZES: DallE2Size[] = ['256x256', '512x512', '1024x1024'];
export const DALLE3_VALID_SIZES: DallE3Size[] = ['1024x1024', '1792x1024', '1024x1792'];
export const DEFAULT_SIZE = '1024x1024';

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

type OpenAiImageOptions = OpenAiSharedOptions & {
  model?: OpenAiImageModel;
} & (DallE2Options | DallE3Options);

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
    response_format: responseFormat,
  };

  if (model === 'dall-e-3') {
    if ('quality' in config && config.quality) {
      body.quality = config.quality;
    }

    if ('style' in config && config.style) {
      body.style = config.style;
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
    const formattedOutput = formatOutput(data, prompt, responseFormat);
    if (typeof formattedOutput === 'object') {
      return formattedOutput;
    }

    const cost = cached ? 0 : calculateImageCost(model, size, quality, n);

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
    if (!this.getApiKey()) {
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

    logger.debug(`Calling OpenAI Image API: ${JSON.stringify(body)}`);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.getApiKey()}`,
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
    );
  }
}
