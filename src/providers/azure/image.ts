/**
 * Azure AI Foundry Image Provider for Microsoft MAI image models.
 *
 * Generates and edits images using Microsoft's MAI image models
 * (e.g. MAI-Image-2.7, MAI-Image-2.7-Flash, MAI-Image-2.6)
 * deployed in Microsoft Foundry.
 *
 * Unlike Azure OpenAI image models (DALL·E / gpt-image), MAI image models are
 * served from Microsoft-managed `/mai/v1/images/generations` (JSON) and
 * `/mai/v1/images/edits` (multipart, 1 to 5 reference images) routes on the
 * resource's `*.services.ai.azure.com` endpoint and do not take an
 * `api-version` query parameter.
 *
 * Usage: azure:image:<deployment-name>
 *
 * Environment variables:
 * - AZURE_API_KEY or AZURE_OPENAI_API_KEY (or Entra ID via AZURE_CLIENT_ID /
 *   AZURE_CLIENT_SECRET / AZURE_TENANT_ID, or `az login`)
 * - AZURE_API_HOST / AZURE_API_BASE_URL (the `*.services.ai.azure.com` endpoint)
 *
 * @see https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';

import { fetchWithCache } from '../../cache';
import cliState from '../../cliState';
import logger from '../../logger';
import { sha256 } from '../../util/createHash';
import invariant from '../../util/invariant';
import { renderVarsInObject } from '../../util/render';
import { isCredentialHeader } from '../../util/sanitizer';
import { getRequestTimeoutMs, shouldBustProviderCache } from '../shared';
import {
  DEFAULT_AZURE_MAI_IMAGE_API_PATH,
  DEFAULT_AZURE_MAI_IMAGE_EDIT_API_PATH,
  MAX_MAI_IMAGE_BYTES,
} from './defaults';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

import type { CacheOptions } from '../../types/cache';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ImageOutput,
  ProviderResponse,
} from '../../types/index';
import type { AzureImageOptions, AzureProviderOptions } from './types';

/** Minimum width/height accepted by every MAI image model, in pixels. */
const MIN_DIMENSION = 768;
const DEFAULT_DIMENSION = 1024;
/** The MAI image edits API accepts 1 to 5 reference images per request. */
const MAX_EDIT_IMAGES = 5;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type MaiEditImageMimeType = 'image/png' | 'image/jpeg';

export interface MaiEditImage {
  bytes: Buffer<ArrayBuffer>;
  mimeType: MaiEditImageMimeType;
}

function checkEditImageSize(size: number) {
  if (size > MAX_MAI_IMAGE_BYTES) {
    throw new Error(`MAI reference images must be at most ${MAX_MAI_IMAGE_BYTES} bytes`);
  }
}

/** Identify a JPEG or PNG from its leading bytes; the edits API accepts only those. */
function detectMaiEditImageType(bytes: Buffer): MaiEditImageMimeType | undefined {
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return undefined;
}

/**
 * Load one `images` entry for an edit request: a `file://` path, resolved against
 * `basePath` when relative, or a base64 `data:` URL (which is what a test var
 * loaded from `file://image.png` becomes). Throws when the entry can't be read or
 * isn't a JPEG or PNG.
 */
export async function loadMaiEditImage(
  reference: unknown,
  basePath?: string,
): Promise<MaiEditImage> {
  if (typeof reference !== 'string' || !reference.trim()) {
    throw new Error('expected a file:// path or a base64 data URL');
  }
  const value = reference.trim();

  let bytes: Buffer<ArrayBuffer>;
  if (value.startsWith('file://')) {
    const filePath = path.resolve(basePath ?? '', value.slice('file://'.length));
    try {
      // Nonblocking open lets us reject a FIFO without waiting for a writer.
      const file = await fs.open(filePath, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
      try {
        const stat = await file.stat();
        if (!stat.isFile() || !stat.size) {
          throw new Error('expected a nonempty regular file');
        }
        checkEditImageSize(stat.size);
        bytes = await buffer(file.createReadStream({ end: stat.size - 1 }));
      } finally {
        await file.close();
      }
    } catch (err) {
      throw new Error(
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? `file not found: ${filePath}`
          : `could not read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else if (value.startsWith('data:')) {
    const comma = value.indexOf(',');
    if (comma === -1 || !value.slice(0, comma).toLowerCase().endsWith(';base64')) {
      throw new Error('data URLs must be base64-encoded');
    }
    const encoded = value.slice(comma + 1);
    checkEditImageSize(Buffer.byteLength(encoded, 'base64'));
    bytes = Buffer.from(encoded, 'base64');
  } else if (value.includes('�')) {
    // Binary image bytes decoded as UTF-8 text. This happens when a providers
    // file loaded with file:// has already read a file:// image value as text.
    throw new Error(
      'received image bytes as text; when providers are loaded from a file, pass images through test vars instead',
    );
  } else {
    throw new Error('expected a file:// path or a base64 data URL');
  }

  const mimeType = detectMaiEditImageType(bytes);
  if (!mimeType) {
    throw new Error('MAI image edits accept only JPEG or PNG images');
  }
  return { bytes, mimeType };
}

/** Form values are strings; serialize passthrough booleans, numbers and objects. */
function toFormValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Cache key for a multipart edit request, which `fetchWithCache` can't derive from
 * a FormData body. It covers the URL, every form field and each image's bytes
 * (by hash), plus custom headers. Authentication headers, and custom headers
 * that look like credentials, are left out so no secret reaches the cache.
 */
export function getMaiImageEditCacheKey(
  url: string,
  fields: [string, string][],
  images: MaiEditImage[],
  headers: Record<string, string> = {},
): string {
  const sortEntries = (entries: [string, string][]) =>
    [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const cacheHeaders = sortEntries(
    Object.entries(headers)
      .filter(([name, value]) => !isCredentialHeader(name, value))
      .map(([name, value]): [string, string] => [name.toLowerCase(), value]),
  );
  return `azure-mai-image-edit:${sha256(
    JSON.stringify({
      url,
      fields: sortEntries(fields),
      images: images.map(({ bytes, mimeType }) => [mimeType, sha256(bytes)]),
      headers: cacheHeaders,
    }),
  )}`;
}

/**
 * Validate MAI image dimensions against the constraint every MAI image model
 * shares: integer edges of at least 768px. The maximum pixel count depends on
 * the model (about 1MP for MAI-Image-2.5, 2,359,296 for 2.6, 4,194,304 for
 * 2.7), and the deployment name doesn't reliably identify the model, so the API
 * enforces that limit and its 400 names the model's maximum.
 */
export function validateMaiImageDimensions(
  width: number,
  height: number,
): { valid: boolean; message?: string } {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return { valid: false, message: 'Image width and height must be integers.' };
  }
  // A non-positive size is also caught here, since anything below 768 is invalid.
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return {
      valid: false,
      message: `Image width and height must each be at least ${MIN_DIMENSION} pixels (got ${width}x${height}).`,
    };
  }
  return { valid: true };
}

/**
 * Extract token counts from a MAI image response, tolerating both response
 * shapes the API has shipped: a legacy top-level `num_output_tokens`, and the
 * newer `usage` object (`num_output_tokens`, `num_input_text_tokens`,
 * `num_input_image_tokens`). Returns undefined when no output-token count is
 * present so callers can omit cost/usage rather than report zeros.
 */
export function extractMaiImageTokenUsage(
  data: any,
): { prompt: number; imagePrompt: number; completion: number; total: number } | undefined {
  const num = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

  const usage = data?.usage;
  const completion = num(usage?.num_output_tokens) ?? num(data?.num_output_tokens);
  if (completion === undefined) {
    return undefined;
  }

  const imagePrompt = num(usage?.num_input_image_tokens) ?? 0;
  const prompt = (num(usage?.num_input_text_tokens) ?? 0) + imagePrompt;
  return { prompt, imagePrompt, completion, total: prompt + completion };
}

/**
 * Compact, log-safe summary of a MAI image response: replaces base64 image
 * payloads with their length so error messages don't serialize ~750KB blobs.
 */
export function summarizeImageResponse(value: unknown): string {
  if (!value || typeof value !== 'object' || !Array.isArray((value as any).data)) {
    return JSON.stringify(value);
  }
  const record = value as Record<string, unknown>;
  const data = (record.data as unknown[]).map((item) => {
    const b64 = (item as any)?.b64_json;
    return typeof b64 === 'string'
      ? { ...(item as object), b64_json: `<${b64.length} base64 chars>` }
      : item;
  });
  return JSON.stringify({ ...record, data });
}

/**
 * Build the multipart request for an edit: each body field as a form field,
 * then each reference image as a repeated `image` file field. Image entries are
 * rendered with the test's vars first, so an entry like '{{image}}' picks up a
 * var loaded from file://image.png.
 */
async function buildMaiImageEditRequest(
  url: string,
  body: Record<string, unknown>,
  config: AzureImageOptions,
  authHeaders: Record<string, string>,
  context: CallApiContextParams | undefined,
): Promise<{ requestInit: RequestInit; cacheOptions: CacheOptions } | { error: string }> {
  let imageReferences: unknown[];
  try {
    imageReferences = [renderVarsInObject(config.images, context?.vars)].flat();
  } catch (err) {
    return {
      error: `Could not render images: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (imageReferences.length > MAX_EDIT_IMAGES) {
    return {
      error: `MAI image edits accept 1 to ${MAX_EDIT_IMAGES} reference images; got ${imageReferences.length}.`,
    };
  }

  const basePath = config.basePath ?? cliState.basePath;
  const images: MaiEditImage[] = [];
  for (const [index, reference] of imageReferences.entries()) {
    try {
      images.push(await loadMaiEditImage(reference, basePath));
    } catch (err) {
      return {
        error: `Invalid images[${index}]: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const fields = Object.entries(body)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]): [string, string] => [key, toFormValue(value)]);
  const form = new FormData();
  for (const [key, value] of fields) {
    form.append(key, value);
  }
  for (const [index, { bytes, mimeType }] of images.entries()) {
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    form.append('image', new Blob([bytes], { type: mimeType }), `image-${index + 1}.${extension}`);
  }

  // fetch sets the multipart Content-Type (with its boundary) from the body.
  const customHeaders = Object.fromEntries(
    Object.entries(config.headers ?? {}).filter(([name]) => name.toLowerCase() !== 'content-type'),
  );
  return {
    requestInit: { method: 'POST', headers: { ...authHeaders, ...customHeaders }, body: form },
    cacheOptions: {
      bust: shouldBustProviderCache(context),
      cacheKey: getMaiImageEditCacheKey(url, fields, images, customHeaders),
    },
  };
}

export class AzureImageProvider extends AzureGenericProvider {
  declare config: AzureImageOptions;

  constructor(deploymentName: string, options: AzureProviderOptions<AzureImageOptions> = {}) {
    super(deploymentName, options);
  }

  id(): string {
    return `azure:image:${this.deploymentName}`;
  }

  toString(): string {
    return `[Azure Image Provider ${this.deploymentName}]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');

    const baseUrl = this.getApiBaseUrl();
    if (!baseUrl) {
      throw new Error('Azure API host must be set.');
    }

    const config: AzureImageOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Reference images select the edits route. Rendering keeps the entry count.
    const isEdit = [config.images ?? []].flat().length > 0;

    // Generations always send a size. Edits send one only when it's configured,
    // so the API otherwise chooses the output size from the reference image.
    const hasSize = !isEdit || config.width !== undefined || config.height !== undefined;
    const width = config.width ?? DEFAULT_DIMENSION;
    const height = config.height ?? DEFAULT_DIMENSION;

    if (hasSize) {
      const dimValidation = validateMaiImageDimensions(width, height);
      if (!dimValidation.valid) {
        return { error: dimValidation.message };
      }
    }

    const body: Record<string, unknown> = {
      model: this.deploymentName,
      prompt,
      ...(hasSize ? { width, height } : {}),
      ...(config.passthrough || {}),
    };

    const url = `${baseUrl}${
      config.apiPath ||
      (isEdit ? DEFAULT_AZURE_MAI_IMAGE_EDIT_API_PATH : DEFAULT_AZURE_MAI_IMAGE_API_PATH)
    }`;

    let requestInit: RequestInit;
    let cacheOptions: boolean | CacheOptions | undefined;
    if (isEdit) {
      const editRequest = await buildMaiImageEditRequest(
        url,
        body,
        config,
        this.authHeaders,
        context,
      );
      if ('error' in editRequest) {
        return { error: editRequest.error };
      }
      ({ requestInit, cacheOptions } = editRequest);
    } else {
      requestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders,
          ...config.headers,
        },
        body: JSON.stringify(body),
      };
      cacheOptions = context?.bustCache ?? context?.debug;
    }

    let data: any;
    let cached = false;
    let latencyMs: number | undefined;
    // `fetchWithCache` returns the eviction handle alongside `data` (not on it),
    // so capture it here to evict malformed-but-2xx responses from the cache.
    let evictFromCache: (() => Promise<void>) | undefined;

    try {
      const {
        data: responseData,
        cached: isCached,
        status,
        statusText,
        latencyMs: fetchLatencyMs,
        deleteFromCache,
      } = await fetchWithCache(url, requestInit, getRequestTimeoutMs(), 'json', cacheOptions);

      cached = isCached;
      latencyMs = fetchLatencyMs;
      evictFromCache = deleteFromCache;

      // The response is usually parsed JSON, but a string can come back for
      // non-JSON error bodies. Parse defensively so a bad gateway etc. surfaces
      // its status instead of a misleading JSON parse error.
      if (typeof responseData === 'string') {
        try {
          data = JSON.parse(responseData);
        } catch {
          if (status < 200 || status >= 300) {
            return { error: `API error: ${status} ${statusText}\n${responseData}` };
          }
          return {
            error: `API returned invalid JSON response (status ${status}): ${responseData}`,
          };
        }
      } else {
        data = responseData;
      }

      // Non-2xx without a structured error body: surface raw status + payload.
      if ((status < 200 || status >= 300) && !data?.error) {
        return {
          error: `API error: ${status} ${statusText}\n${
            typeof responseData === 'string' ? responseData : JSON.stringify(responseData)
          }`,
        };
      }
    } catch (err) {
      return {
        error: `API call error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    try {
      if (data?.error) {
        // Don't persist an error response in the cache.
        await evictFromCache?.();
        const { code, message } = data.error;
        return {
          error: `API response error: ${code ? `${code} ` : ''}${message ?? JSON.stringify(data.error)}`,
        };
      }

      const item = data?.data?.[0];
      const b64 = item?.b64_json;
      if (!b64) {
        // A 2xx response without image data still gets cached by fetchWithCache;
        // evict it so a transient bad payload isn't served on every rerun.
        await evictFromCache?.();
        return { error: `No image data found in response: ${summarizeImageResponse(data)}` };
      }

      const dataUrl = `data:image/png;base64,${b64}`;
      const images: ImageOutput[] = [{ data: dataUrl, mimeType: 'image/png' }];

      // The MAI image API bills per token. Token accounting tolerates both the
      // legacy top-level `num_output_tokens` and the newer `usage` object.
      // Text and reference-image input tokens have separate rates.
      const usage = extractMaiImageTokenUsage(data);

      let cost: number | undefined;
      if (cached) {
        cost = 0;
      } else if (usage) {
        const costModelId = config.model || this.deploymentName;
        cost = calculateAzureCost(
          costModelId,
          config,
          usage.prompt,
          usage.completion,
          undefined,
          undefined,
          undefined,
          usage.imagePrompt,
        );
      }

      const tokenUsage = usage
        ? cached
          ? { cached: usage.total, total: usage.total }
          : {
              prompt: usage.prompt,
              completion: usage.completion,
              total: usage.total,
              numRequests: 1,
            }
        : undefined;

      logger.debug(`[Azure Image] ${isEdit ? 'Edited' : 'Generated'} image`, {
        deployment: this.deploymentName,
        size: data.size,
        usage,
        cached,
      });

      return {
        output: dataUrl,
        images,
        cached,
        isBase64: true,
        ...(latencyMs === undefined ? {} : { latencyMs }),
        ...(cost === undefined ? {} : { cost }),
        ...(tokenUsage ? { tokenUsage } : {}),
        metadata: {
          ...(item.revised_prompt ? { revisedPrompt: item.revised_prompt } : {}),
          ...(data.size ? { size: data.size } : {}),
          ...(data.model ? { model: data.model } : {}),
          ...(typeof data.inference_time_sec === 'number'
            ? { inferenceTimeSec: data.inference_time_sec }
            : {}),
        },
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${summarizeImageResponse(data)}`,
      };
    }
  }
}
