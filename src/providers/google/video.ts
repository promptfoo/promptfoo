import crypto from 'crypto';
import fs from 'fs';

import { storeBlob } from '../../blobs';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { ellipsize } from '../../util/text';
import { sleep } from '../../util/time';
import { getGoogleClient, loadCredentials, resolveProjectId } from './util';

import type { BlobRef } from '../../blobs';
import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';
import type {
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
    const url = await this.getVertexEndpoint('predictLongRunning');

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

    // Handle reference images (Veo 3.1 only, up to 3)
    // Accepts either string[] (file paths) or object[] with { image, referenceType }
    if (config.referenceImages && config.referenceImages.length > 0) {
      const refs = [];
      for (const ref of config.referenceImages.slice(0, 3)) {
        // Support both string format and object format
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

    // Handle video extension (Veo 3.1 only)
    const extendVideoId = config.extendVideoId || config.sourceVideo;
    if (extendVideoId) {
      instance.video = { operationName: extendVideoId };
    }

    const body = {
      instances: [instance],
    };

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

      const operation = response.data as GoogleVideoOperation;
      return { operation };
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

  /**
   * Poll for video job completion using fetchPredictOperation endpoint
   */
  private async pollOperationStatus(
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

  /**
   * Download video from URI and store to blob storage
   */
  private async downloadVideoToBlob(
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
    // Validate prompt first
    if (!prompt || prompt.trim() === '') {
      return {
        error: 'Prompt is required for video generation',
      };
    }

    // Check for project ID - try to resolve from ADC if not explicitly configured
    let projectId =
      this.config.projectId ||
      getEnvString('GOOGLE_CLOUD_PROJECT') ||
      getEnvString('GOOGLE_PROJECT_ID') ||
      this.env?.GOOGLE_CLOUD_PROJECT ||
      this.env?.GOOGLE_PROJECT_ID;

    // If no explicit project ID, try to resolve from ADC credentials
    if (!projectId) {
      try {
        projectId = await resolveProjectId(this.config, this.env);
      } catch {
        return {
          error:
            'Google Veo video generation requires Vertex AI. Set GOOGLE_CLOUD_PROJECT environment variable or add `projectId` to the provider config, then run "gcloud auth application-default login".',
        };
      }
    }

    const config: GoogleVideoOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const model = config.model || this.modelName;
    const aspectRatio = config.aspectRatio || DEFAULT_ASPECT_RATIO;
    const resolution = config.resolution || DEFAULT_RESOLUTION;
    // Support both 'durationSeconds' and 'duration' (alias)
    const durationSeconds = config.durationSeconds || config.duration || DEFAULT_DURATION;

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

    // Step 3: Store video to blob storage
    let blobRef: BlobRef | undefined;

    // Check for base64 encoded video (new format)
    const base64Video = completedOp.response?.videos?.[0]?.bytesBase64Encoded;
    if (base64Video) {
      logger.debug(`[Google Video] Storing base64 encoded video to blob storage...`);
      const { blobRef: ref, error } = await this.storeBase64VideoToBlob(base64Video);
      if (error) {
        return { error };
      }
      blobRef = ref;
    } else {
      // Fallback to URI format (legacy)
      const videoUri =
        completedOp.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!videoUri) {
        logger.debug(`[Google Video] Response: ${JSON.stringify(completedOp.response)}`);
        return { error: 'No video data in response' };
      }

      const { blobRef: ref, error: downloadError } = await this.downloadVideoToBlob(videoUri);
      if (downloadError) {
        return { error: downloadError };
      }
      blobRef = ref;
    }

    if (!blobRef) {
      return { error: 'Failed to store video' };
    }

    const latencyMs = Date.now() - startTime;

    // Format output with blob URI
    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    const output = `[Video: ${ellipsizedPrompt}](${blobRef.uri})`;

    return {
      output,
      cached: false,
      latencyMs,
      video: {
        id: operationName,
        blobRef,
        url: blobRef.uri, // Expose URI directly for consistent API surface with Sora
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
