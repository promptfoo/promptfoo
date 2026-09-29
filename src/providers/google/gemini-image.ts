import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { toDataUri } from '../../util/dataUrl';
import { getRequestTimeoutMs } from '../shared';
import {
  createAuthCacheDiscriminator,
  geminiFormatAndSystemInstructions,
  getGoogleClient,
  loadCredentials,
  normalizeSafetySettings,
  normalizeTools,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
  resolveProjectId,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  ImageOutput,
  ProviderResponse,
} from '../../types/index';
import type { CompletionOptions } from './types';

interface GeminiImageOptions {
  config?: CompletionOptions;
  id?: string;
  env?: EnvOverrides;
}

/**
 * Per-image price (USD) by model id and output resolution, standard tier.
 * Source: https://ai.google.dev/gemini-api/docs/pricing
 *
 * Models billed at a single flat per-image rate use the `default` key. Models
 * with resolution-tiered pricing key on '0.5K' (Google's `512px`), '1K', '2K',
 * and '4K'; the resolution comes from the request's `imageSize` (default 1K).
 */
// A model and its `-preview` alias share the same resolution-tiered prices.
// The -preview aliases were shut down by Google on June 25, 2026; entries are
// retained so historical results and stragglers still price correctly.
const FLASH_IMAGE_PRICING = { '0.5K': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151 }; // Nano Banana 2
const PRO_IMAGE_PRICING = { '1K': 0.134, '2K': 0.134, '4K': 0.24 }; // Nano Banana Pro

const GEMINI_IMAGE_PRICING: Record<string, Record<string, number>> = {
  'gemini-2.5-flash-image': { default: 0.039 }, // Nano Banana
  'gemini-2.5-flash-preview-image-generation': { default: 0.039 }, // Deprecated alias
  'gemini-3.1-flash-lite-image': { default: 0.0336 }, // Nano Banana 2 Lite (1K only)
  'gemini-3.1-flash-image': FLASH_IMAGE_PRICING,
  'gemini-3.1-flash-image-preview': FLASH_IMAGE_PRICING,
  'gemini-3-pro-image': PRO_IMAGE_PRICING,
  'gemini-3-pro-image-preview': PRO_IMAGE_PRICING,
};
const DEFAULT_IMAGE_COST = 0.04;

/**
 * Token rates (USD per token) billed in addition to the per-image price.
 * The per-image prices above cover only image-output tokens; Google bills
 * prompt tokens and, on Gemini 3.x image models, text/thinking output tokens
 * separately. Source: https://ai.google.dev/gemini-api/docs/pricing
 * (gemini-2.5-flash-image lists no separate text-output rate.)
 */
const GEMINI_IMAGE_TOKEN_RATES: Record<string, { input: number; textOutput: number }> = {
  'gemini-2.5-flash-image': { input: 0.3 / 1e6, textOutput: 0 },
  'gemini-2.5-flash-preview-image-generation': { input: 0.3 / 1e6, textOutput: 0 },
  'gemini-3.1-flash-lite-image': { input: 0.25 / 1e6, textOutput: 1.5 / 1e6 },
  'gemini-3.1-flash-image': { input: 0.5 / 1e6, textOutput: 3 / 1e6 },
  'gemini-3.1-flash-image-preview': { input: 0.5 / 1e6, textOutput: 3 / 1e6 },
  'gemini-3-pro-image': { input: 2 / 1e6, textOutput: 12 / 1e6 },
  'gemini-3-pro-image-preview': { input: 2 / 1e6, textOutput: 12 / 1e6 },
};

/**
 * Image sizes accepted per model; models absent from this map accept every
 * size Google documents for the family. gemini-3.1-flash-lite-image renders
 * 1K only (2K/4K unsupported, and 512px is gemini-3.1-flash-image only).
 */
const MODEL_IMAGE_SIZES: Record<string, string[]> = {
  'gemini-3.1-flash-lite-image': ['1K'],
};

/**
 * Gemini native image generation provider.
 *
 * Uses the Gemini generateContent API with responseModalities set to include images.
 * This is different from Imagen models which use the :predict endpoint.
 *
 * Supported models:
 * - gemini-2.5-flash-image (Nano Banana)
 * - gemini-3.1-flash-lite-image (Nano Banana 2 Lite)
 * - gemini-3.1-flash-image (Nano Banana 2)
 * - gemini-3-pro-image (Nano Banana Pro)
 *
 * The -preview aliases of the 3.x models were shut down by Google on
 * June 25, 2026; they still route here so existing configs price correctly.
 */
export class GeminiImageProvider implements ApiProvider {
  modelName: string;
  config: CompletionOptions;
  env?: EnvOverrides;

  constructor(modelName: string, options: GeminiImageOptions = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
  }

  id(): string {
    return `google:${this.modelName}`;
  }

  toString(): string {
    return `[Google Gemini Image Generation Provider ${this.modelName}]`;
  }

  private getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      getEnvString('GOOGLE_API_KEY') ||
      getEnvString('GOOGLE_GENERATIVE_AI_API_KEY') ||
      getEnvString('GEMINI_API_KEY') ||
      this.env?.GOOGLE_API_KEY ||
      this.env?.GOOGLE_GENERATIVE_AI_API_KEY ||
      this.env?.GEMINI_API_KEY
    );
  }

  /**
   * Gemini 3.x image models use the global Vertex endpoint.
   * Older models (e.g. gemini-2.5) use regional endpoints.
   */
  private usesGlobalVertexEndpoint(): boolean {
    return this.modelName.startsWith('gemini-3');
  }

  /**
   * imageSize is supported across Gemini 3.x image models.
   */
  private supportsImageSize(): boolean {
    return this.modelName.startsWith('gemini-3');
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!prompt) {
      return {
        error: 'Prompt is required for image generation',
      };
    }

    const sizeError = this.validateImageSize();
    if (sizeError) {
      return { error: sizeError };
    }

    // Check if we should use Vertex AI (when projectId is provided)
    const projectId =
      this.config.projectId ||
      getEnvString('GOOGLE_CLOUD_PROJECT') ||
      getEnvString('GOOGLE_PROJECT_ID') ||
      this.env?.GOOGLE_CLOUD_PROJECT ||
      this.env?.GOOGLE_PROJECT_ID;

    if (projectId) {
      return this.callVertexApi(prompt, context);
    }

    // Otherwise, try Google AI Studio with API key
    const apiKey = this.getApiKey();
    if (apiKey) {
      return this.callAIStudioApi(prompt, context);
    }

    return {
      error:
        'Gemini image models require either:\n' +
        '1. Google AI Studio: Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GEMINI_API_KEY environment variable\n' +
        '2. Vertex AI: Set GOOGLE_CLOUD_PROJECT environment variable or provide projectId in config, and run "gcloud auth application-default login"',
    };
  }

  private async callAIStudioApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'API key not found. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GEMINI_API_KEY environment variable.',
      };
    }

    const apiHost = this.config.apiHost || 'generativelanguage.googleapis.com';
    // Gemini image generation models use v1beta in AI Studio.
    const apiVersion = 'v1beta';
    // Use header-based auth instead of query param to avoid API key in logs
    const endpoint = `https://${apiHost}/${apiVersion}/models/${this.modelName}:generateContent`;

    const { contents } = geminiFormatAndSystemInstructions(prompt, context?.vars);
    const body = this.buildRequestBody(contents);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        ...(this.config.headers || {}),
      };
      const authDiscriminator = createAuthCacheDiscriminator(headers);
      const startTime = Date.now();
      const { data, cached } = (await fetchWithCache(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          ...(authDiscriminator && { _authHash: authDiscriminator }),
        } as RequestInit,
        getRequestTimeoutMs(),
        'json',
        false,
      )) as { data: any; cached: boolean };
      const latencyMs = Date.now() - startTime;

      return this.processResponse(data, cached, latencyMs);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }

  private async callVertexApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    // Gemini 3 models require the global endpoint
    const usesGlobalVertexEndpoint = this.usesGlobalVertexEndpoint();
    const location = usesGlobalVertexEndpoint
      ? 'global'
      : this.config.region ||
        getEnvString('GOOGLE_LOCATION') ||
        this.env?.GOOGLE_LOCATION ||
        'us-central1';

    try {
      const credentials = loadCredentials(this.config.credentials);
      const { client } = await getGoogleClient({ credentials });
      const projectId = await resolveProjectId(this.config, this.env);

      if (!projectId) {
        return {
          error:
            'Google project ID is required for Vertex AI. Set GOOGLE_PROJECT_ID or add projectId to provider config.',
        };
      }

      const apiVersion = 'v1';
      // Global endpoint uses a different URL format (no region prefix)
      const baseUrl = usesGlobalVertexEndpoint
        ? 'https://aiplatform.googleapis.com'
        : `https://${location}-aiplatform.googleapis.com`;
      const endpoint = `${baseUrl}/${apiVersion}/projects/${projectId}/locations/${location}/publishers/google/models/${this.modelName}:generateContent`;

      logger.debug(`Vertex AI Gemini Image API endpoint: ${endpoint}`);
      logger.debug(`Project ID: ${projectId}, Location: ${location}, Model: ${this.modelName}`);

      const { contents } = geminiFormatAndSystemInstructions(prompt, context?.vars);
      const body = this.buildRequestBody(contents);

      const startTime = Date.now();
      const response = await client.request({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers || {}),
        },
        data: body,
        timeout: getRequestTimeoutMs(),
      });
      const latencyMs = Date.now() - startTime;

      return this.processResponse(response.data, false, latencyMs);
    } catch (err: any) {
      if (err.response?.data?.error) {
        return {
          error: `Vertex AI error: ${err.response.data.error.message || 'Unknown error'}`,
        };
      }
      return {
        error: `Failed to call Vertex AI: ${err.message || 'Unknown error'}`,
      };
    }
  }

  private buildRequestBody(contents: any): Record<string, any> {
    const body: Record<string, any> = {
      contents,
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
        ...(this.config.topP !== undefined && { topP: this.config.topP }),
        ...(this.config.topK !== undefined && { topK: this.config.topK }),
        ...(this.config.maxOutputTokens !== undefined && {
          maxOutputTokens: this.config.maxOutputTokens,
        }),
        ...this.config.generationConfig,
      },
    };

    // Add image-specific configuration if provided. Top-level knobs override
    // matching fields in a pass-through generationConfig.imageConfig without
    // dropping its other fields. imageSize is supported on Gemini 3.x models.
    const supportsImageSize = this.supportsImageSize();
    const imageConfig: Record<string, any> = {
      ...(this.config.generationConfig?.imageConfig ?? {}),
      ...(this.config.imageAspectRatio && { aspectRatio: this.config.imageAspectRatio }),
      ...(this.config.imageSize && supportsImageSize && { imageSize: this.config.imageSize }),
    };
    if (Object.keys(imageConfig).length > 0) {
      body.generationConfig.imageConfig = imageConfig;
    }

    // Add safety settings if provided
    if (this.config.safetySettings) {
      body.safetySettings = normalizeSafetySettings(this.config.safetySettings);
    }

    const { toolConfig, toolsDisabled } = resolveGoogleToolConfig(this.config);

    // Add tool configuration if provided (e.g. Google Search grounding)
    if (toolConfig) {
      body.toolConfig = toolConfig;
    }

    if (Array.isArray(this.config.tools) && this.config.tools.length > 0) {
      const normalizedTools = normalizeTools(this.config.tools);
      const requestTools = toolsDisabled
        ? removeGoogleFunctionDeclarations(normalizedTools)
        : normalizedTools;
      if (requestTools.length > 0) {
        body.tools = requestTools;
      }
    }

    return body;
  }

  private processResponse(data: any, cached?: boolean, latencyMs?: number): ProviderResponse {
    logger.debug(`Response data: ${JSON.stringify(data).substring(0, 500)}...`);

    if (!data || typeof data !== 'object') {
      return {
        error: 'Invalid response from API',
      };
    }

    if (data.error) {
      return {
        error: data.error.message || JSON.stringify(data.error),
      };
    }

    if (!data.candidates || data.candidates.length === 0) {
      // Check if the prompt was blocked
      let errorDetails = 'No candidates returned in API response.';

      if (data.promptFeedback?.blockReason) {
        errorDetails = `Response blocked: ${data.promptFeedback.blockReason}`;
      }

      return {
        error: errorDetails,
      };
    }

    const candidate = data.candidates[0];

    // Check if candidate was blocked
    if (
      candidate.finishReason &&
      ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(
        candidate.finishReason,
      )
    ) {
      return {
        error: `Response was blocked with finish reason: ${candidate.finishReason}`,
      };
    }

    if (!candidate.content?.parts) {
      return {
        error: 'No content parts in response',
      };
    }

    // Extract text and images from the response separately.
    // Images are returned in a structured `images` field so the UI can render
    // them natively without parsing markdown.
    const textParts: string[] = [];
    const imageParts: { mimeType: string; base64Data: string }[] = [];
    let totalCost = 0;

    for (const part of candidate.content.parts) {
      // Skip interim thinking output (returned when thoughts are requested):
      // thought images are billed as thinking tokens, not as final images.
      if (part.thought) {
        continue;
      }
      if (part.text) {
        textParts.push(part.text);
      } else if (part.inlineData) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        const base64Data = part.inlineData.data;
        imageParts.push({ mimeType, base64Data });
        totalCost += this.getCostPerImage();
      }
    }
    totalCost += this.getTokenCost(data.usageMetadata);

    if (imageParts.length === 0 && textParts.length === 0) {
      return {
        error: 'No valid content generated',
      };
    }

    // Calculate token usage
    const tokenUsage = cached
      ? {
          cached: data.usageMetadata?.totalTokenCount,
          total: data.usageMetadata?.totalTokenCount,
          numRequests: 1,
        }
      : {
          prompt: data.usageMetadata?.promptTokenCount,
          completion: data.usageMetadata?.candidatesTokenCount,
          total: data.usageMetadata?.totalTokenCount,
          numRequests: 1,
        };

    // Build structured images array (shared by image-only and text+image cases)
    const images: ImageOutput[] | undefined =
      imageParts.length > 0
        ? imageParts.map((img) => ({
            data: toDataUri(img.mimeType, img.base64Data),
            mimeType: img.mimeType,
          }))
        : undefined;

    // Image-only: use first image data URI as output for blob externalization
    // Text (with or without images): use joined text as output
    const output =
      imageParts.length > 0 && textParts.length === 0 ? images![0].data : textParts.join('\n\n');

    return {
      output,
      images,
      cached,
      latencyMs,
      // Cached responses were already paid for on the original request.
      cost: cached || totalCost === 0 ? undefined : totalCost,
      tokenUsage,
      raw: data,
    };
  }

  /**
   * The image size the request actually asks for: the top-level `imageSize`
   * option wins, otherwise a pass-through `generationConfig.imageConfig`
   * value applies. Mirrors the precedence used by buildRequestBody.
   */
  private getEffectiveImageSize(): string | undefined {
    const topLevel = this.supportsImageSize() ? this.config.imageSize : undefined;
    return topLevel ?? this.config.generationConfig?.imageConfig?.imageSize;
  }

  /** Normalize Google's '512px' label to its 0.5K pricing tier. */
  private normalizeImageSize(size: string): string {
    const raw = size.toUpperCase();
    return raw === '512PX' ? '0.5K' : raw;
  }

  private validateImageSize(): string | undefined {
    const allowedSizes = MODEL_IMAGE_SIZES[this.modelName];
    const requested = this.getEffectiveImageSize();
    if (!allowedSizes || requested === undefined) {
      return undefined;
    }
    if (!allowedSizes.includes(this.normalizeImageSize(requested))) {
      return `Model ${this.modelName} only supports imageSize ${allowedSizes.join(', ')}; got '${requested}'`;
    }
    return undefined;
  }

  private getCostPerImage(): number {
    const pricing = GEMINI_IMAGE_PRICING[this.modelName];
    if (!pricing) {
      return DEFAULT_IMAGE_COST;
    }
    // Flat-rate models (no resolution tiers).
    if (pricing.default !== undefined) {
      return pricing.default;
    }
    // Resolution-tiered models: bill by the requested imageSize (default 1K).
    const resolution = this.normalizeImageSize(this.getEffectiveImageSize() ?? '1K');
    return pricing[resolution] ?? pricing['1K'] ?? DEFAULT_IMAGE_COST;
  }

  /**
   * Token charges billed on top of the per-image price: prompt tokens, plus
   * text and thinking output tokens on models with a text-output rate. Image
   * output tokens are covered by the per-image price and excluded here via
   * the candidatesTokensDetails modality breakdown.
   */
  private getTokenCost(usageMetadata: any): number {
    const rates = GEMINI_IMAGE_TOKEN_RATES[this.modelName];
    if (!rates || !usageMetadata) {
      return 0;
    }
    const promptTokens = usageMetadata.promptTokenCount ?? 0;
    const textTokens = Array.isArray(usageMetadata.candidatesTokensDetails)
      ? usageMetadata.candidatesTokensDetails
          .filter((detail: any) => detail?.modality === 'TEXT')
          .reduce((sum: number, detail: any) => sum + (detail.tokenCount ?? 0), 0)
      : 0;
    const thinkingTokens = usageMetadata.thoughtsTokenCount ?? 0;
    return promptTokens * rates.input + (textTokens + thinkingTokens) * rates.textOutput;
  }
}
