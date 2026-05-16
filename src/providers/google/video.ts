import crypto from 'crypto';
import fs from 'fs';

import { storeBlob } from '../../blobs';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { fetchWithTimeout } from '../../util/fetch/index';
import { ellipsize } from '../../util/text';
import { sleep } from '../../util/time';
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

export function validateDuration(
  model: string,
  duration: number,
): { valid: boolean; message?: string } {
  const isVeo2 = model.includes('veo-2');
  const validDurations = isVeo2 ? VEO_2_DURATIONS : VEO_3_DURATIONS;

  if (!validDurations.includes(duration as GoogleVideoDuration)) {
    return {
      valid: false,
      message: `Invalid duration ${duration}s for ${model}. Valid: ${validDurations.join(', ')}s`,
    };
  }
  return { valid: true };
}

export function validateResolution(
  model: string,
  aspectRatio: string,
  resolution: string,
): { valid: boolean; message?: string } {
  // Veo 3 only supports 1080p for 16:9 aspect ratio
  if (model.includes('veo-3') && !model.includes('veo-3.1') && aspectRatio === '9:16') {
    if (resolution === '1080p') {
      return {
        valid: false,
        message: `Veo 3 only supports 1080p for 16:9 aspect ratio. Use 720p for 9:16.`,
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

interface GoogleVideoProviderOptions {
  config?: GoogleVideoOptions;
  id?: string;
  env?: EnvOverrides;
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

  private getLocation(): string {
    return (
      this.config.region ||
      getEnvString('GOOGLE_LOCATION') ||
      this.env?.GOOGLE_LOCATION ||
      DEFAULT_LOCATION
    );
  }

  private async getProjectId(): Promise<string> {
    return await resolveProjectId(this.config, this.env);
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

  private async getVertexEndpoint(action: string = 'predictLongRunning'): Promise<string> {
    const location = this.getLocation();
    const projectId = await this.getProjectId();
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${this.modelName}:${action}`;
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
  private loadImageData(imagePath: string): { data?: string; error?: string } {
    if (imagePath.startsWith('file://')) {
      const filePath = imagePath.slice(7);
      if (!fs.existsSync(filePath)) {
        return { error: `Image file not found: ${filePath}` };
      }
      return { data: fs.readFileSync(filePath).toString('base64') };
    }
    return { data: imagePath };
  }

  /**
   * Load video data from file:// path or return as-is if base64
   */
  private loadVideoData(videoPath: string): { data?: string; error?: string } {
    if (videoPath.startsWith('file://')) {
      const filePath = videoPath.slice(7);
      if (!fs.existsSync(filePath)) {
        return { error: `Video file not found: ${filePath}` };
      }
      return { data: fs.readFileSync(filePath).toString('base64') };
    }
    return { data: videoPath };
  }

  /**
   * Create a new video generation job
   */
  private async createVideoJob(
    prompt: string,
    config: GoogleVideoOptions,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    if (this.isVertexMode(config)) {
      return this.createVertexVideoJob(prompt, config);
    }

    return this.createAiStudioVideoJob(prompt, config);
  }

  private buildVertexRequestBody(
    prompt: string,
    config: GoogleVideoOptions,
  ): { body?: Record<string, unknown>; error?: string } {
    const instance: Record<string, unknown> = { prompt };

    if (config.aspectRatio) {
      instance.aspectRatio = config.aspectRatio;
    }
    if (config.resolution) {
      instance.resolution = config.resolution;
    }
    if (config.durationSeconds) {
      instance.durationSeconds = String(config.durationSeconds);
    }
    if (config.negativePrompt) {
      instance.negativePrompt = config.negativePrompt;
    }
    if (config.personGeneration) {
      instance.personGeneration = config.personGeneration;
    }
    if (config.seed !== undefined) {
      instance.seed = config.seed;
    }

    if (config.image) {
      const { data: imageData, error } = this.loadImageData(config.image);
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
      const { data: lastFrameData, error } = this.loadImageData(lastFrame);
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

        const { data: imageData, error } = this.loadImageData(imagePath);
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

    const extendVideoId = config.extendVideoId || config.sourceVideo;
    if (extendVideoId) {
      instance.video = { operationName: extendVideoId };
    }

    return {
      body: {
        instances: [instance],
      },
    };
  }

  private buildAiStudioRequestBody(
    prompt: string,
    config: GoogleVideoOptions,
  ): { body?: Record<string, unknown>; error?: string } {
    const instance: Record<string, unknown> = { prompt };
    const parameters = this.buildAiStudioParameters(config);
    const assetError =
      this.attachAiStudioImage(instance, 'image', config.image) ||
      this.attachAiStudioImage(instance, 'lastFrame', config.lastFrame || config.lastImage) ||
      this.attachAiStudioReferenceImages(instance, config.referenceImages) ||
      this.attachAiStudioSourceVideo(instance, config);
    if (assetError) {
      return { error: assetError };
    }

    const body: Record<string, unknown> = {
      instances: [instance],
    };
    if (Object.keys(parameters).length > 0) {
      body.parameters = parameters;
    }

    return { body };
  }

  private buildAiStudioParameters(config: GoogleVideoOptions): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};
    const parameterEntries: Array<[keyof GoogleVideoOptions, string]> = [
      ['aspectRatio', 'aspectRatio'],
      ['resolution', 'resolution'],
      ['durationSeconds', 'durationSeconds'],
      ['negativePrompt', 'negativePrompt'],
      ['personGeneration', 'personGeneration'],
    ];

    for (const [configKey, parameterKey] of parameterEntries) {
      const value = config[configKey];
      if (value) {
        parameters[parameterKey] = value;
      }
    }

    if (config.seed !== undefined) {
      parameters.seed = config.seed;
    }

    return parameters;
  }

  private attachAiStudioImage(
    instance: Record<string, unknown>,
    key: 'image' | 'lastFrame',
    imagePath?: string,
  ): string | undefined {
    if (!imagePath) {
      return undefined;
    }

    const { data, error } = this.loadImageData(imagePath);
    if (error) {
      return error;
    }

    instance[key] = {
      inlineData: {
        mimeType: 'image/png',
        data,
      },
    };
    return undefined;
  }

  private attachAiStudioReferenceImages(
    instance: Record<string, unknown>,
    referenceImages: GoogleVideoOptions['referenceImages'],
  ): string | undefined {
    if (!referenceImages?.length) {
      return undefined;
    }

    const refs = [];
    for (const ref of referenceImages.slice(0, 3)) {
      const imagePath = typeof ref === 'string' ? ref : ref.image;
      const referenceType = typeof ref === 'string' ? 'asset' : ref.referenceType || 'asset';
      const { data, error } = this.loadImageData(imagePath);
      if (error) {
        return error;
      }
      refs.push({
        image: {
          inlineData: {
            mimeType: 'image/png',
            data,
          },
        },
        referenceType,
      });
    }

    instance.referenceImages = refs;
    return undefined;
  }

  private attachAiStudioSourceVideo(
    instance: Record<string, unknown>,
    config: GoogleVideoOptions,
  ): string | undefined {
    const sourceVideo = config.extendVideoId || config.sourceVideo;
    if (!sourceVideo) {
      return undefined;
    }
    if (sourceVideo.includes('/operations/')) {
      return 'Google AI Studio Veo does not accept operation IDs for video extension. Use `vertex:video:*` with `extendVideoId`, or provide base64/file:// video data via `sourceVideo`.';
    }

    const { data, error } = this.loadVideoData(sourceVideo);
    if (error) {
      return error;
    }
    instance.video = {
      inlineData: {
        mimeType: 'video/mp4',
        data,
      },
    };
    return undefined;
  }

  private async createVertexVideoJob(
    prompt: string,
    config: GoogleVideoOptions,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    const url = await this.getVertexEndpoint('predictLongRunning');
    const { body, error: bodyError } = this.buildVertexRequestBody(prompt, config);
    if (bodyError || !body) {
      return { error: bodyError || 'Failed to build Vertex Veo request' };
    }

    try {
      const client = await this.getClientWithCredentials();
      logger.debug('[Google Video] Creating video job', { url, model: this.modelName });

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
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    const { body, error: bodyError } = this.buildAiStudioRequestBody(prompt, config);
    if (bodyError || !body) {
      return { error: bodyError || 'Failed to build Google AI Studio Veo request' };
    }

    try {
      const headers = await this.getAiStudioHeaders(config);
      const url = this.getAiStudioEndpoint(`models/${this.modelName}:predictLongRunning`);

      logger.debug('[Google Video] Creating video job', {
        url,
        model: this.modelName,
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
      return this.pollVertexOperationStatus(operationName, pollIntervalMs, maxPollTimeMs);
    }

    return this.pollAiStudioOperationStatus(operationName, pollIntervalMs, maxPollTimeMs, config);
  }

  private async pollVertexOperationStatus(
    operationName: string,
    pollIntervalMs: number,
    maxPollTimeMs: number,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    const startTime = Date.now();
    const location = this.getLocation();
    const projectId = await this.getProjectId();

    // Veo uses fetchPredictOperation endpoint for polling (POST request)
    // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${this.modelName}:fetchPredictOperation`;

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
  ): Promise<{ blobRef?: BlobRef; error?: string }> {
    if (this.isVertexMode(config)) {
      return this.downloadVertexVideoToBlob(videoUri);
    }

    return this.downloadAiStudioVideoToBlob(videoUri, config);
  }

  private async downloadVertexVideoToBlob(
    videoUri: string,
  ): Promise<{ blobRef?: BlobRef; error?: string }> {
    try {
      const client = await this.getClientWithCredentials();

      // Use authenticated request to download video
      const response = await client.request({
        url: videoUri,
        method: 'GET',
        responseType: 'arraybuffer',
      });

      const buffer = Buffer.from(response.data as ArrayBuffer);

      // Store to blob storage
      const { ref } = await storeBlob(buffer, 'video/mp4', {
        kind: 'video',
        location: 'response.video',
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
        kind: 'video',
        location: 'response.video',
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
  ): Promise<{ blobRef?: BlobRef; error?: string }> {
    try {
      const buffer = Buffer.from(base64Data, 'base64');

      // Store to blob storage
      const { ref, deduplicated } = await storeBlob(buffer, 'video/mp4', {
        kind: 'video',
        location: 'response.video',
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
    if (!prompt || prompt.trim() === '') {
      return { error: 'Prompt is required for video generation' };
    }

    const resolvedConfig = await this.resolveEffectiveConfig(context);
    if ('error' in resolvedConfig) {
      return resolvedConfig;
    }

    const { effectiveConfig, model, aspectRatio, resolution, durationSeconds } = resolvedConfig;
    const validationError = this.getVideoValidationError(
      model,
      aspectRatio,
      resolution,
      durationSeconds,
    );
    if (validationError) {
      return { error: validationError };
    }

    const startTime = Date.now();
    const createdOp = await this.createAndPollVideoJob(prompt, {
      ...effectiveConfig,
      aspectRatio,
      resolution,
      durationSeconds,
    });
    if ('error' in createdOp) {
      return createdOp;
    }

    const { operationName, completedOp } = createdOp;
    const storedVideo = await this.storeCompletedVideo(completedOp, effectiveConfig);
    if ('error' in storedVideo) {
      return storedVideo;
    }

    const latencyMs = Date.now() - startTime;
    return this.createVideoResponse(
      prompt,
      storedVideo.blobRef,
      latencyMs,
      operationName,
      model,
      aspectRatio,
      resolution,
      durationSeconds,
    );
  }

  private async resolveEffectiveConfig(context?: CallApiContextParams): Promise<
    | {
        effectiveConfig: GoogleVideoOptions;
        model: string;
        aspectRatio: GoogleVideoAspectRatio;
        resolution: GoogleVideoResolution;
        durationSeconds: GoogleVideoDuration;
      }
    | { error: string }
  > {
    let effectiveConfig: GoogleVideoOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    if (this.isVertexMode(effectiveConfig)) {
      const projectId = await this.resolveVertexProjectId(effectiveConfig);
      if ('error' in projectId) {
        return projectId;
      }
      effectiveConfig = {
        ...effectiveConfig,
        vertexai: true,
        ...(projectId.projectId ? { projectId: projectId.projectId } : {}),
      };
    } else if (!this.getApiKey(effectiveConfig)) {
      const fallbackConfig = await this.tryResolveVertexFallback(effectiveConfig);
      if ('error' in fallbackConfig) {
        return fallbackConfig;
      }
      effectiveConfig = fallbackConfig.effectiveConfig;
    }

    return {
      effectiveConfig,
      model: effectiveConfig.model || this.modelName,
      aspectRatio: effectiveConfig.aspectRatio || DEFAULT_ASPECT_RATIO,
      resolution: effectiveConfig.resolution || DEFAULT_RESOLUTION,
      durationSeconds:
        effectiveConfig.durationSeconds || effectiveConfig.duration || DEFAULT_DURATION,
    };
  }

  private async resolveVertexProjectId(
    config: GoogleVideoOptions,
  ): Promise<{ projectId?: string } | { error: string }> {
    let projectId =
      config.projectId ||
      getEnvString('GOOGLE_CLOUD_PROJECT') ||
      getEnvString('GOOGLE_PROJECT_ID') ||
      this.env?.GOOGLE_CLOUD_PROJECT ||
      this.env?.GOOGLE_PROJECT_ID;
    if (projectId) {
      return { projectId };
    }

    try {
      projectId = await resolveProjectId(config, this.env);
      return { projectId };
    } catch {
      return {
        error:
          'Google Veo video generation via Vertex AI requires a project ID. Set GOOGLE_CLOUD_PROJECT or add `projectId` to the provider config, then run "gcloud auth application-default login".',
      };
    }
  }

  private async tryResolveVertexFallback(
    config: GoogleVideoOptions,
  ): Promise<{ effectiveConfig: GoogleVideoOptions } | { error: string }> {
    try {
      const adcProjectId = await resolveProjectId(config, this.env);
      if (!adcProjectId) {
        return this.createAiStudioApiKeyError();
      }
      return {
        effectiveConfig: {
          ...config,
          vertexai: true,
          projectId: adcProjectId,
        },
      };
    } catch {
      return this.createAiStudioApiKeyError();
    }
  }

  private createAiStudioApiKeyError(): { error: string } {
    return {
      error:
        'Google Veo video generation via Google AI Studio requires an API key. Set GOOGLE_API_KEY or GEMINI_API_KEY, or add `apiKey` to the provider config.',
    };
  }

  private getVideoValidationError(
    model: string,
    aspectRatio: GoogleVideoAspectRatio,
    resolution: GoogleVideoResolution,
    durationSeconds: GoogleVideoDuration,
  ): string | undefined {
    const ratioValidation = validateAspectRatio(aspectRatio);
    if (!ratioValidation.valid) {
      return ratioValidation.message;
    }

    const durationValidation = validateDuration(model, durationSeconds);
    if (!durationValidation.valid) {
      return durationValidation.message;
    }

    const resolutionValidation = validateResolution(model, aspectRatio, resolution);
    return resolutionValidation.valid ? undefined : resolutionValidation.message;
  }

  private async createAndPollVideoJob(
    prompt: string,
    config: GoogleVideoOptions,
  ): Promise<{ operationName: string; completedOp: GoogleVideoOperation } | { error: string }> {
    const model = config.model || this.modelName;
    logger.info(`[Google Video] Creating video job for model ${model}...`);
    const { operation: createdOp, error: createError } = await this.createVideoJob(prompt, config);
    if (createError || !createdOp) {
      return { error: createError || 'Failed to create video job' };
    }

    const operationName = createdOp.name;
    logger.info(`[Google Video] Video job created: ${operationName}`);
    const pollIntervalMs = config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const maxPollTimeMs = config.maxPollTimeMs || DEFAULT_MAX_POLL_TIME_MS;
    const { operation: completedOp, error: pollError } = await this.pollOperationStatus(
      operationName,
      pollIntervalMs,
      maxPollTimeMs,
      config,
    );
    if (pollError || !completedOp) {
      return { error: pollError || 'Polling failed' };
    }

    return { operationName, completedOp };
  }

  private async storeCompletedVideo(
    completedOp: GoogleVideoOperation,
    config: GoogleVideoOptions,
  ): Promise<{ blobRef: BlobRef } | { error: string }> {
    const base64Video = completedOp.response?.videos?.[0]?.bytesBase64Encoded;
    if (base64Video) {
      logger.debug(`[Google Video] Storing base64 encoded video to blob storage...`);
      const { blobRef, error } = await this.storeBase64VideoToBlob(base64Video);
      if (error || !blobRef) {
        return { error: error || 'Failed to store video' };
      }
      return { blobRef };
    }

    const videoUri = completedOp.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!videoUri) {
      logger.debug(`[Google Video] Response: ${JSON.stringify(completedOp.response)}`);
      return { error: 'No video data in response' };
    }

    const { blobRef, error } = await this.downloadVideoToBlob(videoUri, config);
    if (error || !blobRef) {
      return { error: error || 'Failed to store video' };
    }
    return { blobRef };
  }

  private createVideoResponse(
    prompt: string,
    blobRef: BlobRef,
    latencyMs: number,
    operationName: string,
    model: string,
    aspectRatio: GoogleVideoAspectRatio,
    resolution: GoogleVideoResolution,
    durationSeconds: GoogleVideoDuration,
  ): ProviderResponse {
    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);

    return {
      output: `[Video: ${ellipsizedPrompt}](${blobRef.uri})`,
      cached: false,
      latencyMs,
      video: {
        id: operationName,
        blobRef,
        url: blobRef.uri,
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
      },
    };
  }
}
