/**
 * Amazon Nova Reel Video Generation Provider
 *
 * Supports text-to-video and image-to-video generation using AWS Bedrock's
 * async invoke API. Videos are generated in 6-second increments up to 2 minutes.
 */

import * as fs from 'fs';
import * as path from 'path';

import { storeBlob } from '../../blobs';
import logger from '../../logger';
import { ellipsize } from '../../util/text';
import { sleep } from '../../util/time';
import { AwsBedrockGenericProvider } from './base';

import type { BlobRef } from '../../blobs';
import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/providers';
import type { NovaReelInvocationResponse, NovaReelVideoOptions } from './index';

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

  /**
   * Start async video generation job
   */
  private async startVideoGeneration(
    modelInput: object,
    s3OutputUri: string,
  ): Promise<{ invocationArn?: string; error?: string }> {
    try {
      const { BedrockRuntimeClient, StartAsyncInvokeCommand } = await import(
        '@aws-sdk/client-bedrock-runtime'
      );

      const credentials = await this.getCredentials();

      const client = new BedrockRuntimeClient({
        region: this.getRegion(),
        ...(credentials ? { credentials } : {}),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const command = new StartAsyncInvokeCommand({
        modelId: this.modelName,
        modelInput: modelInput as any,
        outputDataConfig: {
          s3OutputDataConfig: {
            s3Uri: s3OutputUri,
          },
        },
      });

      const response = await client.send(command);

      return { invocationArn: response.invocationArn };
    } catch (err) {
      const error = err as { message?: string; name?: string };
      logger.error('[Nova Reel] Failed to start video generation', { error });
      return { error: `Failed to start video generation: ${error.message || String(err)}` };
    }
  }

  /**
   * Poll for job completion
   */
  private async pollForCompletion(
    invocationArn: string,
    pollIntervalMs: number,
    maxPollTimeMs: number,
  ): Promise<{ response?: NovaReelInvocationResponse; error?: string }> {
    const startTime = Date.now();

    try {
      const { BedrockRuntimeClient, GetAsyncInvokeCommand } = await import(
        '@aws-sdk/client-bedrock-runtime'
      );

      const credentials = await this.getCredentials();

      const client = new BedrockRuntimeClient({
        region: this.getRegion(),
        ...(credentials ? { credentials } : {}),
      });

      while (Date.now() - startTime < maxPollTimeMs) {
        const command = new GetAsyncInvokeCommand({ invocationArn });
        const invocation = await client.send(command);

        logger.debug(`[Nova Reel] Job status: ${invocation.status}`, {
          invocationArn,
          elapsedMs: Date.now() - startTime,
        });

        if (invocation.status === 'Completed') {
          return {
            response: {
              invocationArn: invocation.invocationArn || invocationArn,
              status: 'Completed',
              submitTime: invocation.submitTime?.toISOString(),
              endTime: invocation.endTime?.toISOString(),
              outputDataConfig:
                invocation.outputDataConfig as NovaReelInvocationResponse['outputDataConfig'],
            },
          };
        }

        if (invocation.status === 'Failed') {
          return { error: `Video generation failed: ${invocation.failureMessage}` };
        }

        // Still in progress
        await sleep(pollIntervalMs);
      }

      return { error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds` };
    } catch (err) {
      const error = err as { message?: string };
      logger.error('[Nova Reel] Polling error', { error, invocationArn });
      return { error: `Polling error: ${error.message || String(err)}` };
    }
  }

  /**
   * Download video from S3 and store to blob storage
   */
  private async downloadAndStoreVideo(
    s3Uri: string,
  ): Promise<{ blobRef?: BlobRef; error?: string }> {
    try {
      // Parse S3 URI
      const match = s3Uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
      if (!match) {
        return { error: `Invalid S3 URI: ${s3Uri}` };
      }

      const [, bucket, keyPrefix] = match;

      // Download from S3
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const credentials = await this.getCredentials();

      const s3 = new S3Client({
        region: this.getRegion(),
        ...(credentials ? { credentials } : {}),
      });

      // Nova Reel outputs to {s3Uri}/output.mp4
      const videoKey = keyPrefix.endsWith('/')
        ? `${keyPrefix}output.mp4`
        : `${keyPrefix}/output.mp4`;

      logger.debug('[Nova Reel] Downloading video from S3', { bucket, key: videoKey });

      const response = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: videoKey,
        }),
      );

      if (!response.Body) {
        return { error: 'Empty response from S3' };
      }

      const buffer = Buffer.from(await response.Body.transformToByteArray());

      // Store to blob storage
      const { ref } = await storeBlob(buffer, 'video/mp4', {
        kind: 'video',
        location: 'response.video',
      });

      logger.debug(`[Nova Reel] Stored video to blob storage`, { uri: ref.uri, hash: ref.hash });
      return { blobRef: ref };
    } catch (err) {
      const error = err as { message?: string; name?: string };
      logger.error('[Nova Reel] S3 download error', { error, s3Uri });

      // Provide helpful error message for missing S3 dependency
      if (error.name === 'MODULE_NOT_FOUND' || String(err).includes('Cannot find module')) {
        return {
          error:
            'The @aws-sdk/client-s3 package is required for Nova Reel video downloads. Install it with: npm install @aws-sdk/client-s3',
        };
      }

      return { error: `S3 download error: ${error.message || String(err)}` };
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
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

    const { invocationArn, error: startError } = await this.startVideoGeneration(
      modelInput,
      s3OutputUri,
    );

    if (startError || !invocationArn) {
      return { error: startError || 'Failed to start video generation' };
    }

    logger.info(`[Nova Reel] Job started`, { invocationArn });

    // Poll for completion
    const pollIntervalMs = config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const maxPollTimeMs = config.maxPollTimeMs || DEFAULT_MAX_POLL_TIME_MS;

    const { response, error: pollError } = await this.pollForCompletion(
      invocationArn,
      pollIntervalMs,
      maxPollTimeMs,
    );

    if (pollError || !response) {
      return { error: pollError || 'Polling failed' };
    }

    // Get S3 output location
    const outputS3Uri = response.outputDataConfig?.s3OutputDataConfig?.s3Uri;
    if (!outputS3Uri) {
      return { error: 'No output location in response' };
    }

    // Download and store video (if enabled)
    let blobRef: BlobRef | undefined;
    const outputUrl = `${outputS3Uri}/output.mp4`;

    if (config.downloadFromS3 !== false) {
      const { blobRef: ref, error: downloadError } = await this.downloadAndStoreVideo(outputS3Uri);
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
