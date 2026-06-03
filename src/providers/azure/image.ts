/**
 * Azure AI Foundry Image Provider for Microsoft MAI image models.
 *
 * Generates images from text prompts using Microsoft's MAI image models
 * (e.g. MAI-Image-2.5, MAI-Image-2.5-Flash, MAI-Image-2e, MAI-Image-2)
 * deployed in Microsoft Foundry.
 *
 * Unlike Azure OpenAI image models (DALL·E / gpt-image), MAI image models are
 * served from a Microsoft-managed `/mai/v1/images/generations` route on the
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
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { getRequestTimeoutMs } from '../shared';
import { DEFAULT_AZURE_MAI_IMAGE_API_PATH } from './defaults';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ImageOutput,
  ProviderResponse,
} from '../../types/index';
import type { AzureImageOptions, AzureProviderOptions } from './types';

/** Minimum width/height accepted by the MAI image API, in pixels. */
const MIN_DIMENSION = 768;
/** Maximum total pixel count accepted by the MAI image API (1024x1024). */
const MAX_PIXELS = 1_048_576;
const DEFAULT_DIMENSION = 1024;

/**
 * Validate MAI image dimensions against the documented constraints: each edge
 * must be at least 768px and the total pixel count must not exceed 1,048,576.
 */
export function validateMaiImageDimensions(
  width: number,
  height: number,
): { valid: boolean; message?: string } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { valid: false, message: 'Image width and height must be positive integers.' };
  }
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return {
      valid: false,
      message: `Image width and height must each be at least ${MIN_DIMENSION} pixels (got ${width}x${height}).`,
    };
  }
  if (width * height > MAX_PIXELS) {
    return {
      valid: false,
      message: `Image width * height must not exceed ${MAX_PIXELS} pixels (got ${width}x${height} = ${width * height}).`,
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
): { prompt: number; completion: number; total: number } | undefined {
  const num = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

  const usage = data?.usage;
  const completion = num(usage?.num_output_tokens) ?? num(data?.num_output_tokens);
  if (completion === undefined) {
    return undefined;
  }

  const prompt =
    (num(usage?.num_input_text_tokens) ?? 0) + (num(usage?.num_input_image_tokens) ?? 0);
  return { prompt, completion, total: prompt + completion };
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

    const width = config.width ?? DEFAULT_DIMENSION;
    const height = config.height ?? DEFAULT_DIMENSION;

    const dimValidation = validateMaiImageDimensions(width, height);
    if (!dimValidation.valid) {
      return { error: dimValidation.message };
    }

    const body = {
      model: this.deploymentName,
      prompt,
      width,
      height,
      ...(config.passthrough || {}),
    };

    const url = `${baseUrl}${config.apiPath || DEFAULT_AZURE_MAI_IMAGE_API_PATH}`;

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
      } = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
            ...config.headers,
          },
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug,
      );

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
        return { error: `No image data found in response: ${JSON.stringify(data)}` };
      }

      const dataUrl = `data:image/png;base64,${b64}`;
      const images: ImageOutput[] = [{ data: dataUrl, mimeType: 'image/png' }];

      // The MAI image API bills per token. Token accounting tolerates both the
      // legacy top-level `num_output_tokens` and the newer `usage` object, and
      // prices input (text + image) tokens when the response reports them.
      const usage = extractMaiImageTokenUsage(data);

      let cost: number | undefined;
      if (cached) {
        cost = 0;
      } else if (usage) {
        const costModelId = config.model || this.deploymentName;
        cost = calculateAzureCost(costModelId, config, usage.prompt, usage.completion);
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

      logger.debug(`[Azure Image] Generated image`, {
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
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
