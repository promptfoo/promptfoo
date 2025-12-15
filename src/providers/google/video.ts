import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { getEnvString } from '../../envars';
import logger from '../../logger';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { fetchWithProxy } from '../../util/fetch/index';
import { ellipsize } from '../../util/text';
import { sleep } from '../../util/time';

import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';
import type { EnvOverrides } from '../../types/env';
import type {
  GoogleVideoOptions,
  GoogleVideoOperation,
  GoogleVideoAspectRatio,
  GoogleVideoResolution,
  GoogleVideoDuration,
} from './types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Default API host for Gemini/Veo
 */
const DEFAULT_API_HOST = 'https://generativelanguage.googleapis.com';
const API_VERSION = 'v1beta';

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

/**
 * Video output subdirectory within .promptfoo
 */
const VIDEO_OUTPUT_SUBDIR = 'output/video';

// =============================================================================
// Helper Functions
// =============================================================================

function getVideoOutputDir(): string {
  return path.join(getConfigDirectoryPath(true), VIDEO_OUTPUT_SUBDIR);
}

export function getVideoFilePath(uuid: string): string {
  return path.join(getVideoOutputDir(), uuid, 'video.mp4');
}

export function getVideoApiPath(uuid: string): string {
  return `/api/output/video/${uuid}/video.mp4`;
}

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

export function checkVideoCache(cacheKey: string): boolean {
  const videoPath = getVideoFilePath(cacheKey);
  return fs.existsSync(videoPath);
}

function createVideoOutputDirectory(cacheKey?: string): string {
  const uuid = cacheKey || uuidv4();
  const outputDir = path.join(getVideoOutputDir(), uuid);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return uuid;
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

  private getApiHost(): string {
    return this.config.apiHost || DEFAULT_API_HOST;
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
   * Create a new video generation job
   */
  private async createVideoJob(
    prompt: string,
    config: GoogleVideoOptions,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    const url = `${this.getApiHost()}/${API_VERSION}/models/${this.modelName}:predictLongRunning`;

    // Build the instance object
    const instance: Record<string, unknown> = {
      prompt,
    };

    // Add optional parameters
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

    // Handle image input (first frame)
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

    // Handle last frame (interpolation, Veo 3.1 only)
    if (config.lastFrame) {
      const { data: lastFrameData, error } = this.loadImageData(config.lastFrame);
      if (error) {
        return { error };
      }
      instance.lastFrame = {
        imageBytes: lastFrameData,
        mimeType: 'image/png',
      };
    }

    // Handle reference images (Veo 3.1 only, up to 3)
    if (config.referenceImages && config.referenceImages.length > 0) {
      const refs = [];
      for (const ref of config.referenceImages.slice(0, 3)) {
        const { data: imageData, error } = this.loadImageData(ref.image);
        if (error) {
          return { error };
        }
        refs.push({
          image: { imageBytes: imageData, mimeType: 'image/png' },
          referenceType: ref.referenceType || 'asset',
        });
      }
      instance.referenceImages = refs;
    }

    // Handle video extension (Veo 3.1 only)
    if (config.extendVideoId) {
      instance.video = { operationName: config.extendVideoId };
    }

    const body = {
      instances: [instance],
    };

    try {
      logger.debug('[Google Video] Creating video job', { url, model: this.modelName });

      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.getApiKey()!,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        const errorMessage = errorData.error?.message || response.statusText;
        return {
          error: `API error ${response.status}: ${errorMessage}`,
        };
      }

      const operation = (await response.json()) as GoogleVideoOperation;
      return { operation };
    } catch (err) {
      return {
        error: `Failed to create video job: ${String(err)}`,
      };
    }
  }

  /**
   * Poll for video job completion
   */
  private async pollOperationStatus(
    operationName: string,
    pollIntervalMs: number,
    maxPollTimeMs: number,
  ): Promise<{ operation?: GoogleVideoOperation; error?: string }> {
    const startTime = Date.now();
    const url = `${this.getApiHost()}/${API_VERSION}/${operationName}`;

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const response = await fetchWithProxy(url, {
          method: 'GET',
          headers: {
            'x-goog-api-key': this.getApiKey()!,
          },
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          const errorMessage = errorData.error?.message || response.statusText;
          return {
            error: `Status check failed: ${errorMessage}`,
          };
        }

        const operation = (await response.json()) as GoogleVideoOperation;

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
        return {
          error: `Polling error: ${String(err)}`,
        };
      }
    }

    return {
      error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds`,
    };
  }

  /**
   * Download video from URI
   */
  private async downloadVideo(
    videoUri: string,
    outputUuid: string,
  ): Promise<{ filePath?: string; apiPath?: string; error?: string }> {
    try {
      // The video URI requires the API key for authentication
      const separator = videoUri.includes('?') ? '&' : '?';
      const url = `${videoUri}${separator}key=${this.getApiKey()}`;

      const response = await fetchWithProxy(url, {
        method: 'GET',
        redirect: 'follow',
      });

      if (!response.ok) {
        return {
          error: `Failed to download video: ${response.status} ${response.statusText}`,
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = getVideoFilePath(outputUuid);
      fs.writeFileSync(filePath, buffer);

      const apiPath = getVideoApiPath(outputUuid);
      logger.debug(`[Google Video] Downloaded video to ${filePath} (API: ${apiPath})`);

      return { filePath, apiPath };
    } catch (err) {
      return {
        error: `Download error: ${String(err)}`,
      };
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'Google API key is not set. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GEMINI_API_KEY environment variable or add `apiKey` to the provider config.',
      };
    }

    if (!prompt || prompt.trim() === '') {
      return {
        error: 'Prompt is required for video generation',
      };
    }

    const config: GoogleVideoOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const model = config.model || this.modelName;
    const aspectRatio = config.aspectRatio || DEFAULT_ASPECT_RATIO;
    const resolution = config.resolution || DEFAULT_RESOLUTION;
    const durationSeconds = config.durationSeconds || DEFAULT_DURATION;

    // Validate aspect ratio
    const ratioValidation = validateAspectRatio(aspectRatio);
    if (!ratioValidation.valid) {
      return { error: ratioValidation.message };
    }

    // Validate duration
    const durationValidation = validateDuration(model, durationSeconds);
    if (!durationValidation.valid) {
      return { error: durationValidation.message };
    }

    // Validate resolution
    const resolutionValidation = validateResolution(model, aspectRatio, resolution);
    if (!resolutionValidation.valid) {
      return { error: resolutionValidation.message };
    }

    // Generate cache key (skip for video extension)
    const cacheKey = config.extendVideoId
      ? undefined
      : generateVideoCacheKey(
          prompt,
          model,
          aspectRatio,
          resolution,
          durationSeconds,
          config.image,
          config.negativePrompt,
        );

    // Check cache
    if (cacheKey && checkVideoCache(cacheKey)) {
      logger.info(`[Google Video] Cache hit for video: ${cacheKey}`);

      const videoApiPath = getVideoApiPath(cacheKey);
      const sanitizedPrompt = prompt
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')');
      const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
      const output = `[Video: ${ellipsizedPrompt}](${videoApiPath})`;

      return {
        output,
        cached: true,
        latencyMs: 0,
        cost: 0,
        video: {
          uuid: cacheKey,
          url: videoApiPath,
          format: 'mp4',
          size: resolution,
          duration: durationSeconds,
          model,
          aspectRatio,
          resolution,
        },
        metadata: {
          cached: true,
          cacheKey,
          model,
          aspectRatio,
          resolution,
          durationSeconds,
        },
      };
    }

    const startTime = Date.now();

    // Step 1: Create video job
    logger.info(`[Google Video] Creating video job for model ${model}...`);
    const { operation: createdOp, error: createError } = await this.createVideoJob(prompt, {
      ...config,
      aspectRatio,
      resolution,
      durationSeconds,
    });

    if (createError || !createdOp) {
      return { error: createError || 'Failed to create video job' };
    }

    const operationName = createdOp.name;
    logger.info(`[Google Video] Video job created: ${operationName}`);

    // Step 2: Poll for completion
    const pollIntervalMs = config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const maxPollTimeMs = config.maxPollTimeMs || DEFAULT_MAX_POLL_TIME_MS;

    const { operation: completedOp, error: pollError } = await this.pollOperationStatus(
      operationName,
      pollIntervalMs,
      maxPollTimeMs,
    );

    if (pollError || !completedOp) {
      return { error: pollError || 'Polling failed' };
    }

    // Extract video URI
    const videoUri = completedOp.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!videoUri) {
      return { error: 'No video URI in response' };
    }

    // Step 3: Create output directory
    const outputUuid = createVideoOutputDirectory(cacheKey);
    logger.debug(`[Google Video] Created video output directory: ${outputUuid}`);

    // Step 4: Download video
    const {
      apiPath: videoApiPath,
      filePath: videoPath,
      error: downloadError,
    } = await this.downloadVideo(videoUri, outputUuid);

    if (downloadError || !videoApiPath) {
      return { error: downloadError || 'Failed to download video' };
    }

    const latencyMs = Date.now() - startTime;

    // Format output
    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    const output = `[Video: ${ellipsizedPrompt}](${videoApiPath})`;

    return {
      output,
      cached: false,
      latencyMs,
      // Cost calculation would need pricing info - placeholder for now
      video: {
        id: operationName,
        uuid: outputUuid,
        url: videoApiPath,
        format: 'mp4',
        size: resolution,
        duration: durationSeconds,
        model,
        aspectRatio,
        resolution,
      },
      metadata: {
        operationName,
        outputUuid,
        model,
        aspectRatio,
        resolution,
        durationSeconds,
        localPath: videoPath,
      },
    };
  }
}
