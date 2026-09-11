/**
 * Luma Ray 2 Video Generation Provider
 *
 * Supports text-to-video and image-to-video generation using AWS Bedrock's
 * async invoke API. Videos can be 5 or 9 seconds with various aspect ratios.
 */

import * as fs from 'fs';
import * as path from 'path';

import logger from '../../logger';
import { ellipsize } from '../../util/text';
import { AwsBedrockGenericProvider } from './base';
import { runBedrockVideoJob, storeBedrockVideo } from './videoJob';

import type { BlobRef } from '../../blobs';
import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/providers';
import type { LumaRayKeyframe, LumaRayKeyframes, LumaRayVideoOptions } from './index';

// =============================================================================
// Constants
// =============================================================================

const MODEL_ID = 'luma.ray-v2:0';
const DEFAULT_DURATION = '5s';
const DEFAULT_RESOLUTION = '720p';
const DEFAULT_ASPECT_RATIO = '16:9';
const DEFAULT_POLL_INTERVAL_MS = 10000; // 10 seconds
const DEFAULT_MAX_POLL_TIME_MS = 600000; // 10 minutes (Luma takes longer)

const VALID_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'];
const VALID_DURATIONS = ['5s', '9s'];
const VALID_RESOLUTIONS = ['540p', '720p'];

// =============================================================================
// LumaRayVideoProvider
// =============================================================================

export class LumaRayVideoProvider extends AwsBedrockGenericProvider implements ApiProvider {
  videoConfig: LumaRayVideoOptions;
  providerId?: string;

  constructor(
    modelName: string = MODEL_ID,
    options: { config?: LumaRayVideoOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.videoConfig = options.config || ({} as LumaRayVideoOptions);
    this.providerId = options.id;
  }

  id(): string {
    return this.providerId || `bedrock:video:${this.modelName}`;
  }

  toString(): string {
    return `[Luma Ray 2 Video Provider ${this.modelName}]`;
  }

  /**
   * Load image data from file:// path or return as-is if base64
   */
  private loadImageData(imagePath: string): { data?: string; error?: string } {
    if (imagePath.startsWith('file://')) {
      const filePath = imagePath.slice(7);
      // Resolve to absolute path and validate no path traversal
      const resolvedPath = path.resolve(filePath);
      if (filePath.includes('..') && resolvedPath !== path.resolve(path.normalize(filePath))) {
        return { error: `Invalid image path (path traversal detected): ${filePath}` };
      }
      if (!fs.existsSync(resolvedPath)) {
        return { error: `Image file not found: ${resolvedPath}` };
      }
      return { data: fs.readFileSync(resolvedPath).toString('base64') };
    }
    // Assume it's already base64
    return { data: imagePath };
  }

  /**
   * Detect image format from path or data
   */
  private detectImageFormat(imagePath: string): 'image/jpeg' | 'image/png' {
    const lowerPath = imagePath.toLowerCase();
    if (lowerPath.includes('.png') || lowerPath.startsWith('ivborw')) {
      return 'image/png';
    }
    return 'image/jpeg';
  }

  /**
   * Build a keyframe from image path
   */
  private buildKeyframe(imagePath: string): { keyframe?: LumaRayKeyframe; error?: string } {
    const { data, error } = this.loadImageData(imagePath);
    if (error || !data) {
      return { error: error || 'Failed to load image' };
    }

    return {
      keyframe: {
        type: 'image',
        source: {
          type: 'base64',
          media_type: this.detectImageFormat(imagePath),
          data,
        },
      },
    };
  }

  /**
   * Build keyframes from config convenience properties
   */
  private buildKeyframes(config: LumaRayVideoOptions): {
    keyframes?: LumaRayKeyframes;
    error?: string;
  } {
    // If keyframes are already provided, use them directly
    if (config.keyframes) {
      return { keyframes: config.keyframes };
    }

    // Build from convenience properties
    const keyframes: LumaRayKeyframes = {};

    if (config.startImage) {
      const { keyframe, error } = this.buildKeyframe(config.startImage);
      if (error) {
        return { error: `Start image error: ${error}` };
      }
      keyframes.frame0 = keyframe;
    }

    if (config.endImage) {
      const { keyframe, error } = this.buildKeyframe(config.endImage);
      if (error) {
        return { error: `End image error: ${error}` };
      }
      keyframes.frame1 = keyframe;
    }

    if (Object.keys(keyframes).length === 0) {
      return {};
    }

    return { keyframes };
  }

  /**
   * Build model input for Luma Ray
   */
  private buildModelInput(
    prompt: string,
    config: LumaRayVideoOptions,
  ): { input?: object; error?: string } {
    // Validate parameters
    const aspectRatio = config.aspectRatio || DEFAULT_ASPECT_RATIO;
    if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) {
      return {
        error: `Invalid aspect_ratio: ${aspectRatio}. Must be one of: ${VALID_ASPECT_RATIOS.join(', ')}`,
      };
    }

    const duration = config.duration || DEFAULT_DURATION;
    if (!VALID_DURATIONS.includes(duration)) {
      return {
        error: `Invalid duration: ${duration}. Must be one of: ${VALID_DURATIONS.join(', ')}`,
      };
    }

    const resolution = config.resolution || DEFAULT_RESOLUTION;
    if (!VALID_RESOLUTIONS.includes(resolution)) {
      return {
        error: `Invalid resolution: ${resolution}. Must be one of: ${VALID_RESOLUTIONS.join(', ')}`,
      };
    }

    // Build keyframes if provided
    const { keyframes, error: keyframeError } = this.buildKeyframes(config);
    if (keyframeError) {
      return { error: keyframeError };
    }

    // Build model input
    const modelInput: Record<string, unknown> = {
      prompt,
      aspect_ratio: aspectRatio,
      duration,
      resolution,
    };

    if (config.loop !== undefined) {
      modelInput.loop = config.loop;
    }

    if (keyframes) {
      modelInput.keyframes = keyframes;
    }

    return { input: modelInput };
  }

  /**
   * Get video dimensions from aspect ratio
   */
  private getVideoDimensions(aspectRatio: string, resolution: string): string {
    const height = resolution === '540p' ? 540 : 720;
    const aspectParts = aspectRatio.split(':').map(Number);
    const width = Math.round((height * aspectParts[0]) / aspectParts[1]);
    return `${width}x${height}`;
  }

  /**
   * Get duration in seconds from duration string
   */
  private getDurationSeconds(duration: string): number {
    return duration === '9s' ? 9 : 5;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    // Validate S3 output URI
    const s3OutputUri = this.videoConfig.s3OutputUri;
    if (!s3OutputUri) {
      return {
        error: 'Luma Ray requires s3OutputUri in provider config. Example: s3://my-bucket/videos/',
      };
    }

    if (!s3OutputUri.startsWith('s3://')) {
      return {
        error: `Invalid s3OutputUri: ${s3OutputUri}. Must start with s3://`,
      };
    }

    // Validate prompt
    if (!prompt || prompt.trim() === '') {
      return { error: 'Prompt is required for video generation' };
    }

    if (prompt.length > 5000) {
      return { error: `Prompt exceeds 5000 character limit. Got: ${prompt.length}` };
    }

    const config: LumaRayVideoOptions = {
      ...this.videoConfig,
      ...(context?.prompt?.config as Partial<LumaRayVideoOptions>),
    };

    const startTime = Date.now();

    // Build model input
    const { input: modelInput, error: buildError } = this.buildModelInput(prompt, config);

    if (buildError || !modelInput) {
      return { error: buildError || 'Failed to build model input' };
    }

    // Start async job
    logger.info('[Luma Ray] Starting video generation job...', {
      duration: config.duration || DEFAULT_DURATION,
      resolution: config.resolution || DEFAULT_RESOLUTION,
      aspectRatio: config.aspectRatio || DEFAULT_ASPECT_RATIO,
      s3OutputUri,
    });

    const {
      response,
      error: jobError,
      invocationArn: submittedArn,
    } = await runBedrockVideoJob(
      this,
      {
        label: 'Luma Ray',
        modelInput,
        s3OutputUri,
        pollIntervalMs: config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS,
        maxPollTimeMs: config.maxPollTimeMs || DEFAULT_MAX_POLL_TIME_MS,
      },
      options?.abortSignal,
    );
    if (jobError || !response) {
      return {
        error: jobError || 'Polling failed',
        ...(submittedArn && {
          metadata: { invocationArn: submittedArn, model: this.modelName, s3OutputUri },
        }),
      };
    }
    const invocationArn = response.invocationArn;
    const metadata = { invocationArn, model: this.modelName, s3OutputUri };

    try {
      // Get S3 output location
      const outputS3Uri = response.outputDataConfig?.s3OutputDataConfig?.s3Uri;
      if (!outputS3Uri) {
        return { error: 'No output location in response', metadata };
      }

      metadata.s3OutputUri = outputS3Uri;
      options?.abortSignal?.throwIfAborted();

      // Download and store video (if enabled)
      let blobRef: BlobRef | undefined;
      const outputUrl = `${outputS3Uri}/output.mp4`;

      if (config.downloadFromS3 !== false) {
        const { blobRef: ref, error: downloadError } = await storeBedrockVideo(
          this,
          'Luma Ray',
          outputS3Uri,
          context,
          options?.abortSignal,
        );
        options?.abortSignal?.throwIfAborted();
        if (downloadError) {
          logger.warn(`[Luma Ray] Failed to download video: ${downloadError}. Using S3 URL.`);
        } else {
          blobRef = ref;
        }
      }

      const latencyMs = Date.now() - startTime;
      const duration = config.duration || DEFAULT_DURATION;
      const resolution = config.resolution || DEFAULT_RESOLUTION;
      const aspectRatio = config.aspectRatio || DEFAULT_ASPECT_RATIO;
      const durationSeconds = this.getDurationSeconds(duration);
      const dimensions = this.getVideoDimensions(aspectRatio, resolution);

      // Format output
      const sanitizedPrompt = prompt
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')');
      const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
      const videoUrl = blobRef?.uri || outputUrl;
      const output = `[Video: ${ellipsizedPrompt}](${videoUrl})`;

      return {
        output,
        cached: false,
        latencyMs,
        video: {
          id: invocationArn,
          blobRef,
          url: blobRef ? undefined : outputUrl,
          format: 'mp4',
          size: dimensions,
          duration: durationSeconds,
          model: this.modelName,
          resolution: dimensions,
        },
        metadata: {
          ...metadata,
          duration,
          resolution,
          aspectRatio,
          loop: config.loop,
          ...(blobRef && { blobHash: blobRef.hash }),
        },
      };
    } catch (error) {
      if (!options?.abortSignal?.aborted) {
        throw error;
      }
      return {
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
        metadata,
      };
    }
  }
}
