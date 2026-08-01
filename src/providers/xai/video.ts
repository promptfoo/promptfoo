/**
 * xAI Grok Imagine Video Provider
 *
 * Supports:
 * - Text-to-video generation
 * - Image-to-video generation (with image.url)
 * - Reference-to-video generation (with reference images and Video 1.5 preset voices)
 * - Video editing (with video.url, legacy model only)
 *
 * API Documentation: https://docs.x.ai/docs/guides/video-generations-and-edits
 */
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { sleep } from '../../util/time';
import {
  buildStorageRefUrl,
  checkVideoCache,
  createValidator,
  DEFAULT_MAX_POLL_TIME_MS,
  DEFAULT_POLL_INTERVAL_MS,
  formatVideoOutput,
  generateVideoCacheKey,
  storeCacheMapping,
  storeVideoContent,
} from '../video';
import { getXAICostInUsd } from './chat';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

// =============================================================================
// Types
// =============================================================================

export type XaiVideoModel =
  | 'grok-imagine-video'
  | 'grok-imagine-video-1.5'
  | 'grok-imagine-video-1.5-preview'
  | 'grok-imagine-video-1.5-2026-05-30';

export type XaiVideoAspectRatio = '16:9' | '4:3' | '1:1' | '9:16' | '3:4' | '3:2' | '2:3';

export type XaiVideoResolution = '1080p' | '720p' | '480p';

export interface XaiVideoCostOptions {
  modelName?: string;
  resolution?: XaiVideoResolution;
  hasImageInput?: boolean;
  imageInputCount?: number;
}

export interface XaiVideoJobResponse {
  request_id: string;
}

/**
 * Status response when video is still processing
 */
export interface XaiVideoStatusPending {
  status: 'pending' | 'processing';
}

/**
 * Status response when video is completed
 * Note: The API returns the video object directly, not a status field
 */
export interface XaiVideoStatusCompleted {
  status?: 'done';
  video: {
    url: string;
    duration: number;
    respect_moderation?: boolean;
  };
  model: string;
  usage?: {
    cost_in_usd_ticks?: number;
  };
}

/**
 * Status response when video generation failed
 */
export interface XaiVideoStatusFailed {
  status: 'failed';
  error?: string;
}

export type XaiVideoStatusResponse =
  | XaiVideoStatusPending
  | XaiVideoStatusCompleted
  | XaiVideoStatusFailed;

export interface XaiVideoOptions {
  /** API key (defaults to XAI_API_KEY env var) */
  apiKey?: string;
  /** Custom API base URL */
  apiBaseUrl?: string;
  /** Region for regional endpoints, such as `eu-west-1` */
  region?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Video duration in seconds (1-15, default: 8) */
  duration?: number;
  /** Aspect ratio (default: 16:9) */
  aspect_ratio?: XaiVideoAspectRatio;
  /** Resolution (default: 720p) */
  resolution?: XaiVideoResolution;
  /** Image URL for image-to-video generation */
  image?: { url: string };
  /** Reference image URLs for reference-to-video generation */
  reference_images?: { url: string }[];
  /** Preset voice IDs for Grok Imagine Video 1.5 reference-to-video generation */
  reference_audios?: { voice_id: string }[];
  /** Video URL for video editing */
  video?: { url: string };
  /** Polling interval in ms (default: 10000) */
  poll_interval_ms?: number;
  /** Maximum polling time in ms (default: 600000) */
  max_poll_time_ms?: number;
}

// =============================================================================
// Constants
// =============================================================================

const PROVIDER_NAME = 'xAI Video';
const DEFAULT_MODEL: XaiVideoModel = 'grok-imagine-video';
const DEFAULT_API_BASE_URL = 'https://api.x.ai/v1';

/** Valid aspect ratios for Grok Imagine */
const VALID_ASPECT_RATIOS: readonly XaiVideoAspectRatio[] = [
  '16:9',
  '4:3',
  '1:1',
  '9:16',
  '3:4',
  '3:2',
  '2:3',
] as const;

const GROK_IMAGINE_VIDEO_15_MODELS = new Set<string>([
  'grok-imagine-video-1.5',
  'grok-imagine-video-1.5-preview',
  'grok-imagine-video-1.5-2026-05-30',
]);

/** Valid resolutions for the legacy and 1.5 Grok Imagine video families. */
const LEGACY_VALID_RESOLUTIONS: readonly XaiVideoResolution[] = ['720p', '480p'] as const;
const VIDEO_15_VALID_RESOLUTIONS: readonly XaiVideoResolution[] = [
  '1080p',
  '720p',
  '480p',
] as const;

/** Default configuration */
const DEFAULT_DURATION = 8;
const DEFAULT_ASPECT_RATIO: XaiVideoAspectRatio = '16:9';
const DEFAULT_RESOLUTION: XaiVideoResolution = '720p';
const MIN_DURATION = 1;
const MAX_DURATION = 15;
const LEGACY_MAX_REFERENCE_DURATION = 10;
const MAX_REFERENCE_IMAGES = 7;
const MAX_REFERENCE_AUDIOS = 3;

const LEGACY_VIDEO_COST_PER_SECOND: Record<'720p' | '480p', number> = {
  '720p': 0.07,
  '480p': 0.05,
};
const VIDEO_15_COST_PER_SECOND: Record<XaiVideoResolution, number> = {
  '1080p': 0.25,
  '720p': 0.14,
  '480p': 0.08,
};
const LEGACY_IMAGE_INPUT_COST = 0.002;
const VIDEO_15_IMAGE_INPUT_COST = 0.01;

// =============================================================================
// Validation
// =============================================================================

export const validateAspectRatio = createValidator(VALID_ASPECT_RATIOS, 'aspect ratio');
const validateLegacyResolution = createValidator(LEGACY_VALID_RESOLUTIONS, 'resolution');
const validateVideo15Resolution = createValidator(VIDEO_15_VALID_RESOLUTIONS, 'resolution');

function isGrokImagineVideo15Model(modelName: string): boolean {
  return GROK_IMAGINE_VIDEO_15_MODELS.has(modelName);
}

export function validateResolution(
  resolution: XaiVideoResolution,
  modelName: string = DEFAULT_MODEL,
): { valid: boolean; message?: string } {
  return isGrokImagineVideo15Model(modelName)
    ? validateVideo15Resolution(resolution)
    : validateLegacyResolution(resolution);
}

export function validateDuration(duration: number): { valid: boolean; message?: string } {
  if (duration < MIN_DURATION || duration > MAX_DURATION) {
    return {
      valid: false,
      message: `Invalid duration "${duration}". Must be between ${MIN_DURATION} and ${MAX_DURATION} seconds.`,
    };
  }
  return { valid: true };
}

function buildVideoInputReference(config: XaiVideoOptions): string | null {
  if (config.image?.url) {
    return `image:${config.image.url}`;
  }

  const referenceInputs = [
    config.reference_images?.length
      ? `reference_images:${config.reference_images.map(({ url }) => url).join('|')}`
      : undefined,
    config.reference_audios?.length
      ? `reference_audios:${config.reference_audios
          .map(({ voice_id }) => voice_id.trim())
          .join('|')}`
      : undefined,
  ].filter((value): value is string => value !== undefined);

  return referenceInputs.length ? referenceInputs.join(';') : null;
}

/**
 * Calculate video generation cost
 */
export function calculateVideoCost(
  seconds: number,
  cached: boolean = false,
  options: XaiVideoCostOptions = {},
): number {
  if (cached) {
    return 0;
  }

  const modelName = options.modelName ?? DEFAULT_MODEL;
  const resolution = options.resolution ?? DEFAULT_RESOLUTION;
  const isVideo15 = isGrokImagineVideo15Model(modelName);
  const outputRate = isVideo15
    ? VIDEO_15_COST_PER_SECOND[resolution]
    : LEGACY_VIDEO_COST_PER_SECOND[resolution === '480p' ? '480p' : '720p'];
  const imageInputCount = options.imageInputCount ?? (options.hasImageInput ? 1 : 0);
  const imageInputCost =
    imageInputCount * (isVideo15 ? VIDEO_15_IMAGE_INPUT_COST : LEGACY_IMAGE_INPUT_COST);
  return outputRate * seconds + imageInputCost;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class XAIVideoProvider implements ApiProvider {
  modelName: XaiVideoModel;
  config: XaiVideoOptions;
  private providerId?: string;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: XaiVideoOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    this.modelName = (modelName || DEFAULT_MODEL) as XaiVideoModel;
    this.config = options.config || {};
    this.providerId = options.id;
    this.env = options.env;
  }

  id(): string {
    return this.providerId || `xai:video:${this.modelName}`;
  }

  toString(): string {
    return `[xAI Video Provider ${this.modelName}]`;
  }

  /**
   * Get API key from config or environment
   */
  getApiKey(): string | undefined {
    if (this.config?.apiKey) {
      return this.config.apiKey;
    }
    return getEnvString('XAI_API_KEY');
  }

  /**
   * Get API base URL.
   * Precedence: apiBaseUrl > XAI_API_BASE_URL env > region > default.
   */
  getApiUrl(): string {
    if (this.config.apiBaseUrl) {
      return this.config.apiBaseUrl;
    }
    const envApiBaseUrl = getEnvString('XAI_API_BASE_URL');
    if (envApiBaseUrl) {
      return envApiBaseUrl;
    }
    if (this.config.region) {
      return `https://${this.config.region}.api.x.ai/v1`;
    }
    return DEFAULT_API_BASE_URL;
  }

  /**
   * Build authorization headers
   */
  private getAuthHeaders(): Record<string, string> {
    const apiKey = this.getApiKey();
    return {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...this.config.headers,
    };
  }

  /**
   * Create a video generation or edit job
   */
  private async createVideoJob(
    prompt: string,
    config: XaiVideoOptions,
  ): Promise<{ requestId?: string; error?: string }> {
    const isEdit = !!config.video?.url;
    const endpoint = isEdit ? '/videos/edits' : '/videos/generations';
    const url = `${this.getApiUrl()}${endpoint}`;

    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt,
    };

    // Add generation-specific parameters (not for edits)
    if (!isEdit) {
      if (config.duration !== undefined) {
        body.duration = config.duration;
      }
      if (config.aspect_ratio) {
        body.aspect_ratio = config.aspect_ratio;
      }
      if (config.resolution) {
        body.resolution = config.resolution;
      }
    }

    // Image-to-video
    if (config.image?.url) {
      body.image = { url: config.image.url };
    }

    // Reference-to-video
    if (config.reference_images?.length) {
      body.reference_images = config.reference_images.map(({ url }) => ({ url }));
    }

    // Preset voices for Grok Imagine Video 1.5 reference-to-video
    if (config.reference_audios?.length) {
      body.reference_audios = config.reference_audios.map(({ voice_id }) => ({
        voice_id: voice_id.trim(),
      }));
    }

    // Video editing
    if (config.video?.url) {
      body.video = { url: config.video.url };
    }

    try {
      logger.debug(`[${PROVIDER_NAME}] Creating video job`, { url, model: this.modelName, isEdit });

      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          (errorData as { error?: { message?: string } }).error?.message || response.statusText;
        return { error: `API error ${response.status}: ${errorMessage}` };
      }

      const result = (await response.json()) as XaiVideoJobResponse;
      return { requestId: result.request_id };
    } catch (err: unknown) {
      return { error: `Failed to create video job: ${String(err)}` };
    }
  }

  private validateVideoInputs(
    prompt: string,
    config: XaiVideoOptions,
    duration: number,
    resolution: XaiVideoResolution,
    isEdit: boolean,
  ): string | undefined {
    const isVideo15 = isGrokImagineVideo15Model(this.modelName);
    const referenceImageCount = config.reference_images?.length ?? 0;
    const referenceAudioCount = config.reference_audios?.length ?? 0;
    const hasReferenceImages = referenceImageCount > 0;
    const hasReferenceAudios = referenceAudioCount > 0;
    const hasReferenceMedia = hasReferenceImages || hasReferenceAudios;

    if (isVideo15 && isEdit) {
      return 'Grok Imagine Video 1.5 does not support video editing.';
    }

    if (hasReferenceAudios && !isVideo15) {
      return 'reference_audios are only supported by Grok Imagine Video 1.5.';
    }

    if (!hasReferenceMedia) {
      return undefined;
    }

    if (config.image?.url) {
      return hasReferenceAudios
        ? 'reference media cannot be combined with image input. Use one video generation mode per request.'
        : 'reference_images cannot be combined with image input. Use one video generation mode per request.';
    }

    if (isEdit) {
      return 'reference media cannot be combined with video edits. Use one video generation mode per request.';
    }

    if (!prompt.trim()) {
      return 'Reference-to-video requires a non-empty prompt.';
    }

    if (referenceImageCount > MAX_REFERENCE_IMAGES) {
      return `Invalid reference_images count "${referenceImageCount}". Must be between 1 and ${MAX_REFERENCE_IMAGES}.`;
    }

    if (referenceAudioCount > MAX_REFERENCE_AUDIOS) {
      return `Invalid reference_audios count "${referenceAudioCount}". Must be between 1 and ${MAX_REFERENCE_AUDIOS}.`;
    }

    if (config.reference_audios?.some(({ voice_id }) => !voice_id.trim())) {
      return 'Each reference_audios entry must contain a non-empty voice_id.';
    }

    const maxReferenceDuration = isVideo15 ? MAX_DURATION : LEGACY_MAX_REFERENCE_DURATION;
    if (duration > maxReferenceDuration) {
      return `Invalid duration "${duration}" for reference-to-video. Must be between ${MIN_DURATION} and ${maxReferenceDuration} seconds.`;
    }

    if (resolution === '1080p') {
      return 'Reference-to-video resolution is capped at 720p.';
    }

    return undefined;
  }

  private validateGenerationParameters(
    duration: number,
    aspectRatio: XaiVideoAspectRatio,
    resolution: XaiVideoResolution,
    isEdit: boolean,
  ): string | undefined {
    if (isEdit) {
      return undefined;
    }

    const durationValidation = validateDuration(duration);
    if (!durationValidation.valid) {
      return durationValidation.message;
    }

    const aspectRatioValidation = validateAspectRatio(aspectRatio);
    if (!aspectRatioValidation.valid) {
      return aspectRatioValidation.message;
    }

    const resolutionValidation = validateResolution(resolution, this.modelName);
    return resolutionValidation.valid ? undefined : resolutionValidation.message;
  }

  /**
   * Poll for video job completion
   *
   * The xAI API has different response shapes:
   * - Pending: {"status": "pending"}
   * - Completed: {"video": {"url": "...", "duration": ...}, "model": "..."}
   * - Failed: {"status": "failed", "error": "..."}
   */
  private async pollVideoStatus(
    requestId: string,
    pollIntervalMs: number,
    maxPollTimeMs: number,
  ): Promise<{ videoUrl?: string; videoDuration?: number; reportedCost?: number; error?: string }> {
    const startTime = Date.now();
    const url = `${this.getApiUrl()}/videos/${requestId}`;

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const response = await fetchWithProxy(url, {
          method: 'GET',
          headers: this.getAuthHeaders(),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            (errorData as { error?: { message?: string } }).error?.message || response.statusText;
          return { error: `Status check failed: ${errorMessage}` };
        }

        const data = (await response.json()) as XaiVideoStatusResponse;

        // Check if completed (has video object)
        if ('video' in data && data.video?.url) {
          logger.debug(`[${PROVIDER_NAME}] Job ${requestId} completed with video URL`);
          return {
            videoUrl: data.video.url,
            videoDuration: data.video.duration,
            reportedCost: getXAICostInUsd(data.usage),
          };
        }

        // Check if failed
        if ('status' in data && data.status === 'failed') {
          const failedData = data as XaiVideoStatusFailed;
          return { error: failedData.error || 'Video generation failed' };
        }

        // Still pending/processing
        if ('status' in data) {
          logger.debug(`[${PROVIDER_NAME}] Job ${requestId} status: ${data.status}`);
        }

        // Wait before next poll
        await sleep(pollIntervalMs);
      } catch (err: unknown) {
        return { error: `Polling error: ${String(err)}` };
      }
    }

    return { error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds` };
  }

  /**
   * Download video from URL and store in media storage
   */
  private async downloadAndStoreVideo(
    videoUrl: string,
    cacheKey: string,
    evalId?: string,
  ): Promise<{ storageKey?: string; error?: string }> {
    try {
      logger.debug(`[${PROVIDER_NAME}] Downloading video from ${videoUrl}`);

      const response = await fetchWithProxy(videoUrl, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        return { error: `Failed to download video: ${response.status} ${response.statusText}` };
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      const { storageRef, error } = await storeVideoContent(
        buffer,
        {
          contentType: 'video/mp4',
          mediaType: 'video',
          evalId,
          contentHash: cacheKey,
        },
        PROVIDER_NAME,
      );

      if (error || !storageRef) {
        return { error: error || 'Failed to store video' };
      }

      return { storageKey: storageRef.key };
    } catch (err: unknown) {
      return { error: `Download error: ${String(err)}` };
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Validate API key
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'xAI API key is not set. Set the XAI_API_KEY environment variable or add `apiKey` to the provider config.',
      };
    }

    // Merge config from provider and prompt context
    const config: XaiVideoOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const duration = config.duration ?? DEFAULT_DURATION;
    const aspectRatio = config.aspect_ratio || DEFAULT_ASPECT_RATIO;
    const resolution = config.resolution || DEFAULT_RESOLUTION;
    const evalId = context?.evaluationId;
    const isEdit = !!config.video?.url;
    const hasReferenceImages = Boolean(config.reference_images?.length);
    const hasReferenceAudios = Boolean(config.reference_audios?.length);

    const inputValidationError = this.validateVideoInputs(
      prompt,
      config,
      duration,
      resolution,
      isEdit,
    );
    if (inputValidationError) {
      return { error: inputValidationError };
    }

    const generationParameterError = this.validateGenerationParameters(
      duration,
      aspectRatio,
      resolution,
      isEdit,
    );
    if (generationParameterError) {
      return { error: generationParameterError };
    }

    // Generate cache key (skip caching for edits)
    const cacheKey = generateVideoCacheKey({
      provider: 'xai',
      prompt,
      model: this.modelName,
      size: `${aspectRatio}:${resolution}`,
      seconds: duration,
      inputReference: buildVideoInputReference(config),
    });

    // Check cache (skip for edits)
    if (!isEdit) {
      const cachedVideoKey = await checkVideoCache(cacheKey, PROVIDER_NAME);
      if (cachedVideoKey) {
        logger.info(`[${PROVIDER_NAME}] Cache hit for video: ${cacheKey}`);

        const videoUrl = buildStorageRefUrl(cachedVideoKey);
        const output = formatVideoOutput(prompt, videoUrl);

        return {
          output,
          cached: true,
          latencyMs: 0,
          cost: 0,
          video: {
            storageRef: { key: cachedVideoKey },
            url: videoUrl,
            format: 'mp4',
            size: aspectRatio,
            duration,
            model: this.modelName,
            aspectRatio,
            resolution,
          },
          metadata: {
            cached: true,
            cacheKey,
            model: this.modelName,
            aspectRatio,
            resolution,
            duration,
            hasReferenceImages,
            hasReferenceAudios,
          },
        };
      }
    }

    const startTime = Date.now();

    // Step 1: Create video job
    logger.info(`[${PROVIDER_NAME}] Creating ${isEdit ? 'video edit' : 'video generation'} job...`);
    const { requestId, error: createError } = await this.createVideoJob(prompt, {
      ...config,
      duration,
      aspect_ratio: aspectRatio,
      resolution,
    });

    if (createError || !requestId) {
      return { error: createError || 'Failed to create video job' };
    }

    logger.info(`[${PROVIDER_NAME}] Video job created: ${requestId}`);

    // Step 2: Poll for completion
    const pollIntervalMs = config.poll_interval_ms || DEFAULT_POLL_INTERVAL_MS;
    const maxPollTimeMs = config.max_poll_time_ms || DEFAULT_MAX_POLL_TIME_MS;

    const {
      videoUrl: completedVideoUrl,
      videoDuration,
      reportedCost,
      error: pollError,
    } = await this.pollVideoStatus(requestId, pollIntervalMs, maxPollTimeMs);

    if (pollError) {
      return { error: pollError };
    }

    if (!completedVideoUrl) {
      return { error: 'Video URL not returned in response' };
    }

    // Use the actual duration from the API response if available
    const actualDuration = videoDuration ?? duration;

    // Step 3: Download and store video
    logger.debug(`[${PROVIDER_NAME}] Downloading video from ${completedVideoUrl}`);
    const { storageKey, error: downloadError } = await this.downloadAndStoreVideo(
      completedVideoUrl,
      cacheKey,
      evalId,
    );

    if (downloadError || !storageKey) {
      return { error: downloadError || 'Failed to download video' };
    }

    const latencyMs = Date.now() - startTime;
    const outputResolution = isEdit ? undefined : resolution;
    const estimatedCost = outputResolution
      ? calculateVideoCost(actualDuration, false, {
          modelName: this.modelName,
          resolution: outputResolution,
          imageInputCount: config.reference_images?.length || (config.image?.url ? 1 : 0),
        })
      : undefined;
    const cost = reportedCost ?? estimatedCost;

    // Store cache mapping (skip for edits)
    if (!isEdit) {
      await storeCacheMapping(cacheKey, storageKey, undefined, undefined, PROVIDER_NAME);
    }

    const storedVideoUrl = buildStorageRefUrl(storageKey);
    const output = formatVideoOutput(prompt, storedVideoUrl);

    return {
      output,
      cached: false,
      latencyMs,
      cost,
      video: {
        id: requestId,
        storageRef: { key: storageKey },
        url: storedVideoUrl,
        format: 'mp4',
        size: aspectRatio,
        duration: actualDuration,
        model: this.modelName,
        aspectRatio,
        ...(outputResolution ? { resolution: outputResolution } : {}),
      },
      metadata: {
        requestId,
        cacheKey,
        model: this.modelName,
        aspectRatio,
        ...(outputResolution ? { resolution: outputResolution } : {}),
        duration: actualDuration,
        storageKey,
        isEdit,
        hasReferenceImages,
        hasReferenceAudios,
      },
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createXAIVideoProvider(
  providerPath: string,
  options: { config?: XaiVideoOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  // Format: xai:video:<model> - model is optional, defaults to grok-imagine-video
  const modelName = splits.slice(2).join(':') || DEFAULT_MODEL;
  return new XAIVideoProvider(modelName, options);
}
