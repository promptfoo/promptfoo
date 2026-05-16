import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { ellipsize } from '../../util/text';
import { getRequestTimeoutMs } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAIUsageCost } from './billing';
import { formatOpenAiError } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ImageOutput,
  ProviderResponse,
} from '../../types/index';
import type { TokenUsage } from '../../types/shared';
import type { OpenAiSharedOptions } from './types';

type OpenAiImageModel =
  | 'dall-e-2'
  | 'dall-e-3'
  | 'gpt-image-2'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5';
type OpenAiImageOperation = 'generation' | 'variation' | 'edit';
type DallE2Size = '256x256' | '512x512' | '1024x1024';
type DallE3Size = '1024x1024' | '1792x1024' | '1024x1792';
type GptImage1Size = '1024x1024' | '1024x1536' | '1536x1024';
type GptImage2Size = `${number}x${number}`;

const DALLE2_VALID_SIZES: DallE2Size[] = ['256x256', '512x512', '1024x1024'];
const DALLE3_VALID_SIZES: DallE3Size[] = ['1024x1024', '1792x1024', '1024x1792'];
const GPT_IMAGE1_VALID_SIZES: GptImage1Size[] = ['1024x1024', '1024x1536', '1536x1024'];
const GPT_IMAGE2_MAX_EDGE = 3840;
const GPT_IMAGE2_MIN_PIXELS = 655_360;
const GPT_IMAGE2_MAX_PIXELS = 8_294_400;
const DATED_GPT_IMAGE2_MODEL_PATTERN = /^gpt-image-2-\d{4}-\d{2}-\d{2}$/;
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

export const GPT_IMAGE2_COSTS: Record<string, number> = {
  low_1024x1024: 0.006,
  low_1024x1536: 0.005,
  low_1536x1024: 0.005,
  medium_1024x1024: 0.053,
  medium_1024x1536: 0.041,
  medium_1536x1024: 0.041,
  high_1024x1024: 0.211,
  high_1024x1536: 0.165,
  high_1536x1024: 0.165,
};

export const GPT_IMAGE1_5_COSTS: Record<string, number> = {
  low_1024x1024: 0.009,
  low_1024x1536: 0.013,
  low_1536x1024: 0.013,
  medium_1024x1024: 0.034,
  medium_1024x1536: 0.05,
  medium_1536x1024: 0.05,
  high_1024x1024: 0.133,
  high_1024x1536: 0.2,
  high_1536x1024: 0.2,
};

type CommonImageOptions = {
  n?: number;
  response_format?: 'url' | 'b64_json';
  user?: string;
};

type DallE3Options = CommonImageOptions & {
  size?: DallE3Size;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
};

type GptImageQuality = 'low' | 'medium' | 'high' | 'auto';
type GptImage1Background = 'transparent' | 'opaque' | 'auto';
type GptImage2Background = 'opaque' | 'auto';
type GptImageOutputFormat = 'png' | 'jpeg' | 'webp';
type GptImageModeration = 'auto' | 'low';

type GptImageCommonOptions = {
  n?: number;
  quality?: GptImageQuality;
  output_format?: GptImageOutputFormat;
  output_compression?: number;
  moderation?: GptImageModeration;
  user?: string;
};

type GptImage1Options = GptImageCommonOptions & {
  size?: GptImage1Size | 'auto';
  background?: GptImage1Background;
};

type GptImage2Options = GptImageCommonOptions & {
  size?: GptImage2Size | 'auto';
  background?: GptImage2Background;
};

type DallE2Options = CommonImageOptions & {
  size?: DallE2Size;
  image?: string; // Base64-encoded image or image URL
  mask?: string; // Base64-encoded mask image
  operation?: OpenAiImageOperation;
};

type OpenAiImageOptions = OpenAiSharedOptions & {
  model?: OpenAiImageModel;
} & (DallE2Options | DallE3Options | GptImage1Options | GptImage2Options);

const GPT_IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'] as const;
const GPT_IMAGE1_BACKGROUNDS = ['transparent', 'opaque', 'auto'] as const;
const GPT_IMAGE2_BACKGROUNDS = ['opaque', 'auto'] as const;
const GPT_IMAGE_OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const;
const GPT_IMAGE_MODERATION_VALUES = ['auto', 'low'] as const;

// Helper functions to check model types (including dated variants like gpt-image-1.5-2025-12-16)
function isGptImage2(model: string): boolean {
  return model === 'gpt-image-2' || DATED_GPT_IMAGE2_MODEL_PATTERN.test(model);
}

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
  return isGptImage2(model) || isGptImage1(model) || isGptImage1Mini(model) || isGptImage15(model);
}

function getGptImageModelDisplayName(model: string): string {
  if (isGptImage2(model)) {
    return 'GPT Image 2';
  }
  if (isGptImage15(model)) {
    return 'GPT Image 1.5';
  }
  if (isGptImage1Mini(model)) {
    return 'GPT Image 1 Mini';
  }
  return 'GPT Image 1';
}

function validateGptImage2Size(size: string): { valid: boolean; message?: string } {
  if (size === 'auto') {
    return { valid: true };
  }

  const constraints =
    'Valid sizes are auto or WIDTHxHEIGHT where both dimensions are multiples of 16, the maximum edge is 3840px, the long edge to short edge ratio is at most 3:1, and total pixels are between 655,360 and 8,294,400.';

  const sizeMatch = /^(\d+)x(\d+)$/.exec(size);
  if (!sizeMatch) {
    return {
      valid: false,
      message: `Invalid size "${size}" for GPT Image 2. ${constraints}`,
    };
  }

  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const totalPixels = width * height;

  if (
    width <= 0 ||
    height <= 0 ||
    longEdge > GPT_IMAGE2_MAX_EDGE ||
    width % 16 !== 0 ||
    height % 16 !== 0 ||
    longEdge / shortEdge > 3 ||
    totalPixels < GPT_IMAGE2_MIN_PIXELS ||
    totalPixels > GPT_IMAGE2_MAX_PIXELS
  ) {
    return {
      valid: false,
      message: `Invalid size "${size}" for GPT Image 2. ${constraints}`,
    };
  }

  return { valid: true };
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

  if (isGptImage2(model)) {
    return validateGptImage2Size(size);
  }

  if (
    isGptImageModel(model) &&
    size !== 'auto' &&
    !GPT_IMAGE1_VALID_SIZES.includes(size as GptImage1Size)
  ) {
    const modelName = getGptImageModelDisplayName(model);
    return {
      valid: false,
      message: `Invalid size "${size}" for ${modelName}. Valid sizes are: ${GPT_IMAGE1_VALID_SIZES.join(', ')}, auto`,
    };
  }

  return { valid: true };
}

function validateNForModel(n: unknown, model: string): { valid: boolean; message?: string } {
  if (n === undefined) {
    return { valid: true };
  }

  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    return {
      valid: false,
      message: 'n must be a positive integer.',
    };
  }

  if (model === 'dall-e-3' && n !== 1) {
    return {
      valid: false,
      message: 'n must be 1 for DALL-E 3.',
    };
  }

  if (n > 10) {
    return {
      valid: false,
      message: 'n must be between 1 and 10.',
    };
  }

  return { valid: true };
}

function validateGptImageQualityForModel(
  quality: unknown,
  model: string,
): { valid: boolean; message?: string } {
  if (!isGptImageModel(model) || quality === undefined) {
    return { valid: true };
  }

  if (typeof quality !== 'string' || !GPT_IMAGE_QUALITIES.includes(quality as GptImageQuality)) {
    return {
      valid: false,
      message: `Invalid quality "${String(quality)}" for ${getGptImageModelDisplayName(model)}. Valid qualities are: ${GPT_IMAGE_QUALITIES.join(', ')}.`,
    };
  }

  return { valid: true };
}

function validateBackgroundForModel(
  background: unknown,
  outputFormat: string | undefined,
  model: string,
): { valid: boolean; message?: string } {
  if (!isGptImageModel(model) || background === undefined) {
    return { valid: true };
  }

  if (typeof background !== 'string') {
    return {
      valid: false,
      message: `Invalid background "${String(background)}" for ${getGptImageModelDisplayName(model)}.`,
    };
  }

  if (isGptImage2(model) && background === 'transparent') {
    return {
      valid: false,
      message:
        'background: "transparent" is not supported for GPT Image 2. Use "opaque" or "auto".',
    };
  }

  if (isGptImage2(model) && !GPT_IMAGE2_BACKGROUNDS.includes(background as GptImage2Background)) {
    return {
      valid: false,
      message: `Invalid background "${background}" for GPT Image 2. Valid backgrounds are: ${GPT_IMAGE2_BACKGROUNDS.join(', ')}.`,
    };
  }

  if (!isGptImage2(model) && !GPT_IMAGE1_BACKGROUNDS.includes(background as GptImage1Background)) {
    return {
      valid: false,
      message: `Invalid background "${background}" for ${getGptImageModelDisplayName(model)}. Valid backgrounds are: ${GPT_IMAGE1_BACKGROUNDS.join(', ')}.`,
    };
  }

  if (background === 'transparent' && outputFormat === 'jpeg') {
    return {
      valid: false,
      message:
        'background: "transparent" is not supported with output_format: "jpeg". Use "png" or "webp", or choose "opaque" or "auto" background.',
    };
  }

  return { valid: true };
}

function validateOutputFormatForModel(
  outputFormat: unknown,
  model: string,
): { valid: boolean; message?: string } {
  if (!isGptImageModel(model) || outputFormat === undefined) {
    return { valid: true };
  }

  if (
    typeof outputFormat !== 'string' ||
    !GPT_IMAGE_OUTPUT_FORMATS.includes(outputFormat as GptImageOutputFormat)
  ) {
    return {
      valid: false,
      message: `Invalid output_format "${String(outputFormat)}" for ${getGptImageModelDisplayName(model)}. Valid output formats are: ${GPT_IMAGE_OUTPUT_FORMATS.join(', ')}.`,
    };
  }

  return { valid: true };
}

function validateOutputCompressionForModel(
  outputCompression: unknown,
  outputFormat: string | undefined,
  model: string,
): { valid: boolean; message?: string } {
  if (!isGptImageModel(model) || outputCompression === undefined) {
    return { valid: true };
  }

  if (
    typeof outputCompression !== 'number' ||
    !Number.isFinite(outputCompression) ||
    outputCompression < 0 ||
    outputCompression > 100
  ) {
    return {
      valid: false,
      message: 'output_compression must be a number between 0 and 100.',
    };
  }

  if (outputFormat !== 'jpeg' && outputFormat !== 'webp') {
    return {
      valid: false,
      message:
        'output_compression is only supported when output_format is "jpeg" or "webp". Set output_format to "jpeg" or "webp", or remove output_compression.',
    };
  }

  return { valid: true };
}

function validateModerationForModel(
  moderation: unknown,
  model: string,
): { valid: boolean; message?: string } {
  if (!isGptImageModel(model) || moderation === undefined) {
    return { valid: true };
  }

  if (
    typeof moderation !== 'string' ||
    !GPT_IMAGE_MODERATION_VALUES.includes(moderation as GptImageModeration)
  ) {
    return {
      valid: false,
      message: `Invalid moderation "${String(moderation)}" for ${getGptImageModelDisplayName(model)}. Valid moderation values are: ${GPT_IMAGE_MODERATION_VALUES.join(', ')}.`,
    };
  }

  return { valid: true };
}

function validateUnsupportedImageOptions(config: any): { valid: boolean; message?: string } {
  if (config.stream === true) {
    return {
      valid: false,
      message:
        'Streaming image generation is not supported by the openai:image provider yet. Remove stream, or use a provider that supports streaming image events.',
    };
  }

  if (config.partial_images !== undefined) {
    return {
      valid: false,
      message:
        'partial_images is only supported for streaming image generation, which the openai:image provider does not support yet.',
    };
  }

  if (
    config.image !== undefined ||
    config.mask !== undefined ||
    config.input_fidelity !== undefined
  ) {
    return {
      valid: false,
      message:
        'Image edit/reference inputs are not implemented in the openai:image provider yet; only text-to-image generation is supported.',
    };
  }

  return { valid: true };
}

function validateImageRequestConfig(
  config: any,
  model: string,
  size: string,
): { valid: boolean; message?: string } {
  return (
    [
      validateUnsupportedImageOptions(config),
      validateNForModel(config.n, model),
      validateSizeForModel(size, model),
      validateGptImageQualityForModel('quality' in config ? config.quality : undefined, model),
      validateOutputFormatForModel(
        'output_format' in config ? config.output_format : undefined,
        model,
      ),
      validateBackgroundForModel(
        'background' in config ? config.background : undefined,
        'output_format' in config ? config.output_format : undefined,
        model,
      ),
      validateOutputCompressionForModel(
        'output_compression' in config ? config.output_compression : undefined,
        'output_format' in config ? config.output_format : undefined,
        model,
      ),
      validateModerationForModel('moderation' in config ? config.moderation : undefined, model),
    ].find((validation) => !validation.valid) || { valid: true }
  );
}

function getMimeTypeForOutputFormat(outputFormat?: string): string {
  switch (outputFormat) {
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

function inferMimeTypeFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (pathname.endsWith('.webp')) {
      return 'image/webp';
    }
    if (pathname.endsWith('.gif')) {
      return 'image/gif';
    }
    if (pathname.endsWith('.svg')) {
      return 'image/svg+xml';
    }
    if (pathname.endsWith('.png')) {
      return 'image/png';
    }
  } catch {
    // Ignore invalid URLs and fall back to undefined mime type.
  }

  return undefined;
}

export function buildStructuredImageOutputs(
  data: any,
  outputFormat?: string,
): ImageOutput[] | undefined {
  if (!Array.isArray(data.data) || data.data.length === 0) {
    return undefined;
  }

  return data.data
    .map((item: any): ImageOutput | null => {
      if (item.b64_json) {
        const mimeType = getMimeTypeForOutputFormat(outputFormat);
        return { data: `data:${mimeType};base64,${item.b64_json}`, mimeType };
      }

      if (item.url) {
        const mimeType = inferMimeTypeFromUrl(item.url);
        return mimeType ? { data: item.url, mimeType } : { data: item.url };
      }

      return null;
    })
    .filter((item: ImageOutput | null): item is ImageOutput => item !== null);
}

export function formatOutput(
  data: any,
  prompt: string,
  responseFormat?: string,
  outputFormat?: string,
): string | { error: string } {
  if (responseFormat === 'b64_json') {
    const b64Json = data.data[0].b64_json;
    if (!b64Json) {
      return { error: `No base64 image data found in response: ${JSON.stringify(data)}` };
    }

    return `data:${getMimeTypeForOutputFormat(outputFormat)};base64,${b64Json}`;
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
    n: config.n ?? 1,
    size,
  };

  if ('user' in config && config.user) {
    body.user = config.user;
  }

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

    // Background options are model-dependent.
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
): number | undefined {
  const imageQuality = quality || 'standard';
  const gptImageQuality =
    quality === 'medium' || quality === 'high' || quality === 'low' ? quality : 'low';

  if (model === 'dall-e-3') {
    const costKey = `${imageQuality}_${size}`;
    const costPerImage = DALLE3_COSTS[costKey] || DALLE3_COSTS['standard_1024x1024'];
    return costPerImage * n;
  } else if (model === 'dall-e-2') {
    const costPerImage = DALLE2_COSTS[size as DallE2Size] || DALLE2_COSTS['1024x1024'];
    return costPerImage * n;
  } else if (isGptImage2(model)) {
    if (quality !== 'medium' && quality !== 'high' && quality !== 'low') {
      return undefined;
    }

    const costKey = `${gptImageQuality}_${size}`;
    const costPerImage = GPT_IMAGE2_COSTS[costKey];
    if (costPerImage === undefined) {
      return undefined;
    }

    return costPerImage * n;
  } else if (isGptImage1(model)) {
    const costKey = `${gptImageQuality}_${size}`;
    const costPerImage = GPT_IMAGE1_COSTS[costKey] || GPT_IMAGE1_COSTS['low_1024x1024'];
    return costPerImage * n;
  } else if (isGptImage1Mini(model)) {
    const costKey = `${gptImageQuality}_${size}`;
    const costPerImage = GPT_IMAGE1_MINI_COSTS[costKey] || GPT_IMAGE1_MINI_COSTS['low_1024x1024'];
    return costPerImage * n;
  } else if (isGptImage15(model)) {
    const costKey = `${gptImageQuality}_${size}`;
    const costPerImage = GPT_IMAGE1_5_COSTS[costKey] || GPT_IMAGE1_5_COSTS['low_1024x1024'];
    return costPerImage * n;
  }

  return 0.04 * n;
}

function getImageTokenUsage(data: any, cached: boolean): TokenUsage | undefined {
  if (!data.usage) {
    return undefined;
  }

  const prompt = data.usage.prompt_tokens ?? data.usage.input_tokens ?? 0;
  const completion = data.usage.completion_tokens ?? data.usage.output_tokens ?? 0;
  const total = data.usage.total_tokens ?? prompt + completion;

  if (cached) {
    return { cached: total, total };
  }

  return {
    prompt,
    completion,
    total,
    numRequests: 1,
  };
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
  outputFormat?: string,
  billingConfig: OpenAiImageOptions = {},
): Promise<ProviderResponse> {
  if (data.error) {
    await data?.deleteFromCache?.();
    return {
      error: formatOpenAiError(data),
    };
  }

  try {
    const formattedOutput = formatOutput(data, prompt, responseFormat, outputFormat);
    if (typeof formattedOutput === 'object') {
      return formattedOutput;
    }

    const exactUsageCost = calculateOpenAIUsageCost(model, billingConfig, data.usage, {
      cachedResponse: cached,
    });
    const cost = exactUsageCost ?? (cached ? 0 : calculateImageCost(model, size, quality, n));
    const tokenUsage = getImageTokenUsage(data, cached);
    const images = buildStructuredImageOutputs(data, outputFormat);

    return {
      output: formattedOutput,
      images,
      cached,
      latencyMs,
      ...(cost === undefined ? {} : { cost }),
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(data.usage ? { metadata: { usage: data.usage } } : {}),
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
      throw new Error(this.getMissingApiKeyErrorMessage());
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

    const requestValidation = validateImageRequestConfig(config, model, size as string);
    if (!requestValidation.valid) {
      return { error: requestValidation.message };
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

    return processApiResponse(
      data,
      prompt,
      responseFormat,
      cached,
      model,
      size,
      latencyMs,
      config.quality,
      config.n ?? 1,
      'output_format' in config ? config.output_format : undefined,
      config,
    );
  }
}
