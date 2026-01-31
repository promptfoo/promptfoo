/**
 * xAI Grok Imagine Video Provider
 *
 * Supports:
 * - Text-to-video generation
 * - Image-to-video generation (with image.url)
 * - Video editing (with video.url)
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

export type XaiVideoModel = 'grok-imagine-video';

export type XaiVideoAspectRatio = '16:9' | '4:3' | '1:1' | '9:16' | '3:4' | '3:2' | '2:3';

export type XaiVideoResolution = '720p' | '480p';

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
  video: {
    url: string;
    duration: number;
    respect_moderation?: boolean;
  };
  model: string;
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

/** Valid resolutions for Grok Imagine */
const VALID_RESOLUTIONS: readonly XaiVideoResolution[] = ['720p', '480p'] as const;

/** Default configuration */
const DEFAULT_DURATION = 8;
const DEFAULT_ASPECT_RATIO: XaiVideoAspectRatio = '16:9';
const DEFAULT_RESOLUTION: XaiVideoResolution = '720p';
const MIN_DURATION = 1;
const MAX_DURATION = 15;

/**
 * Cost per second for Grok Imagine video generation
 * Note: This is an estimate - verify with xAI pricing
 */
const COST_PER_SECOND = 0.05;

// =============================================================================
// Validation
// =============================================================================

export const validateAspectRatio = createValidator(VALID_ASPECT_RATIOS, 'aspect ratio');
export const validateResolution = createValidator(VALID_RESOLUTIONS, 'resolution');

export function validateDuration(duration: number): { valid: boolean; message?: string } {
  if (duration < MIN_DURATION || duration > MAX_DURATION) {
    return {
      valid: false,
      message: `Invalid duration "${duration}". Must be between ${MIN_DURATION} and ${MAX_DURATION} seconds.`,
    };
  }
  return { valid: true };
}

/**
 * Calculate video generation cost
 */
export function calculateVideoCost(seconds: number, cached: boolean = false): number {
  if (cached) {
    return 0;
  }
  return COST_PER_SECOND * seconds;
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
   * Get API base URL
   */
  getApiUrl(): string {
    return this.config?.apiBaseUrl || DEFAULT_API_BASE_URL;
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
  ): Promise<{ videoUrl?: string; videoDuration?: number; error?: string }> {
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
          return { videoUrl: data.video.url, videoDuration: data.video.duration };
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

    // Validate parameters (only for generation, not edits)
    if (!isEdit) {
      const durationValidation = validateDuration(duration);
      if (!durationValidation.valid) {
        return { error: durationValidation.message };
      }

      const aspectRatioValidation = validateAspectRatio(aspectRatio);
      if (!aspectRatioValidation.valid) {
        return { error: aspectRatioValidation.message };
      }

      const resolutionValidation = validateResolution(resolution);
      if (!resolutionValidation.valid) {
        return { error: resolutionValidation.message };
      }
    }

    // Generate cache key (skip caching for edits)
    const cacheKey = generateVideoCacheKey({
      provider: 'xai',
      prompt,
      model: this.modelName,
      size: `${aspectRatio}:${resolution}`,
      seconds: duration,
      inputReference: config.image?.url || null,
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
    const cost = calculateVideoCost(actualDuration, false);

    // Store cache mapping (skip for edits)
    if (!isEdit) {
      storeCacheMapping(cacheKey, storageKey, undefined, undefined, PROVIDER_NAME);
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
        resolution,
      },
      metadata: {
        requestId,
        cacheKey,
        model: this.modelName,
        aspectRatio,
        resolution,
        duration: actualDuration,
        storageKey,
        isEdit,
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
