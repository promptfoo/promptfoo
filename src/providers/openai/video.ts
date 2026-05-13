import fs from 'fs/promises';
import path from 'path';

import OpenAI from 'openai';
import logger from '../../logger';
import { getMediaStorage, storeMedia } from '../../storage';
import { fetchWithProxy } from '../../util/fetch/index';
import { sleep } from '../../util/time';
import {
  buildStorageRefUrl,
  checkVideoCache,
  createValidator,
  formatVideoOutput,
  generateVideoCacheKey,
  readCacheMapping,
  storeCacheMapping,
} from '../video';
import { OpenAiGenericProvider } from '.';
import { createOpenAiClient, unwrapOpenAiTransportError } from './client';

import type { MediaStorageRef } from '../../storage/types';
import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type {
  OpenAiVideoDuration,
  OpenAiVideoJob,
  OpenAiVideoModel,
  OpenAiVideoOptions,
  OpenAiVideoSize,
  OpenAiVideoVariant,
} from './types';

// =============================================================================
// Constants
// =============================================================================

/** Provider name for logging */
const PROVIDER_NAME = 'OpenAI Video';

/**
 * Cost per second of video generation by model
 */
export const SORA_COSTS: Record<OpenAiVideoModel, number> = {
  'sora-2': 0.1,
  'sora-2-pro': 0.3,
};

/**
 * Valid video sizes (aspect ratios) for OpenAI Sora
 */
const VALID_VIDEO_SIZES: readonly OpenAiVideoSize[] = [
  '1280x720',
  '720x1280',
  '1792x1024',
  '1024x1792',
] as const;

/**
 * Valid video durations in seconds for OpenAI Sora
 */
const VALID_VIDEO_DURATIONS: readonly OpenAiVideoDuration[] = [4, 8, 12] as const;

/**
 * Default configuration values
 */
const DEFAULT_SIZE: OpenAiVideoSize = '1280x720';
const DEFAULT_SECONDS: OpenAiVideoDuration = 8;
const DEFAULT_POLL_INTERVAL_MS = 10000; // 10 seconds
const DEFAULT_MAX_POLL_TIME_MS = 600000; // 10 minutes

/**
 * MIME types for each variant
 */
const VARIANT_MIME_TYPES: Record<OpenAiVideoVariant, string> = {
  video: 'video/mp4',
  thumbnail: 'image/webp',
  spritesheet: 'image/jpeg',
};

// =============================================================================
// Validation Functions (using shared validator)
// =============================================================================

/**
 * Validate video size parameter
 */
export const validateVideoSize = createValidator(VALID_VIDEO_SIZES, 'video size');

/**
 * Validate video seconds parameter
 */
export const validateVideoSeconds = createValidator(VALID_VIDEO_DURATIONS, 'video duration');

/**
 * Calculate video generation cost based on model and duration
 */
export function calculateVideoCost(
  model: OpenAiVideoModel,
  seconds: number,
  cached: boolean = false,
): number {
  if (cached) {
    return 0;
  }
  const costPerSecond = SORA_COSTS[model] || SORA_COSTS['sora-2'];
  return costPerSecond * seconds;
}

type OpenAiVideoErrorDetails = {
  rawError: unknown;
  status?: number;
  message: string;
};

function getOpenAiVideoErrorDetails(err: unknown): OpenAiVideoErrorDetails {
  const rawError = unwrapOpenAiTransportError(err);

  if (typeof rawError === 'object' && rawError !== null) {
    const status =
      'status' in rawError && typeof rawError.status === 'number' ? rawError.status : undefined;
    const nestedError = 'error' in rawError ? rawError.error : undefined;
    const nestedMessage =
      typeof nestedError === 'object' &&
      nestedError !== null &&
      'message' in nestedError &&
      typeof nestedError.message === 'string'
        ? nestedError.message
        : undefined;
    const fallbackMessage = rawError instanceof Error ? rawError.message : String(rawError);

    return {
      rawError,
      status,
      message: stripStatusPrefix(status, nestedMessage ?? fallbackMessage),
    };
  }

  return {
    rawError,
    message: String(rawError),
  };
}

function stripStatusPrefix(status: number | undefined, message: string): string {
  if (status === undefined) {
    return message;
  }

  const prefix = `${status} `;
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

function formatCreateVideoError(err: unknown): string {
  const details = getOpenAiVideoErrorDetails(err);
  return details.status === undefined
    ? `Failed to create video job: ${String(details.rawError)}`
    : `API error ${details.status}: ${details.message}`;
}

function formatPollVideoError(err: unknown): string {
  const details = getOpenAiVideoErrorDetails(err);
  return details.status === undefined
    ? `Polling error: ${String(details.rawError)}`
    : `Status check failed: ${details.message}`;
}

function formatDownloadVideoError(variant: OpenAiVideoVariant, err: unknown): string {
  const details = getOpenAiVideoErrorDetails(err);
  return details.status === undefined
    ? `Download error for ${variant}: ${String(details.rawError)}`
    : `Failed to download ${variant}: ${details.status} ${details.message}`;
}

// =============================================================================
// OpenAiVideoProvider
// =============================================================================

/**
 * OpenAI Video Provider for Sora video generation.
 *
 * Supports:
 * - Text-to-video generation
 * - Image-to-video generation (with input_reference)
 * - Video remixing (with remix_video_id)
 *
 * Videos are generated asynchronously via polling, then downloaded
 * to ~/.promptfoo/media/video/ and served via API routes.
 */
export class OpenAiVideoProvider extends OpenAiGenericProvider {
  config: OpenAiVideoOptions;
  private providerId?: string;

  constructor(
    modelName: string,
    options: { config?: OpenAiVideoOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
    this.providerId = options.id;
  }

  id(): string {
    return this.providerId || `openai:video:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Video Provider ${this.modelName}]`;
  }

  private createClient(headers?: Record<string, string>) {
    return createOpenAiClient({
      apiKey: this.getApiKey(),
      allowMissingApiKey: !this.requiresApiKey(),
      organization: this.getOrganization(),
      baseURL: this.getApiUrl(),
      headers,
      // `fetchWithProxy` already owns transient retry behavior for this transport.
      // Keep SDK retries off here so create/remix requests do not multiply attempts.
      maxRetries: 0,
      fetch: (url, init) => fetchWithProxy(url instanceof URL ? url.toString() : url, init),
    });
  }

  /**
   * Create a new video generation job
   */
  private async createVideoJob(
    prompt: string,
    config: OpenAiVideoOptions,
  ): Promise<{ job: OpenAiVideoJob; error?: string }> {
    const client = this.createClient(config.headers);
    const body: OpenAI.VideoCreateParams = {
      model: this.modelName as OpenAI.VideoModel,
      prompt,
    };

    // Only include these for new videos (not remix)
    if (!config.remix_video_id) {
      body.size = (config.size || DEFAULT_SIZE) as OpenAI.VideoSize;
      // API requires seconds as a string ("4", "8", or "12")
      body.seconds = String(config.seconds || DEFAULT_SECONDS) as OpenAI.VideoSeconds;
    }

    // Handle input_reference (image-to-video)
    if (config.input_reference) {
      if (config.input_reference.startsWith('file://')) {
        const filePath = config.input_reference.slice(7);
        try {
          const buffer = await fs.readFile(filePath);
          body.input_reference = new File([buffer], path.basename(filePath));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
          return {
            job: {} as OpenAiVideoJob,
            error: `Input reference file not found: ${filePath}`,
          };
        }
      } else if (
        config.input_reference.startsWith('http://') ||
        config.input_reference.startsWith('https://') ||
        config.input_reference.startsWith('data:')
      ) {
        body.input_reference = { image_url: config.input_reference };
      } else {
        body.input_reference = new File(
          [Buffer.from(config.input_reference, 'base64')],
          'input-reference.png',
        );
      }
    }

    try {
      logger.debug('[OpenAI Video] Creating video job', {
        remixVideoId: config.remix_video_id,
        model: this.modelName,
      });

      const job = config.remix_video_id
        ? ((await client.videos.remix(config.remix_video_id, {
            prompt,
          })) as OpenAiVideoJob)
        : ((await client.videos.create(body)) as OpenAiVideoJob);
      return { job };
    } catch (err: unknown) {
      return {
        job: {} as OpenAiVideoJob,
        error: formatCreateVideoError(err),
      };
    }
  }

  /**
   * Poll for video job completion
   */
  private async pollVideoStatus(
    videoId: string,
    pollIntervalMs: number,
    maxPollTimeMs: number,
  ): Promise<{ job: OpenAiVideoJob; error?: string }> {
    const startTime = Date.now();
    const client = this.createClient();

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const job = (await client.videos.retrieve(videoId)) as OpenAiVideoJob;

        logger.debug(
          `[OpenAI Video] Job ${videoId} status: ${job.status}, progress: ${job.progress}%`,
        );

        if (job.status === 'completed') {
          return { job };
        }

        if (job.status === 'failed') {
          return {
            job,
            error: job.error?.message || 'Video generation failed',
          };
        }

        // Wait before next poll
        await sleep(pollIntervalMs);
      } catch (err: unknown) {
        return {
          job: {} as OpenAiVideoJob,
          error: formatPollVideoError(err),
        };
      }
    }

    return {
      job: {} as OpenAiVideoJob,
      error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds`,
    };
  }

  /**
   * Download video content and store in media storage
   */
  private async downloadVideoContent(
    soraVideoId: string,
    variant: OpenAiVideoVariant,
    cacheKey: string,
    evalId?: string,
  ): Promise<{ storageRef?: MediaStorageRef; error?: string }> {
    const client = this.createClient();

    try {
      const response = await client.videos.downloadContent(
        soraVideoId,
        variant === 'video' ? {} : { variant },
      );
      const buffer = Buffer.from(await response.arrayBuffer());
      const mimeType = VARIANT_MIME_TYPES[variant];
      const mediaType = variant === 'video' ? 'video' : 'image';

      // Store in media storage
      const { ref } = await storeMedia(buffer, {
        contentType: mimeType,
        mediaType,
        evalId,
        contentHash: cacheKey,
      });

      logger.debug(`[OpenAI Video] Stored ${variant} at ${ref.key}`);

      return { storageRef: ref };
    } catch (err: unknown) {
      return {
        error: formatDownloadVideoError(variant, err),
      };
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Validate API key
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const config: OpenAiVideoOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const model = (config.model || this.modelName) as OpenAiVideoModel;
    const size = (config.size || DEFAULT_SIZE) as OpenAiVideoSize;
    const seconds = config.seconds || DEFAULT_SECONDS;
    const evalId = context?.evaluationId;

    // Validate size
    const sizeValidation = validateVideoSize(size);
    if (!sizeValidation.valid) {
      return { error: sizeValidation.message };
    }

    // Validate seconds
    const secondsValidation = validateVideoSeconds(seconds);
    if (!secondsValidation.valid) {
      return { error: secondsValidation.message };
    }

    // Generate deterministic cache key from inputs
    // Note: remix_video_id is excluded from cache key as remixes should always regenerate
    const cacheKey = generateVideoCacheKey({
      provider: 'openai',
      prompt,
      model,
      size,
      seconds,
      inputReference: config.remix_video_id ? null : config.input_reference,
    });

    // Check for cached video (skip for remix operations)
    const cachedVideoKey = config.remix_video_id
      ? null
      : await checkVideoCache(cacheKey, PROVIDER_NAME);
    if (cachedVideoKey) {
      logger.info(`[${PROVIDER_NAME}] Cache hit for video: ${cacheKey}`);

      const storage = getMediaStorage();

      // Read the cache mapping from filesystem to get thumbnail/spritesheet keys
      const mapping = await readCacheMapping(cacheKey);
      const thumbnailKey = mapping?.thumbnailKey;
      const spritesheetKey = mapping?.spritesheetKey;

      // Build storage ref URL for video using the actual stored key
      const videoUrl = buildStorageRefUrl(cachedVideoKey);

      // Check for optional assets using actual stored keys
      const hasThumbnail = thumbnailKey && (await storage.exists(thumbnailKey));
      const hasSpritesheet = spritesheetKey && (await storage.exists(spritesheetKey));

      const output = formatVideoOutput(prompt, videoUrl);

      return {
        output,
        cached: true,
        latencyMs: 0,
        cost: 0,
        video: {
          id: undefined, // No Sora ID for cached results
          storageRef: { key: cachedVideoKey }, // Structured storage reference (preferred)
          url: videoUrl, // Legacy URL format for backwards compatibility
          format: 'mp4',
          size,
          duration: seconds,
          thumbnail: hasThumbnail ? buildStorageRefUrl(thumbnailKey!) : undefined,
          spritesheet: hasSpritesheet ? buildStorageRefUrl(spritesheetKey!) : undefined,
          model,
        },
        metadata: {
          cached: true,
          cacheKey,
          model,
          size,
          seconds,
        },
      };
    }

    const startTime = Date.now();

    // Step 1: Create video job
    logger.info(`[OpenAI Video] Creating video job for model ${model}...`);
    const { job: createdJob, error: createError } = await this.createVideoJob(prompt, {
      ...config,
      size,
      seconds,
    });

    if (createError) {
      return { error: createError };
    }

    const videoId = createdJob.id;
    logger.info(`[OpenAI Video] Video job created: ${videoId}`);

    // Step 2: Poll for completion
    const pollIntervalMs = config.poll_interval_ms || DEFAULT_POLL_INTERVAL_MS;
    const maxPollTimeMs = config.max_poll_time_ms || DEFAULT_MAX_POLL_TIME_MS;

    const { error: pollError } = await this.pollVideoStatus(videoId, pollIntervalMs, maxPollTimeMs);

    if (pollError) {
      return { error: pollError };
    }

    // Step 3: Download and store video
    logger.debug(`[OpenAI Video] Downloading and storing video assets...`);

    const downloadThumbnail = config.download_thumbnail !== false;
    const downloadSpritesheet = config.download_spritesheet !== false;

    // Download video (required)
    const { storageRef: videoRef, error: videoDownloadError } = await this.downloadVideoContent(
      videoId,
      'video',
      cacheKey,
      evalId,
    );

    if (videoDownloadError || !videoRef) {
      return { error: videoDownloadError || 'Failed to download video' };
    }

    // Download thumbnail (optional)
    let thumbnailRef: MediaStorageRef | undefined;
    if (downloadThumbnail) {
      const { storageRef, error } = await this.downloadVideoContent(
        videoId,
        'thumbnail',
        cacheKey,
        evalId,
      );
      if (error) {
        logger.warn(`[OpenAI Video] Failed to download thumbnail: ${error}`);
      } else {
        thumbnailRef = storageRef;
      }
    }

    // Download spritesheet (optional)
    let spritesheetRef: MediaStorageRef | undefined;
    if (downloadSpritesheet) {
      const { storageRef, error } = await this.downloadVideoContent(
        videoId,
        'spritesheet',
        cacheKey,
        evalId,
      );
      if (error) {
        logger.warn(`[OpenAI Video] Failed to download spritesheet: ${error}`);
      } else {
        spritesheetRef = storageRef;
      }
    }

    const latencyMs = Date.now() - startTime;
    const cost = calculateVideoCost(model, seconds, false);

    // Store cache mapping for future lookups
    await storeCacheMapping(
      cacheKey,
      videoRef.key,
      thumbnailRef?.key,
      spritesheetRef?.key,
      PROVIDER_NAME,
    );

    // Build storage ref URLs
    const videoUrl = buildStorageRefUrl(videoRef.key);
    const thumbnailUrl = thumbnailRef ? buildStorageRefUrl(thumbnailRef.key) : undefined;
    const spritesheetUrl = spritesheetRef ? buildStorageRefUrl(spritesheetRef.key) : undefined;

    // Format output as markdown (similar to image provider)
    const output = formatVideoOutput(prompt, videoUrl);

    return {
      output,
      cached: false,
      latencyMs,
      cost,
      video: {
        id: videoId,
        storageRef: { key: videoRef.key }, // Structured storage reference (preferred)
        url: videoUrl, // Legacy URL format for backwards compatibility
        format: 'mp4',
        size,
        duration: seconds,
        thumbnail: thumbnailUrl,
        spritesheet: spritesheetUrl,
        model,
      },
      metadata: {
        soraVideoId: videoId,
        cacheKey,
        model,
        size,
        seconds,
        storageKey: videoRef.key,
      },
    };
  }
}
