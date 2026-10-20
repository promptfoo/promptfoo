import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { toDataUri } from '../../util/dataUrl';
import { resolveProviderApiKey } from '../credentials';
import { resolveProviderEnv } from '../env';
import { getRequestTimeoutMs, shouldBustProviderCache, withResponseCacheMetadata } from '../shared';
import { GoogleAuthManager } from './auth';
import {
  collectGroundingMetadata,
  collectThoughtSignatures,
  createAuthCacheDiscriminator,
  determineGoogleVertexMode,
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getGoogleApiBaseUrl,
  getGoogleClient,
  getGoogleGuardrails,
  loadCredentials,
  loadGoogleTools,
  mergeGoogleCompletionOptions,
  mergeGoogleRequestTools,
  mergeParts,
  normalizeSafetySettings,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
  resolveProjectId,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ImageOutput,
  ProviderResponse,
} from '../../types/index';
import type { GoogleProviderConfig } from './types';

interface GeminiImageOptions {
  config?: GoogleProviderConfig;
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
  'gemini-nano-banana-2.1': { '1K': 0.0336, '2K': 0.0504, '4K': 0.1134 },
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
 * Vertex cache reads: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
 */
const GEMINI_IMAGE_TOKEN_RATES: Record<
  string,
  { input: number; textOutput: number; vertexCacheRead?: number }
> = {
  'gemini-nano-banana-2.1': {
    input: 1.5 / 1e6,
    textOutput: 7.5 / 1e6,
    vertexCacheRead: 0.15 / 1e6,
  },
  'gemini-2.5-flash-image': { input: 0.3 / 1e6, textOutput: 0 },
  'gemini-2.5-flash-preview-image-generation': { input: 0.3 / 1e6, textOutput: 0 },
  'gemini-3.1-flash-lite-image': {
    input: 0.25 / 1e6,
    textOutput: 1.5 / 1e6,
    vertexCacheRead: 0.025 / 1e6,
  },
  'gemini-3.1-flash-image': { input: 0.5 / 1e6, textOutput: 3 / 1e6, vertexCacheRead: 0.05 / 1e6 },
  'gemini-3.1-flash-image-preview': { input: 0.5 / 1e6, textOutput: 3 / 1e6 },
  'gemini-3-pro-image': { input: 2 / 1e6, textOutput: 12 / 1e6, vertexCacheRead: 0.2 / 1e6 },
  'gemini-3-pro-image-preview': { input: 2 / 1e6, textOutput: 12 / 1e6 },
};

/**
 * Image sizes accepted per model; models absent from this map accept every
 * size Google documents for the family. gemini-3.1-flash-lite-image renders
 * 1K only (2K/4K unsupported, and 512px is gemini-3.1-flash-image only).
 */
const MODEL_IMAGE_SIZES: Record<string, string[]> = {
  'gemini-nano-banana-2.1': ['1K', '2K', '4K'],
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
  config: GoogleProviderConfig;
  env?: EnvOverrides;
  private providerId: string;

  constructor(modelName: string, options: GeminiImageOptions = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
    this.providerId = options.id ?? `google:${modelName}`;
    GoogleAuthManager.validateAndWarn(
      {
        ...this.config,
        vertexai: determineGoogleVertexMode(this.config, this.env),
      },
      this.env,
    );
  }

  id(): string {
    return this.providerId;
  }

  toString(): string {
    return `[Google Gemini Image Generation Provider ${this.modelName}]`;
  }

  requiresApiKey(): boolean {
    return (
      this.config.apiKeyRequired !== false && !determineGoogleVertexMode(this.config, this.env)
    );
  }

  private getApiKey(): string | undefined {
    return resolveProviderApiKey({ apiKey: this.config.apiKey }, this.env, [
      'GOOGLE_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
      'GEMINI_API_KEY',
      'PALM_API_KEY',
    ]);
  }

  private getVertexApiKey(): string | undefined {
    return GoogleAuthManager.getApiKey(this.config, this.env, true).apiKey;
  }

  /**
   * Gemini 3.x image models use the global Vertex endpoint.
   * Older models (e.g. gemini-2.5) use regional endpoints.
   */
  private usesGlobalVertexEndpoint(): boolean {
    return this.modelName.startsWith('gemini-3') || this.modelName === 'gemini-nano-banana-2.1';
  }

  /**
   * imageSize is supported across Gemini 3.x image models.
   */
  private supportsImageSize(): boolean {
    return this.modelName.startsWith('gemini-3') || this.modelName === 'gemini-nano-banana-2.1';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!prompt) {
      return {
        error: 'Prompt is required for image generation',
      };
    }

    const promptConfig = context?.prompt?.config as Partial<GoogleProviderConfig> | undefined;
    const config = mergeGoogleCompletionOptions(this.config, promptConfig);
    // A prompt's nested image controls override provider-level shorthand defaults.
    if (
      promptConfig?.imageSize === undefined &&
      promptConfig?.generationConfig?.imageConfig?.imageSize !== undefined
    ) {
      delete config.imageSize;
    }
    if (
      promptConfig?.imageAspectRatio === undefined &&
      promptConfig?.generationConfig?.imageConfig?.aspectRatio !== undefined
    ) {
      delete config.imageAspectRatio;
    }
    const sizeError = this.validateImageSize(config);
    if (sizeError) {
      return { error: sizeError };
    }

    if (this.modelName === 'gemini-nano-banana-2.1') {
      const unsupported = ['temperature', 'topP', 'topK', 'seed', 'logprobs', 'responseLogprobs'];
      const overridesGenerationConfig = Object.prototype.hasOwnProperty.call(
        config.passthrough ?? {},
        'generationConfig',
      );
      const configured = unsupported.filter((key) =>
        overridesGenerationConfig
          ? (config.passthrough?.generationConfig as Record<string, unknown> | undefined)?.[key] !==
            undefined
          : (config as Record<string, unknown>)[key] !== undefined ||
            (config.generationConfig as Record<string, unknown> | undefined)?.[key] !== undefined,
      );
      if (configured.length > 0) {
        return { error: `${this.modelName} does not support ${configured.join(', ')}` };
      }
    }

    const aiStudioApiKey = this.getApiKey();

    // Explicit AI Studio mode must not be overridden by ambient Vertex project configuration.
    const isVertexMode = determineGoogleVertexMode(this.config, this.env);
    if (!isVertexMode && !aiStudioApiKey && this.config.apiKeyRequired !== false) {
      return {
        error:
          'Gemini image models require either:\n' +
          '1. Google AI Studio: Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or PALM_API_KEY environment variable\n' +
          '2. Vertex AI: Set GOOGLE_CLOUD_PROJECT environment variable or provide projectId in config, and run "gcloud auth application-default login"',
      };
    }

    const { toolsDisabled } = resolveGoogleToolConfig(config);
    config.tools = await loadGoogleTools(promptConfig?.tools ?? this.config.tools, context?.vars, {
      skipExecutableToolFiles: toolsDisabled,
      abortSignal: options?.abortSignal,
    });

    const projectId = isVertexMode
      ? this.config.projectId ||
        resolveProviderEnv(this.env, [
          'VERTEX_PROJECT_ID',
          'GOOGLE_PROJECT_ID',
          'GOOGLE_CLOUD_PROJECT',
        ])?.value
      : undefined;

    const vertexApiKey = isVertexMode ? this.getVertexApiKey() : undefined;
    const hasOAuthConfig = Boolean(
      this.config.credentials ||
        this.config.keyFilename ||
        this.config.googleAuthOptions?.keyFilename ||
        this.config.googleAuthOptions?.keyFile ||
        this.config.googleAuthOptions?.authClient ||
        this.config.googleAuthOptions?.credentials,
    );
    const providerScopedRegion =
      this.config.region ||
      this.env?.VERTEX_REGION ||
      this.env?.GOOGLE_CLOUD_LOCATION ||
      this.env?.GOOGLE_LOCATION;
    const hasProviderScopedOAuthConfig = Boolean(
      this.config.projectId ||
        this.config.googleAuthOptions?.projectId ||
        this.env?.VERTEX_PROJECT_ID ||
        this.env?.GOOGLE_PROJECT_ID ||
        this.env?.GOOGLE_CLOUD_PROJECT ||
        (providerScopedRegion && providerScopedRegion !== 'global'),
    );
    const explicitlyRequestedExpress =
      this.config.expressMode === true ||
      Boolean(this.config.apiKey) ||
      (Boolean(this.env?.VERTEX_API_KEY || this.env?.GOOGLE_API_KEY) &&
        !hasProviderScopedOAuthConfig);
    const effectiveRegion =
      this.config.region ||
      resolveProviderEnv(this.env, ['VERTEX_REGION', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_LOCATION'])
        ?.value;
    const hasProjectScopedOAuthConfig = Boolean(
      projectId ||
        this.config.googleAuthOptions?.projectId ||
        (effectiveRegion && effectiveRegion !== 'global'),
    );
    const usesVertexExpress =
      isVertexMode &&
      Boolean(vertexApiKey) &&
      this.config.expressMode !== false &&
      !hasOAuthConfig &&
      (explicitlyRequestedExpress || !hasProjectScopedOAuthConfig);

    if (usesVertexExpress && vertexApiKey) {
      const region = effectiveRegion || 'global';
      if (region !== 'global') {
        return {
          error: `Vertex Express image generation supports only the global endpoint, but region ${region} was configured. Set expressMode: false and use OAuth or Application Default Credentials for a regional endpoint.`,
        };
      }
      return this.callVertexExpressApi(prompt, context, vertexApiKey, config);
    }

    if (isVertexMode) {
      return this.callVertexApi(prompt, context, config);
    }

    return this.callAIStudioApi(prompt, context, config);
  }

  private async callAIStudioApi(
    prompt: string,
    context: CallApiContextParams | undefined,
    config: GoogleProviderConfig,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey && this.config.apiKeyRequired !== false) {
      return {
        error:
          'API key not found. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or PALM_API_KEY environment variable.',
      };
    }

    const baseUrl = getGoogleApiBaseUrl(this.config, this.env);
    const apiVersion = this.config.apiVersion || 'v1beta';
    // Use header-based auth instead of query param to avoid API key in logs.
    const endpoint = `${baseUrl}/${apiVersion}/models/${this.modelName}:generateContent`;

    const { contents, systemInstruction } = this.formatPrompt(prompt, context, config);
    const body = this.buildRequestBody(contents, systemInstruction, config);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-goog-api-key': apiKey } : {}),
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
        shouldBustProviderCache(context),
      )) as { data: any; cached: boolean };
      const latencyMs = Date.now() - startTime;

      return this.processResponse(data, config, cached, latencyMs);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }

  private async callVertexExpressApi(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiKey: string,
    config: GoogleProviderConfig,
  ): Promise<ProviderResponse> {
    const configuredHost =
      this.config.apiBaseUrl ||
      this.config.apiHost ||
      resolveProviderEnv(this.env, ['VERTEX_API_HOST'])?.value ||
      'aiplatform.googleapis.com';
    const apiHost = /^https?:\/\//i.test(configuredHost)
      ? configuredHost
      : `https://${configuredHost}`;
    const apiVersion =
      this.config.apiVersion || resolveProviderEnv(this.env, ['VERTEX_API_VERSION'])?.value || 'v1';
    const endpoint = `${apiHost.replace(/\/+$/, '')}/${apiVersion}/publishers/google/models/${this.modelName}:generateContent`;
    const { contents, systemInstruction } = this.formatPrompt(prompt, context, config);
    const body = this.buildRequestBody(contents, systemInstruction, config);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        ...(this.config.headers || {}),
      };
      const startTime = Date.now();
      const { data, cached } = (await fetchWithCache(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        } as RequestInit,
        getRequestTimeoutMs(),
        'json',
        true,
      )) as { data: any; cached: boolean };
      const latencyMs = Date.now() - startTime;

      return this.processResponse(data, config, cached, latencyMs);
    } catch (err) {
      return {
        error: `Vertex AI Express API call error: ${String(err)}`,
      };
    }
  }

  private async callVertexApi(
    prompt: string,
    context: CallApiContextParams | undefined,
    config: GoogleProviderConfig,
  ): Promise<ProviderResponse> {
    // Gemini 3 models require the global endpoint
    const usesGlobalVertexEndpoint = this.usesGlobalVertexEndpoint();
    const location = usesGlobalVertexEndpoint
      ? 'global'
      : this.config.region ||
        resolveProviderEnv(this.env, ['VERTEX_REGION', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_LOCATION'])
          ?.value ||
        'us-central1';

    try {
      const credentials = loadCredentials(this.config.credentials);
      const { client } = await getGoogleClient({
        credentials,
        googleAuthOptions: this.config.googleAuthOptions,
        scopes: this.config.scopes,
        keyFilename: this.config.keyFilename,
      });
      const projectId = await resolveProjectId(this.config, this.env);

      if (!projectId) {
        return {
          error:
            'Google project ID is required for Vertex AI. Set GOOGLE_PROJECT_ID or add projectId to provider config.',
        };
      }

      const apiVersion = 'v1';
      // Global endpoint uses a different URL format (no region prefix)
      const baseUrl =
        location === 'global'
          ? 'https://aiplatform.googleapis.com'
          : `https://${location}-aiplatform.googleapis.com`;
      const endpoint = `${baseUrl}/${apiVersion}/projects/${projectId}/locations/${location}/publishers/google/models/${this.modelName}:generateContent`;

      logger.debug(`Vertex AI Gemini Image API endpoint: ${endpoint}`);
      logger.debug(`Project ID: ${projectId}, Location: ${location}, Model: ${this.modelName}`);

      const { contents, systemInstruction } = this.formatPrompt(prompt, context, config);
      const body = this.buildRequestBody(contents, systemInstruction, config);

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

      return this.processResponse(response.data, config, false, latencyMs);
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

  private formatPrompt(
    prompt: string,
    context: CallApiContextParams | undefined,
    config: GoogleProviderConfig,
  ) {
    const promptConfig = context?.prompt?.config as Partial<GoogleProviderConfig> | undefined;
    return geminiFormatAndSystemInstructions(prompt, context?.vars, config.systemInstruction, {
      basePath:
        promptConfig?.systemInstruction === undefined
          ? this.config.basePath
          : (promptConfig?.basePath ?? this.config.basePath),
      useAssistantRole: config.useAssistantRole,
    });
  }

  private buildRequestBody(
    contents: any,
    systemInstruction: unknown,
    config: GoogleProviderConfig,
  ): Record<string, any> {
    const {
      tools: passthroughTools,
      systemInstruction: camelCaseInstruction,
      system_instruction: snakeCaseInstruction,
      toolConfig: _passthroughToolConfig,
      tool_config: _passthroughToolConfigSnakeCase,
      ...passthrough
    } = config.passthrough ?? {};
    const instruction =
      camelCaseInstruction === undefined
        ? snakeCaseInstruction === undefined
          ? systemInstruction
          : snakeCaseInstruction
        : camelCaseInstruction;
    const body: Record<string, any> = {
      contents,
      ...(instruction ? { systemInstruction: instruction } : {}),
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(config.temperature !== undefined && { temperature: config.temperature }),
        ...(config.topP !== undefined && { topP: config.topP }),
        ...(config.topK !== undefined && { topK: config.topK }),
        ...(config.maxOutputTokens !== undefined && {
          maxOutputTokens: config.maxOutputTokens,
        }),
        ...config.generationConfig,
      },
    };

    // Add image-specific configuration if provided. Top-level knobs override
    // matching fields in a pass-through generationConfig.imageConfig without
    // dropping its other fields. imageSize is supported on Gemini 3.x models.
    const supportsImageSize = this.supportsImageSize();
    const imageConfig: Record<string, any> = {
      ...(config.generationConfig?.imageConfig ?? {}),
      ...(config.imageAspectRatio && { aspectRatio: config.imageAspectRatio }),
      ...(config.imageSize && supportsImageSize && { imageSize: config.imageSize }),
    };
    if (Object.keys(imageConfig).length > 0) {
      body.generationConfig.imageConfig = imageConfig;
    }

    // Add safety settings if provided
    if (config.safetySettings) {
      body.safetySettings = normalizeSafetySettings(config.safetySettings);
    }

    const { toolConfig, toolsDisabled } = resolveGoogleToolConfig(config);

    // Add tool configuration if provided (e.g. Google Search grounding)
    if (toolConfig) {
      body.toolConfig = toolConfig;
    }

    const normalizedTools = Array.isArray(config.tools) ? config.tools : [];
    const requestTools = toolsDisabled
      ? removeGoogleFunctionDeclarations(normalizedTools)
      : normalizedTools;
    const requestPassthroughTools =
      toolsDisabled && passthroughTools !== undefined
        ? removeGoogleFunctionDeclarations(passthroughTools)
        : passthroughTools;
    const mergedTools = mergeGoogleRequestTools(requestTools, requestPassthroughTools);
    if (mergedTools) {
      body.tools = mergedTools;
    }

    return { ...body, ...passthrough };
  }

  private processResponse(
    data: any,
    config: GoogleProviderConfig,
    cached?: boolean,
    latencyMs?: number,
  ): ProviderResponse {
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
      [
        'SAFETY',
        'RECITATION',
        'PROHIBITED_CONTENT',
        'BLOCKLIST',
        'SPII',
        'IMAGE_SAFETY',
        'IMAGE_PROHIBITED_CONTENT',
        'IMAGE_RECITATION',
        'NO_IMAGE',
        'IMAGE_OTHER',
      ].includes(candidate.finishReason)
    ) {
      return {
        error: `Response was blocked with finish reason: ${candidate.finishReason}${candidate.finishMessage ? `: ${candidate.finishMessage}` : ''}`,
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
        totalCost += this.getCostPerImage(config);
      }
    }
    totalCost += this.getTokenCost(data.usageMetadata);

    if (imageParts.length === 0 && textParts.length === 0) {
      return {
        error: 'No valid content generated',
      };
    }

    // Calculate token usage
    const tokenUsage = {
      prompt:
        data.usageMetadata?.promptTokenCount === undefined
          ? undefined
          : data.usageMetadata.promptTokenCount + (data.usageMetadata.toolUsePromptTokenCount ?? 0),
      ...(data.usageMetadata?.cachedContentTokenCount !== undefined && {
        cached: data.usageMetadata.cachedContentTokenCount,
      }),
      completion: data.usageMetadata?.candidatesTokenCount,
      total: data.usageMetadata?.totalTokenCount,
      numRequests: 1,
      ...(data.usageMetadata?.thoughtsTokenCount !== undefined && {
        completionDetails: {
          reasoning: data.usageMetadata.thoughtsTokenCount,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      }),
    };
    const guardrails = getGoogleGuardrails(
      data.promptFeedback?.safetyRatings,
      candidate.safetyRatings,
    );
    const thoughtSignatures = collectThoughtSignatures([data]);
    const metadata = {
      ...collectGroundingMetadata([data]),
      ...(thoughtSignatures.length > 0 && { thoughtSignatures }),
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

    return withResponseCacheMetadata(
      {
        output,
        images,
        ...(this.modelName === 'gemini-nano-banana-2.1' && {
          conversationOutput: mergeParts(undefined, formatCandidateContents(candidate)),
        }),
        latencyMs,
        cost: totalCost === 0 ? undefined : totalCost,
        tokenUsage,
        raw: data,
        ...(guardrails && { guardrails }),
        metadata,
      },
      cached ?? false,
    );
  }

  /**
   * A raw passthrough generationConfig replaces the generated config. Otherwise,
   * top-level imageSize wins over generationConfig.imageConfig, matching the body.
   */
  private getEffectiveImageSize(config: GoogleProviderConfig): string | undefined {
    if (Object.prototype.hasOwnProperty.call(config.passthrough ?? {}, 'generationConfig')) {
      return (config.passthrough?.generationConfig as GoogleProviderConfig['generationConfig'])
        ?.imageConfig?.imageSize;
    }
    const topLevel = this.supportsImageSize() ? config.imageSize : undefined;
    return topLevel ?? config.generationConfig?.imageConfig?.imageSize;
  }

  /** Normalize Google's '512px' label to its 0.5K pricing tier. */
  private normalizeImageSize(size: string): string {
    const raw = size.toUpperCase();
    return raw === '512PX' ? '0.5K' : raw;
  }

  private validateImageSize(config: GoogleProviderConfig): string | undefined {
    const allowedSizes = MODEL_IMAGE_SIZES[this.modelName];
    const requested = this.getEffectiveImageSize(config);
    if (!allowedSizes || requested === undefined) {
      return undefined;
    }
    if (!allowedSizes.includes(this.normalizeImageSize(requested))) {
      return `Model ${this.modelName} only supports imageSize ${allowedSizes.join(', ')}; got '${requested}'`;
    }
    return undefined;
  }

  private getCostPerImage(config: GoogleProviderConfig): number {
    const pricing = GEMINI_IMAGE_PRICING[this.modelName];
    if (!pricing) {
      return DEFAULT_IMAGE_COST;
    }
    // Flat-rate models (no resolution tiers).
    if (pricing.default !== undefined) {
      return pricing.default;
    }
    // Resolution-tiered models: bill by the requested imageSize (default 1K).
    const resolution = this.normalizeImageSize(this.getEffectiveImageSize(config) ?? '1K');
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
    // Retrieved Google Search context is reported in usage, but is not billed as input.
    const promptTokens = usageMetadata.promptTokenCount ?? 0;
    const textTokens = Array.isArray(usageMetadata.candidatesTokensDetails)
      ? usageMetadata.candidatesTokensDetails
          .filter((detail: any) => detail?.modality === 'TEXT')
          .reduce((sum: number, detail: any) => sum + (detail.tokenCount ?? 0), 0)
      : 0;
    const thinkingTokens = usageMetadata.thoughtsTokenCount ?? 0;
    // Implicit context-cache pricing is published for Vertex image models.
    const cacheRate = determineGoogleVertexMode(this.config, this.env)
      ? rates.vertexCacheRead
      : undefined;
    const cachedTokens =
      cacheRate === undefined
        ? 0
        : Math.min(promptTokens, Math.max(0, usageMetadata.cachedContentTokenCount ?? 0));
    return (
      (promptTokens - cachedTokens) * rates.input +
      cachedTokens * (cacheRate ?? rates.input) +
      (textTokens + thinkingTokens) * rates.textOutput
    );
  }
}
