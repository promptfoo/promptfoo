import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';

import { Agent, type Dispatcher, interceptors, ProxyAgent } from 'undici';
import { BLOB_MAX_SIZE } from '../../blobs/constants';
import { type FetchWithCacheResult, fetchWithCache } from '../../cache';
import logger from '../../logger';
import { fetchWithProxy, getFetchTlsOptions, getProxyUrlForTarget } from '../../util/fetch/index';
import { isSecretField, sanitizeUrl } from '../../util/sanitizer';
import { ellipsize } from '../../util/text';
import { getRequestTimeoutMs } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAIUsageCost } from './billing';
import {
  appendOpenAiApiPath,
  assertOpenAiApiModel,
  formatOpenAiError,
  hasSensitiveOpenAiCachePath,
  hasSensitiveOpenAiCacheString,
} from './util';

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
  | 'gpt-image-2.5-sunburst'
  | 'gpt-image-2.5-flare'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'chatgpt-image-latest'
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
const BLOCKED_IMAGE_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal']);
const SAFE_EXTERNAL_IMAGE_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

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

type GptImage25Options = Omit<GptImageCommonOptions, 'quality'> & {
  quality?: GptImageQuality | 'xhigh' | 'max';
  size?: GptImage2Size | 'auto';
  background?: GptImage1Background;
};

type DallE2Options = CommonImageOptions & {
  size?: DallE2Size;
  image?: string; // Base64-encoded image or image URL
  mask?: string; // Base64-encoded mask image
  operation?: OpenAiImageOperation;
};

type OpenAiImageOptions = OpenAiSharedOptions & {
  model?: OpenAiImageModel;
} & (DallE2Options | DallE3Options | GptImage1Options | GptImage2Options | GptImage25Options);

const GPT_IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'] as const;
const GPT_IMAGE25_QUALITIES = [...GPT_IMAGE_QUALITIES, 'xhigh', 'max'] as const;
const GPT_IMAGE1_BACKGROUNDS = ['transparent', 'opaque', 'auto'] as const;
const GPT_IMAGE2_BACKGROUNDS = ['opaque', 'auto'] as const;
const GPT_IMAGE_OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const;
const GPT_IMAGE_MODERATION_VALUES = ['auto', 'low'] as const;

// Helper functions to check model types (including dated variants like gpt-image-1.5-2025-12-16)
function isGptImage25(model: string): boolean {
  return /^gpt-image-2\.5-(sunburst|flare)(-\d{4}-\d{2}-\d{2})?$/.test(model);
}

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
  return (
    model === 'gpt-image-1.5' ||
    model === 'chatgpt-image-latest' ||
    model.startsWith('gpt-image-1.5-2025')
  );
}

function isGptImageModel(model: string): boolean {
  return (
    isGptImage25(model) ||
    isGptImage2(model) ||
    isGptImage1(model) ||
    isGptImage1Mini(model) ||
    isGptImage15(model)
  );
}

function getGptImageModelDisplayName(model: string): string {
  if (isGptImage25(model)) {
    return 'GPT Image 2.5';
  }
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

function validateCustomImageSize(
  size: string,
  model: string,
): { valid: boolean; message?: string } {
  if (size === 'auto') {
    return { valid: true };
  }

  const constraints =
    'Valid sizes are auto or WIDTHxHEIGHT where both dimensions are multiples of 16, the maximum edge is 3840px, the long edge to short edge ratio is at most 3:1, and total pixels are between 655,360 and 8,294,400.';

  const sizeMatch = /^(\d+)x(\d+)$/.exec(size);
  if (!sizeMatch) {
    return {
      valid: false,
      message: `Invalid size "${size}" for ${getGptImageModelDisplayName(model)}. ${constraints}`,
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
      message: `Invalid size "${size}" for ${getGptImageModelDisplayName(model)}. ${constraints}`,
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

  if (isGptImage2(model) || isGptImage25(model)) {
    return validateCustomImageSize(size, model);
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

  const validQualities: readonly string[] = isGptImage25(model)
    ? GPT_IMAGE25_QUALITIES
    : GPT_IMAGE_QUALITIES;
  if (typeof quality !== 'string' || !validQualities.includes(quality)) {
    return {
      valid: false,
      message: `Invalid quality "${String(quality)}" for ${getGptImageModelDisplayName(model)}. Valid qualities are: ${validQualities.join(', ')}.`,
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

function isExternalImageUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url);
}

function normalizeExternalImageHostname(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '').toLowerCase();
}

const blockedImageAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  blockedImageAddresses.addSubnet(address, prefix, 'ipv4');
  // Apply the same destination restrictions to NAT64 and 6to4 addresses.
  const octets = address.split('.').map(Number);
  const embedded = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  blockedImageAddresses.addSubnet(`64:ff9b::${embedded}`, 96 + prefix, 'ipv6');
  blockedImageAddresses.addSubnet(`2002:${embedded}::`, 16 + prefix, 'ipv6');
}
for (const [address, prefix] of [
  ['::', 96],
  ['64:ff9b:1::', 48],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blockedImageAddresses.addSubnet(address, prefix, 'ipv6');
}

function getUnsafeIpReason(address: string): string | undefined {
  const normalizedAddress = normalizeExternalImageHostname(address);
  const family = isIP(normalizedAddress);
  if (family && blockedImageAddresses.check(normalizedAddress, family === 4 ? 'ipv4' : 'ipv6')) {
    return `resolved to blocked IPv${family} address ${normalizedAddress}`;
  }
  return undefined;
}

type ExternalImageTargetValidation =
  | { blockReason: string; resolvedAddresses?: never }
  | { blockReason?: never; resolvedAddresses: LookupAddress[] };

async function validateExternalImageTarget(
  url: string,
  signal: AbortSignal,
): Promise<ExternalImageTargetValidation> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { blockReason: 'URL is invalid' };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { blockReason: `protocol ${parsedUrl.protocol} is not allowed` };
  }

  const hostname = normalizeExternalImageHostname(parsedUrl.hostname);
  if (!hostname) {
    return { blockReason: 'URL is missing a hostname' };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return { blockReason: 'URL credentials are not allowed' };
  }

  if (BLOCKED_IMAGE_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    return { blockReason: `hostname ${hostname} is blocked` };
  }

  const directIpReason = getUnsafeIpReason(hostname);
  if (directIpReason) {
    return { blockReason: directIpReason };
  }

  const hostnameIpFamily = isIP(hostname);
  if (hostnameIpFamily) {
    return { resolvedAddresses: [{ address: hostname, family: hostnameIpFamily }] };
  }

  try {
    const resolvedAddresses = await new Promise<LookupAddress[]>((resolve, reject) => {
      signal.throwIfAborted();
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      lookup(hostname, { all: true, verbatim: true })
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });
    if (resolvedAddresses.length === 0) {
      return { blockReason: `hostname ${hostname} did not resolve to any addresses` };
    }

    for (const resolvedAddress of resolvedAddresses) {
      const unsafeReason = getUnsafeIpReason(resolvedAddress.address);
      if (unsafeReason) {
        return { blockReason: `${hostname} ${unsafeReason}` };
      }
    }

    return { resolvedAddresses };
  } catch (error) {
    logger.warn('[OpenAI Image] Failed to resolve external image hostname', {
      url,
      hostname,
      error: String(error),
    });
    return { blockReason: `hostname ${hostname} could not be resolved` };
  }
}

async function createPinnedExternalImageDispatcher(
  url: string,
  resolvedAddresses: LookupAddress[],
): Promise<Dispatcher> {
  const tlsOptions = await getFetchTlsOptions();
  const proxyUrl = getProxyUrlForTarget(url);
  const hostname = normalizeExternalImageHostname(new URL(url).hostname);
  const requestTls = { ...tlsOptions, ...(isIP(hostname) ? {} : { servername: hostname }) };
  const agent = proxyUrl
    ? new ProxyAgent({ uri: proxyUrl, proxyTls: tlsOptions, requestTls })
    : new Agent({ connect: requestTls });
  const pinnedAgent = isIP(hostname)
    ? agent
    : agent.compose(
        interceptors.dns({
          // Pin the validated addresses while preserving the HTTP host and TLS server name.
          lookup: (_origin, _options, callback) => {
            callback(
              null,
              resolvedAddresses.map(({ address, family }) => ({
                address,
                family: family as 4 | 6,
                ttl: 60_000,
              })),
            );
          },
        }),
      );
  return pinnedAgent.compose(
    interceptors.decompress({ skipErrorResponses: false, maxSize: BLOB_MAX_SIZE }),
  );
}

function isSafeExternalImageMimeType(mimeType: string): boolean {
  return SAFE_EXTERNAL_IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

function formatImageMarkdown(prompt: string, imageSrc: string): string {
  const sanitizedPrompt = prompt
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
  const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);

  return `![${ellipsizedPrompt}](${imageSrc})`;
}

function getPrimaryImageSource(images?: ImageOutput[]): string | undefined {
  const primaryImage = images?.[0];
  return primaryImage?.blobRef?.uri || primaryImage?.data;
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
        if (isExternalImageUrl(item.url)) {
          return null;
        }
        const mimeType = inferMimeTypeFromUrl(item.url);
        return mimeType ? { data: item.url, mimeType } : { data: item.url };
      }

      return null;
    })
    .filter((item: ImageOutput | null): item is ImageOutput => item !== null);
}

async function downloadExternalImage(
  url: string,
  outputFormat?: string,
  abortSignal?: AbortSignal,
): Promise<ImageOutput | null> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), getRequestTimeoutMs());
  const signal = abortSignal
    ? AbortSignal.any([controller.signal, abortSignal])
    : controller.signal;
  let dispatcher: Dispatcher | undefined;
  try {
    signal.throwIfAborted();
    const validatedTarget = await validateExternalImageTarget(url, signal);
    if ('blockReason' in validatedTarget) {
      logger.warn('[OpenAI Image] Blocked unsafe external image URL', {
        url,
        reason: validatedTarget.blockReason,
      });
      return null;
    }

    signal.throwIfAborted();
    dispatcher = await createPinnedExternalImageDispatcher(url, validatedTarget.resolvedAddresses);
    signal.throwIfAborted();
    const downloadOptions = {
      redirect: 'error',
      signal,
      dispatcher,
      // Binary downloads must not be cloned for request logging or receive saved Cloud auth.
      headers: { 'x-promptfoo-silent': 'true' },
      skipCloudAuthInjection: true,
    } as const;
    const response = await fetchWithProxy(url, downloadOptions);
    if (!response.ok) {
      logger.warn('[OpenAI Image] Failed to download external image URL', {
        url,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > BLOB_MAX_SIZE) {
      logger.warn('[OpenAI Image] External image exceeds blob size limit', {
        url,
        contentLength,
        maxSizeBytes: BLOB_MAX_SIZE,
      });
      return null;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        totalBytes += value.byteLength;
        if (totalBytes > BLOB_MAX_SIZE) {
          controller.abort();
          logger.warn('[OpenAI Image] External image exceeded blob size limit during download', {
            url,
            sizeBytes: totalBytes,
            maxSizeBytes: BLOB_MAX_SIZE,
          });
          return null;
        }
        chunks.push(Buffer.from(value));
      }
    } else {
      const arrayBuffer = await response.arrayBuffer();
      totalBytes = arrayBuffer.byteLength;
      if (totalBytes > BLOB_MAX_SIZE) {
        controller.abort();
        logger.warn('[OpenAI Image] External image exceeded blob size limit after download', {
          url,
          sizeBytes: totalBytes,
          maxSizeBytes: BLOB_MAX_SIZE,
        });
        return null;
      }
      chunks.push(Buffer.from(arrayBuffer));
    }

    const responseMimeType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    const mimeType =
      responseMimeType || inferMimeTypeFromUrl(url) || getMimeTypeForOutputFormat(outputFormat);
    if (!isSafeExternalImageMimeType(mimeType)) {
      logger.warn('[OpenAI Image] External image response used an unsafe content type', {
        url,
        mimeType,
      });
      return null;
    }
    const buffer = Buffer.concat(chunks, totalBytes);
    return { data: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType };
  } catch (error) {
    logger.warn('[OpenAI Image] Failed to internalize external image URL', {
      url,
      error: String(error),
    });
    return null;
  } finally {
    clearTimeout(timeoutHandle);
    controller.abort();
    await dispatcher?.destroy();
  }
}

export async function buildSafeStructuredImageOutputs(
  data: any,
  outputFormat?: string,
  responseFormat?: string,
  abortSignal?: AbortSignal,
): Promise<ImageOutput[] | undefined> {
  if (!Array.isArray(data.data) || data.data.length === 0) {
    return undefined;
  }

  const images = await Promise.all(
    data.data.map(async (item: any): Promise<ImageOutput | null> => {
      if (item.b64_json) {
        const mimeType = getMimeTypeForOutputFormat(outputFormat);
        return { data: `data:${mimeType};base64,${item.b64_json}`, mimeType };
      }

      if (responseFormat === 'b64_json' || typeof item.url !== 'string') {
        return null;
      }

      if (isExternalImageUrl(item.url)) {
        return downloadExternalImage(item.url, outputFormat, abortSignal);
      }

      return item.url.startsWith('data:image/') ? { data: item.url } : null;
    }),
  );

  return images.every((item): item is ImageOutput => item !== null) ? images : undefined;
}

export function formatStructuredImageOutput(
  data: any,
  prompt: string,
  responseFormat?: string,
  outputFormat?: string,
  images?: ImageOutput[],
): string | { error: string } {
  if (responseFormat === 'b64_json') {
    const b64Json = data.data?.[0]?.b64_json;
    if (!b64Json) {
      return { error: `No base64 image data found in response: ${JSON.stringify(data)}` };
    }

    return `data:${getMimeTypeForOutputFormat(outputFormat)};base64,${b64Json}`;
  }

  const primaryImageSource = getPrimaryImageSource(images);
  if (primaryImageSource) {
    if (primaryImageSource.startsWith('data:')) {
      return primaryImageSource;
    }
    return formatImageMarkdown(prompt, primaryImageSource);
  }

  const url = data.data?.[0]?.url;
  if (!url) {
    return { error: `No image URL found in response: ${JSON.stringify(data)}` };
  }

  return { error: 'No usable image data: the external image could not be downloaded safely.' };
}

export function formatOutput(
  data: any,
  prompt: string,
  responseFormat?: string,
  outputFormat?: string,
): string | { error: string } {
  const images = buildStructuredImageOutputs(data, outputFormat);
  return formatStructuredImageOutput(data, prompt, responseFormat, outputFormat, images);
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

  // GPT Image 2.5 shares token rates with GPT Image 2, but not per-image token usage.
  if (isGptImage25(model)) {
    return undefined;
  }

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
): Promise<FetchWithCacheResult<any>> {
  let sendsToOpenAiApi = false;
  let hasSensitiveUrl = false;
  try {
    const parsedUrl = new URL(url);
    sendsToOpenAiApi = parsedUrl.hostname.toLowerCase() === 'api.openai.com';
    hasSensitiveUrl =
      sanitizeUrl(parsedUrl.toString()) !== parsedUrl.toString() ||
      hasSensitiveOpenAiCachePath(decodeURIComponent(parsedUrl.pathname));
  } catch {
    hasSensitiveUrl = true;
  }

  const isSensitiveHeader = (key: string) =>
    isSecretField(key) ||
    /(?:authorization|api[-_]?key|token|secret|signature|credential|cookie|password)/i.test(key);
  const hasSensitiveHeader = Object.entries(headers).some(
    ([key, value]) => value.trim().length > 0 && isSensitiveHeader(key),
  );
  const hasSensitiveHeaderValue = Object.entries(headers).some(
    ([key, value]) => !isSensitiveHeader(key) && hasSensitiveOpenAiCacheString(value),
  );
  const serializedBody = JSON.stringify(body);
  const hasSensitiveBody = hasSensitiveOpenAiCacheString(serializedBody);
  const bustCache =
    hasSensitiveUrl ||
    hasSensitiveHeaderValue ||
    hasSensitiveBody ||
    (!sendsToOpenAiApi && hasSensitiveHeader);
  const request = { method: 'POST', headers, body: serializedBody };

  return bustCache
    ? await fetchWithCache(url, request, timeout, 'json', true)
    : await fetchWithCache(url, request, timeout);
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
  deleteFromCache?: () => Promise<void>,
  abortSignal?: AbortSignal,
): Promise<ProviderResponse> {
  const evictFromCache = deleteFromCache ?? data?.deleteFromCache;

  if (data.error) {
    await evictFromCache?.();
    return {
      error: formatOpenAiError(data),
    };
  }

  try {
    const images = await buildSafeStructuredImageOutputs(
      data,
      outputFormat,
      responseFormat,
      abortSignal,
    );
    if (!images && data.data?.length > 1) {
      await evictFromCache?.();
      return { error: 'One or more generated images could not be downloaded safely.' };
    }
    const formattedOutput = formatStructuredImageOutput(
      data,
      prompt,
      responseFormat,
      outputFormat,
      images,
    );
    if (typeof formattedOutput === 'object') {
      await evictFromCache?.();
      return formattedOutput;
    }

    const exactUsageCost = calculateOpenAIUsageCost(model, billingConfig, data.usage, {
      cachedResponse: cached,
    });
    const cost = exactUsageCost ?? (cached ? 0 : calculateImageCost(model, size, quality, n));
    const tokenUsage = getImageTokenUsage(data, cached);

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
    await evictFromCache?.();
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
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const model = config.model || this.modelName;
    assertOpenAiApiModel(model, this.getApiUrl());
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
      ...this.getOpenAiRequestHeaders(config.headers),
    };

    let data, status, statusText;
    let cached = false;
    let latencyMs: number | undefined;
    let deleteFromCache: (() => Promise<void>) | undefined;
    let updateCache: FetchWithCacheResult<unknown>['updateCache'];
    try {
      ({ data, cached, status, statusText, latencyMs, deleteFromCache, updateCache } =
        await callOpenAiImageApi(
          appendOpenAiApiPath(this.getApiUrl(), endpoint),
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
      await deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    const response = await processApiResponse(
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
      deleteFromCache,
      callApiOptions?.abortSignal,
    );
    const images = response.images;
    if (
      images &&
      data.data.some(
        (item: { url?: string }) => typeof item.url === 'string' && isExternalImageUrl(item.url),
      )
    ) {
      try {
        await updateCache?.(
          {
            ...data,
            data: data.data.map((item: object, index: number) => ({
              ...item,
              url: images[index].data,
            })),
          },
          status,
          statusText,
        );
      } catch (error) {
        logger.warn('[OpenAI Image] Failed to cache image data', { error: String(error) });
      }
    }
    return response;
  }
}
