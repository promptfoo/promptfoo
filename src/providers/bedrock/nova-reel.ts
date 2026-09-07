/**
 * Amazon Nova Reel Video Generation Provider
 *
 * Supports text-to-video and image-to-video generation using AWS Bedrock's
 * async invoke API. Videos are generated in 6-second increments up to 2 minutes.
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
import type { NovaReelVideoOptions } from './index';

// =============================================================================
// Constants
// =============================================================================

const MODEL_ID = 'amazon.nova-reel-v1:1';
const DEFAULT_DURATION_SECONDS = 6;
const DEFAULT_POLL_INTERVAL_MS = 10000; // 10 seconds
const DEFAULT_MAX_POLL_TIME_MS = 900000; // 15 minutes
const VIDEO_DIMENSION = '1280x720';
const VIDEO_FPS = 24;

// =============================================================================
// NovaReelVideoProvider
// =============================================================================

export class NovaReelVideoProvider extends AwsBedrockGenericProvider implements ApiProvider {
  videoConfig: NovaReelVideoOptions;
  providerId?: string;

  constructor(
    modelName: string = MODEL_ID,
    options: { config?: NovaReelVideoOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.videoConfig = options.config || ({} as NovaReelVideoOptions);
    this.providerId = options.id;
  }

  id(): string {
    return this.providerId || `bedrock:video:${this.modelName}`;
  }

  toString(): string {
    return `[Amazon Nova Reel Video Provider ${this.modelName}]`;
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
  private detectImageFormat(imagePath: string): 'png' | 'jpeg' {
    const lowerPath = imagePath.toLowerCase();
    if (lowerPath.includes('.png') || lowerPath.startsWith('ivborw')) {
      return 'png';
    }
    return 'jpeg';
  }

  /**
   * Build model input based on task type
   */
  private buildModelInput(
    prompt: string,
    config: NovaReelVideoOptions,
  ): { input?: object; error?: string } {
    const taskType = config.taskType || 'TEXT_VIDEO';
    const durationSeconds = config.durationSeconds || DEFAULT_DURATION_SECONDS;

    // Validate duration
    if (taskType === 'TEXT_VIDEO' && durationSeconds !== 6) {
      return { error: 'TEXT_VIDEO task type only supports durationSeconds: 6' };
    }
    if (
      (taskType === 'MULTI_SHOT_AUTOMATED' || taskType === 'MULTI_SHOT_MANUAL') &&
      (durationSeconds < 12 || durationSeconds > 120 || durationSeconds % 6 !== 0)
    ) {
      return {
        error: `Multi-shot videos require durationSeconds between 12-120 in multiples of 6. Got: ${durationSeconds}`,
      };
    }

    const videoGenerationConfig = {
      durationSeconds,
      fps: VIDEO_FPS,
      dimension: VIDEO_DIMENSION,
      ...(config.seed !== undefined && { seed: config.seed }),
    };

    if (taskType === 'TEXT_VIDEO') {
      const textToVideoParams: Record<string, unknown> = { text: prompt };

      // Handle optional image input for image-to-video
      if (config.image) {
        const { data, error } = this.loadImageData(config.image);
        if (error) {
          return { error };
        }

        const format = this.detectImageFormat(config.image);
        textToVideoParams.images = [
          {
            format,
            source: { bytes: data },
          },
        ];
      }

      return {
        input: {
          taskType: 'TEXT_VIDEO',
          textToVideoParams,
          videoGenerationConfig,
        },
      };
    }

    if (taskType === 'MULTI_SHOT_AUTOMATED') {
      // Validate prompt length for multi-shot automated (4000 char limit)
      if (prompt.length > 4000) {
        return {
          error: `MULTI_SHOT_AUTOMATED prompt exceeds 4000 character limit. Got: ${prompt.length}`,
        };
      }

      return {
        input: {
          taskType: 'MULTI_SHOT_AUTOMATED',
          multiShotAutomatedParams: { text: prompt },
          videoGenerationConfig,
        },
      };
    }

    if (taskType === 'MULTI_SHOT_MANUAL') {
      if (!config.shots || config.shots.length === 0) {
        return { error: 'MULTI_SHOT_MANUAL requires shots array in config' };
      }

      const shots = config.shots.map((shot) => {
        const shotDef: Record<string, unknown> = { text: shot.text };
        if (shot.image) {
          shotDef.image = shot.image;
        }
        return shotDef;
      });

      return {
        input: {
          taskType: 'MULTI_SHOT_MANUAL',
          multiShotManualParams: { shots },
          videoGenerationConfig,
        },
      };
    }

    return { error: `Unknown task type: ${taskType}` };
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
        error: 'Nova Reel requires s3OutputUri in provider config. Example: s3://my-bucket/videos',
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

    const config: NovaReelVideoOptions = {
      ...this.videoConfig,
      ...(context?.prompt?.config as Partial<NovaReelVideoOptions>),
    };

    const startTime = Date.now();

    // Build model input
    const { input: modelInput, error: buildError } = this.buildModelInput(prompt, config);

    if (buildError || !modelInput) {
      return { error: buildError || 'Failed to build model input' };
    }

    // Start async job
    logger.info(`[Nova Reel] Starting video generation job...`, {
      taskType: config.taskType || 'TEXT_VIDEO',
      durationSeconds: config.durationSeconds || DEFAULT_DURATION_SECONDS,
      s3OutputUri,
    });

    const { response, error: jobError } = await runBedrockVideoJob(
      this,
      {
        label: 'Nova Reel',
        modelInput,
        s3OutputUri,
        pollIntervalMs: config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS,
        maxPollTimeMs: config.maxPollTimeMs || DEFAULT_MAX_POLL_TIME_MS,
      },
      options?.abortSignal,
    );
    if (jobError || !response) {
      return { error: jobError || 'Polling failed' };
    }
    const invocationArn = response.invocationArn;

    options?.abortSignal?.throwIfAborted();

    // Get S3 output location
    const outputS3Uri = response.outputDataConfig?.s3OutputDataConfig?.s3Uri;
    if (!outputS3Uri) {
      return { error: 'No output location in response' };
    }

    // Download and store video (if enabled)
    let blobRef: BlobRef | undefined;
    const outputUrl = `${outputS3Uri}/output.mp4`;

    if (config.downloadFromS3 !== false) {
      const { blobRef: ref, error: downloadError } = await storeBedrockVideo(
        this,
        'Nova Reel',
        outputS3Uri,
        context,
        options?.abortSignal,
      );
      options?.abortSignal?.throwIfAborted();
      if (downloadError) {
        logger.warn(`[Nova Reel] Failed to download video: ${downloadError}. Using S3 URL.`);
      } else {
        blobRef = ref;
      }
    }

    const latencyMs = Date.now() - startTime;
    const durationSeconds = config.durationSeconds || DEFAULT_DURATION_SECONDS;

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
        url: blobRef ? undefined : outputUrl, // Fall back to S3 URL if no blob
        format: 'mp4',
        size: VIDEO_DIMENSION,
        duration: durationSeconds,
        model: this.modelName,
        resolution: VIDEO_DIMENSION,
      },
      metadata: {
        invocationArn,
        model: this.modelName,
        taskType: config.taskType || 'TEXT_VIDEO',
        durationSeconds,
        s3OutputUri: outputS3Uri,
        ...(blobRef && { blobHash: blobRef.hash }),
      },
    };
  }
}
