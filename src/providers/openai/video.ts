import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import logger from '../../logger';
import { getMediaStorage, storeMedia } from '../../storage';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { fetchWithProxy } from '../../util/fetch/index';
import { ellipsize } from '../../util/text';
import { sleep } from '../../util/time';
import { OpenAiGenericProvider } from '.';

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

// Cache mapping constants
const MEDIA_DIR = 'media';
const CACHE_DIR = 'video/_cache';

// =============================================================================
// Constants
// =============================================================================

/**
 * Cost per second of video generation by model
 */
export const SORA_COSTS: Record<OpenAiVideoModel, number> = {
  'sora-2': 0.1,
  'sora-2-pro': 0.3,
};

/**
 * Valid video sizes (aspect ratios)
 */
const VALID_VIDEO_SIZES: OpenAiVideoSize[] = ['1280x720', '720x1280'];

/**
 * Valid video durations in seconds
 */
const VALID_VIDEO_DURATIONS: OpenAiVideoDuration[] = [4, 8, 12];

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
// Helper Functions
// =============================================================================

/**
 * Get the file path for a cache mapping file.
 * Cache mappings are stored directly on filesystem (not through media storage)
 * to avoid content-based key generation.
 */
function getCacheMappingPath(cacheKey: string): string {
  const basePath = path.join(getConfigDirectoryPath(true), MEDIA_DIR);
  const cacheDir = path.join(basePath, CACHE_DIR);
  // Ensure directory exists
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, `${cacheKey}.json`);
}

/**
 * Generate a deterministic content hash from video generation parameters.
 * Used for cache key lookup and deduplication.
 *
 * @param prompt - The video generation prompt
 * @param model - The model name (e.g., 'sora-2')
 * @param size - Video dimensions (e.g., '1280x720')
 * @param seconds - Video duration in seconds
 * @param inputReference - Optional image reference for image-to-video
 * @returns A hex hash string for content addressing
 */
export function generateVideoCacheKey(
  prompt: string,
  model: string,
  size: string,
  seconds: number,
  inputReference?: string,
): string {
  const hashInput = JSON.stringify({
    prompt,
    model,
    size,
    seconds,
    inputReference: inputReference || null,
  });

  return crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
}

/**
 * Check if a cached video exists for the given cache key.
 * Reads the cache mapping from filesystem and verifies the video still exists.
 */
export async function checkVideoCache(cacheKey: string): Promise<string | null> {
  const mappingPath = getCacheMappingPath(cacheKey);

  if (!fs.existsSync(mappingPath)) {
    return null;
  }

  try {
    const mappingData = fs.readFileSync(mappingPath, 'utf8');
    const mapping = JSON.parse(mappingData);
    // Verify the referenced video file still exists in storage
    if (mapping.videoKey) {
      const storage = getMediaStorage();
      if (await storage.exists(mapping.videoKey)) {
        return mapping.videoKey;
      }
    }
  } catch (err) {
    // Mapping file corrupted, treat as cache miss
    logger.debug(`[OpenAI Video] Cache mapping read failed: ${err}`);
  }

  return null;
}

/**
 * Store cache mapping from request hash to storage keys.
 * Written directly to filesystem to maintain predictable path.
 */
function storeCacheMapping(
  cacheKey: string,
  videoKey: string,
  thumbnailKey?: string,
  spritesheetKey?: string,
): void {
  const mapping = {
    videoKey,
    thumbnailKey,
    spritesheetKey,
    createdAt: new Date().toISOString(),
  };

  const mappingPath = getCacheMappingPath(cacheKey);
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');
  logger.debug(`[OpenAI Video] Stored cache mapping at ${mappingPath}`);
}

/**
 * Validate video size parameter
 */
export function validateVideoSize(size: string): { valid: boolean; message?: string } {
  if (!VALID_VIDEO_SIZES.includes(size as OpenAiVideoSize)) {
    return {
      valid: false,
      message: `Invalid video size "${size}". Valid sizes: ${VALID_VIDEO_SIZES.join(', ')}`,
    };
  }
  return { valid: true };
}

/**
 * Validate video seconds parameter
 */
export function validateVideoSeconds(seconds: number): { valid: boolean; message?: string } {
  if (!VALID_VIDEO_DURATIONS.includes(seconds as OpenAiVideoDuration)) {
    return {
      valid: false,
      message: `Invalid video duration "${seconds}" seconds. Valid durations: ${VALID_VIDEO_DURATIONS.join(', ')} seconds`,
    };
  }
  return { valid: true };
}

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
 * to ~/.promptfoo/output/video/{uuid}/ and served via API routes.
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

  /**
   * Build authorization headers for API requests
   */
  private getAuthHeaders(): Record<string, string> {
    const organization = this.getOrganization();
    return {
      Authorization: `Bearer ${this.getApiKey()}`,
      ...(organization ? { 'OpenAI-Organization': organization } : {}),
    };
  }

  /**
   * Create a new video generation job
   */
  private async createVideoJob(
    prompt: string,
    config: OpenAiVideoOptions,
  ): Promise<{ job: OpenAiVideoJob; error?: string }> {
    const url = config.remix_video_id
      ? `${this.getApiUrl()}/videos/${config.remix_video_id}/remix`
      : `${this.getApiUrl()}/videos`;

    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt,
    };

    // Only include these for new videos (not remix)
    if (!config.remix_video_id) {
      body.size = config.size || DEFAULT_SIZE;
      // API requires seconds as a string ("4", "8", or "12")
      body.seconds = String(config.seconds || DEFAULT_SECONDS);
    }

    // Handle input_reference (image-to-video)
    if (config.input_reference) {
      let imageData = config.input_reference;
      if (config.input_reference.startsWith('file://')) {
        const filePath = config.input_reference.slice(7);
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          imageData = buffer.toString('base64');
        } else {
          return {
            job: {} as OpenAiVideoJob,
            error: `Input reference file not found: ${filePath}`,
          };
        }
      }
      body.input_reference = imageData;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
      ...config.headers,
    };

    try {
      logger.debug('[OpenAI Video] Creating video job', { url, model: this.modelName });

      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          (errorData as { error?: { message?: string } }).error?.message || response.statusText;
        return {
          job: {} as OpenAiVideoJob,
          error: `API error ${response.status}: ${errorMessage}`,
        };
      }

      const job = (await response.json()) as OpenAiVideoJob;
      return { job };
    } catch (err) {
      return {
        job: {} as OpenAiVideoJob,
        error: `Failed to create video job: ${String(err)}`,
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
    const url = `${this.getApiUrl()}/videos/${videoId}`;
    const headers = this.getAuthHeaders();

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const response = await fetchWithProxy(url, { method: 'GET', headers });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            (errorData as { error?: { message?: string } }).error?.message || response.statusText;
          return {
            job: {} as OpenAiVideoJob,
            error: `Status check failed: ${errorMessage}`,
          };
        }

        const job: OpenAiVideoJob = (await response.json()) as OpenAiVideoJob;

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
      } catch (err) {
        return {
          job: {} as OpenAiVideoJob,
          error: `Polling error: ${String(err)}`,
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
    const url = `${this.getApiUrl()}/videos/${soraVideoId}/content${variant !== 'video' ? `?variant=${variant}` : ''}`;
    const headers = this.getAuthHeaders();

    try {
      const response = await fetchWithProxy(url, { method: 'GET', headers });

      if (!response.ok) {
        return {
          error: `Failed to download ${variant}: ${response.status} ${response.statusText}`,
        };
      }

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
    } catch (err) {
      return {
        error: `Download error for ${variant}: ${String(err)}`,
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
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
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
    const cacheKey = config.remix_video_id
      ? generateVideoCacheKey(prompt, model, size, seconds)
      : generateVideoCacheKey(prompt, model, size, seconds, config.input_reference);

    // Check for cached video (skip for remix operations)
    const cachedVideoKey = config.remix_video_id ? null : await checkVideoCache(cacheKey);
    if (cachedVideoKey) {
      logger.info(`[OpenAI Video] Cache hit for video: ${cacheKey}`);

      const storage = getMediaStorage();

      // Read the cache mapping from filesystem to get thumbnail/spritesheet keys
      const mappingPath = getCacheMappingPath(cacheKey);
      let thumbnailKey: string | undefined;
      let spritesheetKey: string | undefined;

      try {
        const mappingData = fs.readFileSync(mappingPath, 'utf8');
        const mapping = JSON.parse(mappingData);
        thumbnailKey = mapping.thumbnailKey;
        spritesheetKey = mapping.spritesheetKey;
      } catch (err) {
        // Mapping exists but couldn't be read - just use video
        logger.debug(`[OpenAI Video] Failed to read cache mapping for thumbnails: ${err}`);
      }

      // Build storage ref URL for video using the actual stored key
      const videoUrl = `storageRef:${cachedVideoKey}`;

      // Check for optional assets using actual stored keys
      const hasThumbnail = thumbnailKey && (await storage.exists(thumbnailKey));
      const hasSpritesheet = spritesheetKey && (await storage.exists(spritesheetKey));

      const sanitizedPrompt = prompt
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')');
      const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
      const output = `[Video: ${ellipsizedPrompt}](${videoUrl})`;

      return {
        output,
        cached: true,
        latencyMs: 0,
        cost: 0,
        video: {
          id: undefined, // No Sora ID for cached results
          url: videoUrl,
          format: 'mp4',
          size,
          duration: seconds,
          thumbnail: hasThumbnail ? `storageRef:${thumbnailKey}` : undefined,
          spritesheet: hasSpritesheet ? `storageRef:${spritesheetKey}` : undefined,
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
    storeCacheMapping(cacheKey, videoRef.key, thumbnailRef?.key, spritesheetRef?.key);

    // Build storage ref URLs
    const videoUrl = `storageRef:${videoRef.key}`;
    const thumbnailUrl = thumbnailRef ? `storageRef:${thumbnailRef.key}` : undefined;
    const spritesheetUrl = spritesheetRef ? `storageRef:${spritesheetRef.key}` : undefined;

    // Format output as markdown (similar to image provider)
    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    const output = `[Video: ${ellipsizedPrompt}](${videoUrl})`;

    return {
      output,
      cached: false,
      latencyMs,
      cost,
      video: {
        id: videoId,
        url: videoUrl,
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
