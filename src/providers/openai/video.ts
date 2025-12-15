import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../logger';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { ellipsize } from '../../util/text';
import { sleep } from '../../util/time';
import { OpenAiGenericProvider } from '.';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { EnvOverrides } from '../../types/env';
import type {
  OpenAiVideoOptions,
  OpenAiVideoJob,
  OpenAiVideoModel,
  OpenAiVideoSize,
  OpenAiVideoVariant,
} from './types';

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
 * Default configuration values
 */
const DEFAULT_SIZE: OpenAiVideoSize = '1280x720';
const DEFAULT_SECONDS = 8;
const DEFAULT_POLL_INTERVAL_MS = 10000; // 10 seconds
const DEFAULT_MAX_POLL_TIME_MS = 600000; // 10 minutes

/**
 * Video output subdirectory within .promptfoo
 */
const VIDEO_OUTPUT_SUBDIR = 'output/video';

/**
 * File names for each variant within a video output directory
 */
const VARIANT_FILENAMES: Record<OpenAiVideoVariant, string> = {
  video: 'video.mp4',
  thumbnail: 'thumbnail.webp',
  spritesheet: 'spritesheet.jpg',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the base video output directory (~/.promptfoo/output/video)
 */
function getVideoOutputDir(): string {
  return path.join(getConfigDirectoryPath(true), VIDEO_OUTPUT_SUBDIR);
}

/**
 * Create a new UUID-based output directory for a video generation.
 * Structure: ~/.promptfoo/output/video/{uuid}/
 */
function createVideoOutputDirectory(): string {
  const uuid = uuidv4();
  const outputDir = path.join(getVideoOutputDir(), uuid);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return uuid;
}

/**
 * Get file path for a variant within a UUID directory.
 */
function getVideoFilePath(uuid: string, variant: OpenAiVideoVariant): string {
  return path.join(getVideoOutputDir(), uuid, VARIANT_FILENAMES[variant]);
}

/**
 * Get the URL path for serving a video file via the API.
 * Returns relative path like: /api/output/video/{uuid}/video.mp4
 */
export function getVideoApiPath(uuid: string, variant: OpenAiVideoVariant): string {
  return `/api/output/video/${uuid}/${VARIANT_FILENAMES[variant]}`;
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
  declare config: OpenAiVideoOptions;
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
      body.seconds = config.seconds || DEFAULT_SECONDS;
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
      Authorization: `Bearer ${this.getApiKey()}`,
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization()! } : {}),
      ...config.headers,
    };

    try {
      logger.debug('[OpenAI Video] Creating video job', { url, model: this.modelName });

      const response = await fetch(url, {
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

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.getApiKey()}`,
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization()! } : {}),
    };

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const response = await fetch(url, { method: 'GET', headers });

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

        logger.debug(`[OpenAI Video] Job ${videoId} status: ${job.status}, progress: ${job.progress}%`);

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
   * Download video content (video, thumbnail, or spritesheet)
   */
  private async downloadVideoContent(
    soraVideoId: string,
    variant: OpenAiVideoVariant,
    outputUuid: string,
  ): Promise<{ filePath?: string; apiPath?: string; error?: string }> {
    const url = `${this.getApiUrl()}/videos/${soraVideoId}/content${variant !== 'video' ? `?variant=${variant}` : ''}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.getApiKey()}`,
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization()! } : {}),
    };

    try {
      const response = await fetch(url, { method: 'GET', headers });

      if (!response.ok) {
        return {
          error: `Failed to download ${variant}: ${response.status} ${response.statusText}`,
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = getVideoFilePath(outputUuid, variant);
      fs.writeFileSync(filePath, buffer);

      // Return both the local file path and the API path for serving
      const apiPath = getVideoApiPath(outputUuid, variant);
      logger.debug(`[OpenAI Video] Downloaded ${variant} to ${filePath} (API: ${apiPath})`);

      return { filePath, apiPath };
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

    // Validate size
    const sizeValidation = validateVideoSize(size);
    if (!sizeValidation.valid) {
      return { error: sizeValidation.message };
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

    // Step 3: Create UUID-based output directory
    const outputUuid = createVideoOutputDirectory();
    logger.debug(`[OpenAI Video] Created video output directory: ${outputUuid}`);

    // Step 4: Download assets
    const downloadThumbnail = config.download_thumbnail !== false;
    const downloadSpritesheet = config.download_spritesheet !== false;

    // Download video (required)
    const {
      apiPath: videoApiPath,
      filePath: videoPath,
      error: videoDownloadError,
    } = await this.downloadVideoContent(videoId, 'video', outputUuid);

    if (videoDownloadError || !videoApiPath) {
      return { error: videoDownloadError || 'Failed to download video' };
    }

    // Download thumbnail (optional)
    let thumbnailApiPath: string | undefined;
    if (downloadThumbnail) {
      const { apiPath, error } = await this.downloadVideoContent(videoId, 'thumbnail', outputUuid);
      if (error) {
        logger.warn(`[OpenAI Video] Failed to download thumbnail: ${error}`);
      } else {
        thumbnailApiPath = apiPath;
      }
    }

    // Download spritesheet (optional)
    let spritesheetApiPath: string | undefined;
    if (downloadSpritesheet) {
      const { apiPath, error } = await this.downloadVideoContent(
        videoId,
        'spritesheet',
        outputUuid,
      );
      if (error) {
        logger.warn(`[OpenAI Video] Failed to download spritesheet: ${error}`);
      } else {
        spritesheetApiPath = apiPath;
      }
    }

    const latencyMs = Date.now() - startTime;
    const cost = calculateVideoCost(model, seconds, false);

    // Format output as markdown (similar to image provider)
    const sanitizedPrompt = prompt.replace(/\r?\n|\r/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    const output = `[Video: ${ellipsizedPrompt}](${videoApiPath})`;

    return {
      output,
      cached: false,
      latencyMs,
      cost,
      video: {
        id: videoId,
        uuid: outputUuid,
        url: videoApiPath,
        format: 'mp4',
        size,
        duration: seconds,
        thumbnail: thumbnailApiPath,
        spritesheet: spritesheetApiPath,
        model,
      },
      metadata: {
        soraVideoId: videoId,
        outputUuid,
        model,
        size,
        seconds,
        localPath: videoPath,
      },
    };
  }
}
