import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { storeBlob } from '../../blobs';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { fetchWithTimeout } from '../../util/fetch/index';
import { ellipsize } from '../../util/text';
import { sleep } from '../../util/time';
import { sanitizeVideoSourceUri } from '../video/utils';
import {
  determineGoogleVertexMode,
  getGoogleApiKey,
  getGoogleClient,
  loadCredentials,
  resolveProjectId,
} from './util';

import type { BlobRef } from '../../blobs';
import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';
import type {
  CompletionOptions,
  GoogleVideoAspectRatio,
  GoogleVideoDuration,
  GoogleVideoOperation,
  GoogleVideoOptions,
  GoogleVideoResolution,
} from './types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Default location for Vertex AI
 */
const DEFAULT_LOCATION = 'us-central1';

/**
 * Valid durations by model family
 */
const VEO_3_DURATIONS: GoogleVideoDuration[] = [4, 6, 8];
const VEO_2_DURATIONS: GoogleVideoDuration[] = [5, 6, 8];

/**
 * Default configuration values
 */
const DEFAULT_ASPECT_RATIO: GoogleVideoAspectRatio = '16:9';
const DEFAULT_RESOLUTION: GoogleVideoResolution = '720p';
const DEFAULT_DURATION: GoogleVideoDuration = 8;
const DEFAULT_POLL_INTERVAL_MS = 10000; // 10 seconds
const DEFAULT_MAX_POLL_TIME_MS = 600000; // 10 minutes
const REQUEST_TIMEOUT_MS = 300000; // 5 minutes
const AI_STUDIO_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Veo 3.1 video-with-audio output prices in USD per generated second.
 * Source: https://ai.google.dev/gemini-api/docs/pricing#veo-3.1
 */
const VEO_3_1_VIDEO_WITH_AUDIO_PRICES: Record<
  'standard' | 'fast' | 'lite',
  Partial<Record<GoogleVideoResolution, number>>
> = {
  standard: { '720p': 0.4, '1080p': 0.4, '4k': 0.6 },
  fast: { '720p': 0.1, '1080p': 0.12, '4k': 0.3 },
  lite: { '720p': 0.05, '1080p': 0.08 },
};

function getVertexApiHost(location: string): string {
  return location === 'global'
    ? 'aiplatform.googleapis.com'
    : `${location}-aiplatform.googleapis.com`;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a cache key for video generation based on input parameters.
 * This is used for display purposes and deduplication hints.
 */
export function generateVideoCacheKey(
  prompt: string,
  model: string,
  aspectRatio: string,
  resolution: string,
  durationSeconds: number,
  imageData?: string,
  negativePrompt?: string,
): string {
  const hashInput = JSON.stringify({
    prompt,
    model,
    aspectRatio,
    resolution,
    durationSeconds,
    imageData: imageData || null,
    negativePrompt: negativePrompt || null,
  });

  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function validateAspectRatio(ratio: string): { valid: boolean; message?: string } {
  if (!['16:9', '9:16'].includes(ratio)) {
    return {
      valid: false,
      message: `Invalid aspect ratio "${ratio}". Valid ratios: 16:9, 9:16`,
    };
  }
  return { valid: true };
}

function addVertexSourceVideo(
  instance: Record<string, unknown>,
  sourceVideo?: string,
): string | undefined {
  if (!sourceVideo) {
    return undefined;
  }
  if (!sourceVideo.startsWith('gs://')) {
    return (
      'Vertex AI Veo video extension requires a Google Cloud Storage URI beginning with gs://; ' +
      'local paths, Gemini URIs, and operation IDs are not supported.'
    );
  }

  instance.video = { gcsUri: sourceVideo, mimeType: 'video/mp4' };
  return undefined;
}

function isReusableAiStudioVideoUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'generativelanguage.googleapis.com' &&
      parsed.pathname.startsWith('/v1beta/files/')
    );
  } catch {
    return false;
  }
}

function getReusableGeneratedVideoUri(uri: string, isVertexMode: boolean): string | undefined {
  const isReusable = isVertexMode ? uri.startsWith('gs://') : isReusableAiStudioVideoUri(uri);
  return isReusable ? sanitizeVideoSourceUri(uri) : undefined;
}

function addOptionalVideoParameter(
  parameters: Record<string, unknown>,
  name: string,
  value: unknown,
): void {
  if (value !== undefined && value !== '') {
    parameters[name] = value;
  }
}

export function validateDuration(
  model: string,
  duration: number,
  config: Pick<
    GoogleVideoOptions,
    'referenceImages' | 'extendVideoId' | 'sourceVideo' | 'resolution' | 'vertexai'
  > = {},
): { valid: boolean; message?: string } {
  const isVeo2 = model.includes('veo-2');
  const validDurations = isVeo2 ? VEO_2_DURATIONS : VEO_3_DURATIONS;

  if (!validDurations.includes(duration as GoogleVideoDuration)) {
    return {
      valid: false,
      message: `Invalid duration ${duration}s for ${model}. Valid: ${validDurations.join(', ')}s`,
    };
  }

  const usesVideoExtension = Boolean(config.extendVideoId || config.sourceVideo);
  const usesReferenceImages = Boolean(config.referenceImages?.length);
  const usesHighResolution = config.resolution === '1080p' || config.resolution === '4k';

  const supportsVertexLiteExtension =
    config.vertexai === true && model === 'veo-3.1-lite-generate-001';
  if (
    model.includes('veo-3.1-lite') &&
    (usesReferenceImages || (usesVideoExtension && !supportsVertexLiteExtension))
  ) {
    return {
      valid: false,
      message: 'Veo 3.1 Lite does not support video extension or reference images.',
    };
  }

  const requiresEightSeconds =
    usesVideoExtension || usesReferenceImages || (config.vertexai !== true && usesHighResolution);
  if (duration !== 8 && requiresEightSeconds) {
    return {
      valid: false,
      message:
        'This configuration requires durationSeconds: 8 when using video extension, ' +
        `reference images, or 1080p/4k resolution (received ${duration}).`,
    };
  }

  return { valid: true };
}

export function validateResolution(
  model: string,
  aspectRatio: string,
  resolution: string,
  config: Pick<GoogleVideoOptions, 'extendVideoId' | 'sourceVideo' | 'vertexai'> = {},
): { valid: boolean; message?: string } {
  if (!['720p', '1080p', '4k'].includes(resolution)) {
    return {
      valid: false,
      message: `Invalid resolution "${resolution}". Valid resolutions: 720p, 1080p, 4k`,
    };
  }

  if (
    config.vertexai !== true &&
    (config.extendVideoId || config.sourceVideo) &&
    resolution !== '720p'
  ) {
    return {
      valid: false,
      message: `Video extension requires 720p resolution (received ${resolution}).`,
    };
  }

  const isStableVeo31Fast = model === 'veo-3.1-fast-generate-001';
  if (
    resolution === '4k' &&
    (!model.includes('veo-3.1') || model.includes('lite') || isStableVeo31Fast)
  ) {
    return {
      valid: false,
      message: `${model} does not support 4k resolution. Use a Veo 3.1 model that supports 4k.`,
    };
  }

  // Veo 3 only supports 1080p for 16:9 aspect ratio
  if (model.includes('veo-3') && !model.includes('veo-3.1') && aspectRatio === '9:16') {
    if (resolution === '1080p' || resolution === '4k') {
      return {
        valid: false,
        message: `Veo 3 only supports ${resolution} for 16:9 aspect ratio. Use 720p for 9:16.`,
      };
    }
  }

  // Veo 2 only supports 720p
  if (model.includes('veo-2') && resolution !== '720p') {
    return {
      valid: false,
      message: `Veo 2 only supports 720p resolution.`,
    };
  }

  return { valid: true };
}

function calculateVeoCost(
  model: string,
  resolution: GoogleVideoResolution,
  durationSeconds: GoogleVideoDuration,
): number | undefined {
  if (!model.includes('veo-3.1')) {
    return undefined;
  }

  const modelTier = model.includes('lite') ? 'lite' : model.includes('fast') ? 'fast' : 'standard';
  const pricePerSecond = VEO_3_1_VIDEO_WITH_AUDIO_PRICES[modelTier][resolution];

  return pricePerSecond === undefined ? undefined : pricePerSecond * durationSeconds;
}

interface GoogleVideoProviderOptions {
  config?: GoogleVideoOptions;
  id?: string;
  env?: EnvOverrides;
}

interface GoogleVideoMediaBasePaths {
  image?: string;
  lastFrame?: string;
  referenceImages?: string;
}

function hasOwnVideoOption(
  config: GoogleVideoOptions | undefined,
  option: keyof GoogleVideoOptions,
): boolean {
  return config !== undefined && Object.prototype.hasOwnProperty.call(config, option);
}

function mergeGoogleVideoRequestConfig(
  providerConfig: GoogleVideoOptions,
  promptConfig: GoogleVideoOptions | undefined,
): { config: GoogleVideoOptions; mediaBasePaths: GoogleVideoMediaBasePaths } {
  const promptOwnsImage = hasOwnVideoOption(promptConfig, 'image');
  const promptOwnsLastFrame =
    hasOwnVideoOption(promptConfig, 'lastFrame') || hasOwnVideoOption(promptConfig, 'lastImage');
  const promptOwnsReferenceImages = hasOwnVideoOption(promptConfig, 'referenceImages');
  const promptOwnsSourceVideo =
    hasOwnVideoOption(promptConfig, 'sourceVideo') ||
    hasOwnVideoOption(promptConfig, 'extendVideoId');
  const lastFrameOwner = promptOwnsLastFrame ? promptConfig : providerConfig;
  const sourceVideoOwner = promptOwnsSourceVideo ? promptConfig : providerConfig;
  const promptMediaBasePath = promptConfig?.basePath ?? providerConfig.basePath;

  return {
    config: {
      ...providerConfig,
      ...promptConfig,
      // Prompt configuration may shape the generated video, but it must not redirect an
      // authenticated request, replace provider credentials, or switch authentication modes.
      apiKey: providerConfig.apiKey,
      vertexai: providerConfig.vertexai,
      projectId: providerConfig.projectId,
      region: providerConfig.region,
      credentials: providerConfig.credentials,
      storageUri: providerConfig.storageUri,
      lastFrame: lastFrameOwner?.lastFrame,
      lastImage: lastFrameOwner?.lastImage,
      sourceVideo: sourceVideoOwner?.sourceVideo,
      extendVideoId: sourceVideoOwner?.extendVideoId,
    },
    mediaBasePaths: {
      image: promptOwnsImage ? promptMediaBasePath : providerConfig.basePath,
      lastFrame: promptOwnsLastFrame ? promptMediaBasePath : providerConfig.basePath,
      referenceImages: promptOwnsReferenceImages ? promptMediaBasePath : providerConfig.basePath,
    },
  };
}

// =============================================================================
// GoogleVideoProvider
// =============================================================================

export class GoogleVideoProvider implements ApiProvider {
  modelName: string;
  config: GoogleVideoOptions;
  private providerId?: string;
  env?: EnvOverrides;

  constructor(modelName: string, options: GoogleVideoProviderOptions = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.providerId = options.id;
    this.env = options.env;
  }

  id(): string {
    return this.providerId || `google:video:${this.modelName}`;
  }

  toString(): string {
    return `[Google Video Provider ${this.modelName}]`;
  }

  private getLocation(config: GoogleVideoOptions = this.config): string {
    return (
      config.region ||
      this.env?.VERTEX_REGION ||
      this.env?.GOOGLE_CLOUD_LOCATION ||
      this.env?.GOOGLE_LOCATION ||
      getEnvString('VERTEX_REGION') ||
      getEnvString('GOOGLE_CLOUD_LOCATION') ||
      getEnvString('GOOGLE_LOCATION') ||
      DEFAULT_LOCATION
    );
  }

  private async getProjectId(config: GoogleVideoOptions = this.config): Promise<string> {
    return await resolveProjectId(config, this.env);
  }

  private isVertexMode(config: GoogleVideoOptions = this.config): boolean {
    return determineGoogleVertexMode(
      config as CompletionOptions & { vertexai?: boolean },
      this.env,
    );
  }

  private getApiKey(config: GoogleVideoOptions = this.config): string | undefined {
    const { apiKey } = getGoogleApiKey(
      config as CompletionOptions,
      this.env,
      this.isVertexMode(config),
    );
    return apiKey;
  }

  private async getClientWithCredentials() {
    const credentials = loadCredentials(this.config.credentials);
    const { client } = await getGoogleClient({ credentials });
    return client;
  }

  private async getVertexEndpoint(
    action: string = 'predictLongRunning',
    model: string = this.modelName,
    config: GoogleVideoOptions = this.config,
  ): Promise<string> {
    const location = this.getLocation(config);
    const projectId = await this.getProjectId(config);
    const host = getVertexApiHost(location);
    return `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:${action}`;
  }

  private getAiStudioEndpoint(pathSuffix: string): string {
    return `${AI_STUDIO_BASE_URL}/${pathSuffix}`;
  }

  private async getAiStudioHeaders(config: GoogleVideoOptions): Promise<Record<string, string>> {
    const apiKey = this.getApiKey(config);
    if (!apiKey) {
      throw new Error(
        'Google API key is not set. Set GOOGLE_API_KEY or GEMINI_API_KEY, or add `apiKey` to the provider config.',
      );
    }

    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
  }

  /**
   * Load image data from file:// path or return as-is if base64
   */
  private loadImageData(
    imagePath: string,
    config: Pick<GoogleVideoOptions, 'basePath'> = this.config,
  ): { data?: string; error?: string } {
    if (imagePath.startsWith('file://')) {
      const filePath = path.resolve(
        config.basePath || process.cwd(),
        imagePath.slice('file://'.length),
      );
      if (!fs.existsSync(filePath)) {
        return { error: `Image file not found: ${filePath}` };
      }
      return { data: fs.readFileSync(filePath).toString('base64') };
    }
    return { data: imagePath };
  }

  /**
   * Create a new video generation job
   */
  private async createVideoJob(
    prompt: string,
    config: GoogleVideoOptions,
    mediaBasePaths: GoogleVideoMediaBasePaths,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    if (this.isVertexMode(config)) {
      return this.createVertexVideoJob(prompt, config, mediaBasePaths);
    }

    return this.createAiStudioVideoJob(prompt, config, mediaBasePaths);
  }

  private buildVertexRequestBody(
    prompt: string,
    config: GoogleVideoOptions,
    mediaBasePaths: GoogleVideoMediaBasePaths = {
      image: config.basePath,
      lastFrame: config.basePath,
      referenceImages: config.basePath,
    },
  ): { body?: Record<string, unknown>; error?: string } {
    const instance: Record<string, unknown> = { prompt };
    // Vertex Veo separates media/prompt inputs from generation parameters:
    // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/Shared.Types/VideoGenerationModelParams
    const parameters: Record<string, unknown> = {};

    if (config.aspectRatio) {
      parameters.aspectRatio = config.aspectRatio;
    }
    if (config.resolution) {
      parameters.resolution = config.resolution;
    }
    if (config.durationSeconds) {
      parameters.durationSeconds = config.durationSeconds;
    }
    if (config.negativePrompt) {
      parameters.negativePrompt = config.negativePrompt;
    }
    if (config.personGeneration) {
      parameters.personGeneration = config.personGeneration;
    }
    if (config.seed !== undefined) {
      parameters.seed = config.seed;
    }
    addOptionalVideoParameter(parameters, 'storageUri', config.storageUri);

    if (config.image) {
      const { data: imageData, error } = this.loadImageData(config.image, {
        basePath: mediaBasePaths.image,
      });
      if (error) {
        return { error };
      }
      instance.image = {
        imageBytes: imageData,
        mimeType: 'image/png',
      };
    }

    const lastFrame = config.lastFrame || config.lastImage;
    if (lastFrame) {
      const { data: lastFrameData, error } = this.loadImageData(lastFrame, {
        basePath: mediaBasePaths.lastFrame,
      });
      if (error) {
        return { error };
      }
      instance.lastFrame = {
        imageBytes: lastFrameData,
        mimeType: 'image/png',
      };
    }

    if (config.referenceImages && config.referenceImages.length > 0) {
      const refs = [];
      for (const ref of config.referenceImages.slice(0, 3)) {
        const imagePath = typeof ref === 'string' ? ref : ref.image;
        const referenceType = typeof ref === 'string' ? 'asset' : ref.referenceType || 'asset';

        const { data: imageData, error } = this.loadImageData(imagePath, {
          basePath: mediaBasePaths.referenceImages,
        });
        if (error) {
          return { error };
        }
        refs.push({
          image: { imageBytes: imageData, mimeType: 'image/png' },
          referenceType,
        });
      }
      instance.referenceImages = refs;
    }

    const sourceVideoError = addVertexSourceVideo(
      instance,
      config.sourceVideo || config.extendVideoId,
    );
    if (sourceVideoError) {
      return { error: sourceVideoError };
    }

    const body: Record<string, unknown> = { instances: [instance] };
    if (Object.keys(parameters).length > 0) {
      body.parameters = parameters;
    }

    return { body };
  }

  private buildAiStudioRequestBody(
    prompt: string,
    config: GoogleVideoOptions,
    mediaBasePaths: GoogleVideoMediaBasePaths = {
      image: config.basePath,
      lastFrame: config.basePath,
      referenceImages: config.basePath,
    },
  ): { body?: Record<string, unknown>; error?: string } {
    const instance: Record<string, unknown> = { prompt };
    const parameters: Record<string, unknown> = {};

    if (config.aspectRatio) {
      parameters.aspectRatio = config.aspectRatio;
    }
    if (config.resolution) {
      parameters.resolution = config.resolution;
    }
    if (config.durationSeconds) {
      parameters.durationSeconds = config.durationSeconds;
    }
    if (config.negativePrompt) {
      parameters.negativePrompt = config.negativePrompt;
    }
    if (config.personGeneration) {
      parameters.personGeneration = config.personGeneration;
    }
    if (config.seed !== undefined) {
      parameters.seed = config.seed;
    }

    if (config.image) {
      const { data: imageData, error } = this.loadImageData(config.image, {
        basePath: mediaBasePaths.image,
      });
      if (error) {
        return { error };
      }
      instance.image = {
        inlineData: {
          mimeType: 'image/png',
          data: imageData,
        },
      };
    }

    const lastFrame = config.lastFrame || config.lastImage;
    if (lastFrame) {
      const { data: lastFrameData, error } = this.loadImageData(lastFrame, {
        basePath: mediaBasePaths.lastFrame,
      });
      if (error) {
        return { error };
      }
      instance.lastFrame = {
        inlineData: {
          mimeType: 'image/png',
          data: lastFrameData,
        },
      };
    }

    if (config.referenceImages && config.referenceImages.length > 0) {
      const refs = [];
      for (const ref of config.referenceImages.slice(0, 3)) {
        const imagePath = typeof ref === 'string' ? ref : ref.image;
        const referenceType = typeof ref === 'string' ? 'asset' : ref.referenceType || 'asset';
        const { data: imageData, error } = this.loadImageData(imagePath, {
          basePath: mediaBasePaths.referenceImages,
        });
        if (error) {
          return { error };
        }
        refs.push({
          image: {
            inlineData: {
              mimeType: 'image/png',
              data: imageData,
            },
          },
          referenceType,
        });
      }
      instance.referenceImages = refs;
    }

    const sourceVideo = config.sourceVideo || config.extendVideoId;
    if (sourceVideo) {
      if (sourceVideo.includes('/operations/')) {
        return {
          error:
            'Google AI Studio Veo does not accept operation IDs for video extension. Provide the URI returned by a previous Veo generation via `sourceVideo`.',
        };
      }
      if (!isReusableAiStudioVideoUri(sourceVideo)) {
        return {
          error:
            'Google AI Studio Veo video extension requires the URI returned by a previous Veo generation; downloaded files and base64 video bytes are not supported.',
        };
      }
      instance.video = {
        uri: sourceVideo,
      };
    }

    const body: Record<string, unknown> = {
      instances: [instance],
    };
    if (Object.keys(parameters).length > 0) {
      body.parameters = parameters;
    }

    return { body };
  }

  private async createVertexVideoJob(
    prompt: string,
    config: GoogleVideoOptions,
    mediaBasePaths?: GoogleVideoMediaBasePaths,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    const model = config.model || this.modelName;
    const url = await this.getVertexEndpoint('predictLongRunning', model, config);
    const { body, error: bodyError } = this.buildVertexRequestBody(prompt, config, mediaBasePaths);
    if (bodyError || !body) {
      return { error: bodyError || 'Failed to build Vertex Veo request' };
    }

    try {
      const client = await this.getClientWithCredentials();
      logger.debug('[Google Video] Creating video job', { url, model });

      const response = await client.request({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      return { operation: response.data as GoogleVideoOperation };
    } catch (err) {
      const error = err as {
        message?: string;
        response?: { data?: { error?: { message?: string } } };
      };
      const errorMessage = error.response?.data?.error?.message || error.message || String(err);
      return {
        error: `Failed to create video job: ${errorMessage}`,
      };
    }
  }

  private async createAiStudioVideoJob(
    prompt: string,
    config: GoogleVideoOptions,
    mediaBasePaths?: GoogleVideoMediaBasePaths,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    const { body, error: bodyError } = this.buildAiStudioRequestBody(
      prompt,
      config,
      mediaBasePaths,
    );
    if (bodyError || !body) {
      return { error: bodyError || 'Failed to build Google AI Studio Veo request' };
    }

    try {
      const headers = await this.getAiStudioHeaders(config);
      const model = config.model || this.modelName;
      const url = this.getAiStudioEndpoint(`models/${model}:predictLongRunning`);

      logger.debug('[Google Video] Creating video job', {
        url,
        model,
        transport: 'google-ai-studio',
      });

      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );

      const data = (await response.json()) as GoogleVideoOperation & {
        error?: { message?: string };
      };

      if (!response.ok) {
        return {
          error: `Failed to create video job: ${data.error?.message || response.statusText}`,
        };
      }

      return { operation: data };
    } catch (err) {
      const error = err as { message?: string };
      return {
        error: `Failed to create video job: ${error.message || String(err)}`,
      };
    }
  }

  /**
   * Poll for video job completion using fetchPredictOperation endpoint
   */
  private async pollOperationStatus(
    operationName: string,
    pollIntervalMs: number,
    maxPollTimeMs: number,
    config: GoogleVideoOptions,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    if (this.isVertexMode(config)) {
      return this.pollVertexOperationStatus(operationName, pollIntervalMs, maxPollTimeMs, config);
    }

    return this.pollAiStudioOperationStatus(operationName, pollIntervalMs, maxPollTimeMs, config);
  }

  private async pollVertexOperationStatus(
    operationName: string,
    pollIntervalMs: number,
    maxPollTimeMs: number,
    config: GoogleVideoOptions,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    const startTime = Date.now();
    const location = this.getLocation(config);
    const projectId = await this.getProjectId(config);

    // Veo uses fetchPredictOperation endpoint for polling (POST request)
    // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation
    const model = config.model || this.modelName;
    const host = getVertexApiHost(location);
    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:fetchPredictOperation`;

    logger.debug(`[Google Video] Polling operation via fetchPredictOperation: ${url}`);

    const client = await this.getClientWithCredentials();

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const response = await client.request({
          url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operationName,
          }),
        });

        const operation = response.data as GoogleVideoOperation;

        logger.debug(
          `[Google Video] Operation status: done=${operation.done}, progress=${operation.metadata?.progress}%`,
        );

        if (operation.done) {
          if (operation.error) {
            return {
              error: `Video generation failed: ${operation.error.message}`,
            };
          }
          return { operation };
        }

        await sleep(pollIntervalMs);
      } catch (err) {
        const error = err as {
          message?: string;
          response?: { data?: { error?: { message?: string } } };
        };
        const errorMessage = error.response?.data?.error?.message || error.message || String(err);
        return {
          error: `Polling error: ${errorMessage}`,
        };
      }
    }

    return {
      error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds`,
    };
  }

  private async pollAiStudioOperationStatus(
    operationName: string,
    pollIntervalMs: number,
    maxPollTimeMs: number,
    config: GoogleVideoOptions,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    const startTime = Date.now();
    const url = this.getAiStudioEndpoint(operationName);
    const headers = await this.getAiStudioHeaders(config);

    logger.debug(`[Google Video] Polling operation via Google AI Studio: ${url}`);

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const response = await fetchWithTimeout(
          url,
          {
            method: 'GET',
            headers,
          },
          REQUEST_TIMEOUT_MS,
        );

        const operation = (await response.json()) as GoogleVideoOperation & {
          error?: { message?: string };
        };

        if (!response.ok) {
          return {
            error: `Polling error: ${operation.error?.message || response.statusText}`,
          };
        }

        logger.debug(
          `[Google Video] Operation status: done=${operation.done}, progress=${operation.metadata?.progress}%`,
        );

        if (operation.done) {
          if (operation.error) {
            return {
              error: `Video generation failed: ${operation.error.message}`,
            };
          }
          return { operation };
        }

        await sleep(pollIntervalMs);
      } catch (err) {
        const error = err as { message?: string };
        return {
          error: `Polling error: ${error.message || String(err)}`,
        };
      }
    }

    return {
      error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds`,
    };
  }

  /**
   * Download video from URI and store to blob storage
   */
  private async downloadVideoToBlob(
    videoUri: string,
    config: GoogleVideoOptions,
    context?: CallApiContextParams,
  ): Promise<{ blobRef?: BlobRef; error?: string }> {
    if (this.isVertexMode(config)) {
      return this.downloadVertexVideoToBlob(videoUri, context);
    }

    return this.downloadAiStudioVideoToBlob(videoUri, config, context);
  }

  private async downloadVertexVideoToBlob(
    videoUri: string,
    context?: CallApiContextParams,
  ): Promise<{ blobRef?: BlobRef; error?: string }> {
    try {
      const client = await this.getClientWithCredentials();
      let downloadUrl = videoUri;
      if (videoUri.startsWith('gs://')) {
        const parsedUri = new URL(videoUri);
        const bucket = encodeURIComponent(parsedUri.hostname);
        const object = encodeURIComponent(decodeURIComponent(parsedUri.pathname.slice(1)));
        downloadUrl =
          `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${object}` +
          '?alt=media';
      }

      // Use authenticated request to download video
      const response = await client.request({
        url: downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
      });

      const buffer = Buffer.from(response.data as ArrayBuffer);

      // Store to blob storage
      const { ref } = await storeBlob(buffer, 'video/mp4', {
        evalId: context?.evaluationId,
        kind: 'video',
        location: 'response.video',
        promptIdx: context?.promptIdx,
        testIdx: context?.testIdx,
      });

      logger.debug(`[Google Video] Stored video to blob storage: ${ref.uri}`);
      return { blobRef: ref };
    } catch (err) {
      const error = err as { message?: string };
      return {
        error: `Download error: ${error.message || String(err)}`,
      };
    }
  }

  private async downloadAiStudioVideoToBlob(
    videoUri: string,
    config: GoogleVideoOptions,
    context?: CallApiContextParams,
  ): Promise<{ blobRef?: BlobRef; error?: string }> {
    try {
      const headers = await this.getAiStudioHeaders(config);
      const response = await fetchWithTimeout(
        videoUri,
        {
          method: 'GET',
          headers,
        },
        REQUEST_TIMEOUT_MS,
      );

      if (!response.ok) {
        return {
          error: `Download error: ${response.statusText}`,
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const { ref } = await storeBlob(buffer, 'video/mp4', {
        evalId: context?.evaluationId,
        kind: 'video',
        location: 'response.video',
        promptIdx: context?.promptIdx,
        testIdx: context?.testIdx,
      });

      logger.debug(`[Google Video] Stored video to blob storage: ${ref.uri}`);
      return { blobRef: ref };
    } catch (err) {
      const error = err as { message?: string };
      return {
        error: `Download error: ${error.message || String(err)}`,
      };
    }
  }

  /**
   * Store base64 encoded video to blob storage
   */
  private async storeBase64VideoToBlob(
    base64Data: string,
    context?: CallApiContextParams,
  ): Promise<{ blobRef?: BlobRef; error?: string }> {
    try {
      const buffer = Buffer.from(base64Data, 'base64');

      // Store to blob storage
      const { ref, deduplicated } = await storeBlob(buffer, 'video/mp4', {
        evalId: context?.evaluationId,
        kind: 'video',
        location: 'response.video',
        promptIdx: context?.promptIdx,
        testIdx: context?.testIdx,
      });

      logger.debug(
        `[Google Video] Stored video to blob storage: ${ref.uri} (deduplicated: ${deduplicated})`,
      );
      return { blobRef: ref };
    } catch (err) {
      const error = err as { message?: string };
      return {
        error: `Save error: ${error.message || String(err)}`,
      };
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Validate prompt first
    if (!prompt || prompt.trim() === '') {
      return {
        error: 'Prompt is required for video generation',
      };
    }

    const { config, mediaBasePaths } = mergeGoogleVideoRequestConfig(
      this.config,
      context?.prompt?.config as GoogleVideoOptions | undefined,
    );
    let effectiveConfig = config;
    const isVertexMode = this.isVertexMode(effectiveConfig);

    if (isVertexMode) {
      let projectId: string | undefined;
      try {
        projectId = await resolveProjectId(effectiveConfig, this.env);
      } catch {
        return {
          error:
            'Google Veo video generation via Vertex AI requires a project ID. Set GOOGLE_CLOUD_PROJECT or add `projectId` to the provider config, then run "gcloud auth application-default login".',
        };
      }
      if (!projectId) {
        return {
          error:
            'Google Veo video generation via Vertex AI requires a project ID. Set GOOGLE_CLOUD_PROJECT or add `projectId` to the provider config, then run "gcloud auth application-default login".',
        };
      }
      effectiveConfig = {
        ...effectiveConfig,
        vertexai: true,
        projectId,
      };
    } else if (!this.getApiKey(effectiveConfig)) {
      const missingApiKeyError =
        'Google Veo video generation via Google AI Studio requires an API key. Set GOOGLE_API_KEY or GEMINI_API_KEY, or add `apiKey` to the provider config.';

      if (effectiveConfig.vertexai === false) {
        return { error: missingApiKeyError };
      }

      try {
        const adcProjectId = await resolveProjectId(effectiveConfig, this.env);
        if (adcProjectId) {
          effectiveConfig = {
            ...effectiveConfig,
            vertexai: true,
            projectId: adcProjectId,
          };
        } else {
          return { error: missingApiKeyError };
        }
      } catch {
        return { error: missingApiKeyError };
      }
    }

    const model = effectiveConfig.model || this.modelName;
    const aspectRatio = effectiveConfig.aspectRatio || DEFAULT_ASPECT_RATIO;
    const resolution = effectiveConfig.resolution || DEFAULT_RESOLUTION;
    // Support both 'durationSeconds' and 'duration' (alias)
    const durationSeconds =
      effectiveConfig.durationSeconds || effectiveConfig.duration || DEFAULT_DURATION;

    // Validate aspect ratio
    const ratioValidation = validateAspectRatio(aspectRatio);
    if (!ratioValidation.valid) {
      return { error: ratioValidation.message };
    }

    // Validate duration
    const durationValidation = validateDuration(model, durationSeconds, effectiveConfig);
    if (!durationValidation.valid) {
      return { error: durationValidation.message };
    }

    // Validate resolution
    const resolutionValidation = validateResolution(
      model,
      aspectRatio,
      resolution,
      effectiveConfig,
    );
    if (!resolutionValidation.valid) {
      return { error: resolutionValidation.message };
    }

    const startTime = Date.now();

    // Step 1: Create video job
    logger.info(`[Google Video] Creating video job for model ${model}...`);
    const { operation: createdOp, error: createError } = await this.createVideoJob(
      prompt,
      {
        ...effectiveConfig,
        aspectRatio,
        resolution,
        durationSeconds,
      },
      mediaBasePaths,
    );

    if (createError || !createdOp) {
      return { error: createError || 'Failed to create video job' };
    }

    const operationName = createdOp.name;
    logger.info(`[Google Video] Video job created: ${operationName}`);

    // Step 2: Poll for completion
    const pollIntervalMs = effectiveConfig.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const maxPollTimeMs = effectiveConfig.maxPollTimeMs || DEFAULT_MAX_POLL_TIME_MS;

    const { operation: completedOp, error: pollError } = await this.pollOperationStatus(
      operationName,
      pollIntervalMs,
      maxPollTimeMs,
      effectiveConfig,
    );

    if (pollError || !completedOp) {
      return { error: pollError || 'Polling failed' };
    }

    // Step 3: Store video to blob storage
    let blobRef: BlobRef | undefined;
    let sourceVideoUri: string | undefined;

    // Check for base64 encoded video (new format)
    const generatedVideo = completedOp.response?.videos?.[0];
    const base64Video = generatedVideo?.bytesBase64Encoded;
    if (base64Video) {
      logger.debug(`[Google Video] Storing base64 encoded video to blob storage...`);
      const { blobRef: ref, error } = await this.storeBase64VideoToBlob(base64Video, context);
      if (error) {
        return { error };
      }
      blobRef = ref;
    } else {
      // Vertex storage output or legacy URI format
      const videoUri =
        generatedVideo?.gcsUri ??
        completedOp.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!videoUri) {
        logger.debug(`[Google Video] Response: ${JSON.stringify(completedOp.response)}`);
        return { error: 'No video data in response' };
      }
      sourceVideoUri = getReusableGeneratedVideoUri(videoUri, this.isVertexMode(effectiveConfig));

      const { blobRef: ref, error: downloadError } = await this.downloadVideoToBlob(
        videoUri,
        effectiveConfig,
        context,
      );
      if (downloadError) {
        return { error: downloadError };
      }
      blobRef = ref;
    }

    if (!blobRef) {
      return { error: 'Failed to store video' };
    }

    const latencyMs = Date.now() - startTime;

    // Format output with blob URI
    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    const output = `[Video: ${ellipsizedPrompt}](${blobRef.uri})`;

    return {
      output,
      cached: false,
      cost: calculateVeoCost(model, resolution, durationSeconds),
      latencyMs,
      video: {
        id: operationName,
        blobRef,
        url: blobRef.uri, // Expose URI directly for consistent API surface with Sora
        format: 'mp4',
        size: resolution,
        duration: durationSeconds,
        model,
        aspectRatio,
        resolution,
      },
      metadata: {
        operationName,
        model,
        aspectRatio,
        resolution,
        durationSeconds,
        blobHash: blobRef.hash,
        ...(sourceVideoUri ? { sourceVideoUri } : {}),
      },
    };
  }
}
