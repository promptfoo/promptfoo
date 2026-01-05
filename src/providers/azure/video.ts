/**
 * Azure AI Foundry Video Provider for Sora video generation.
 *
 * This provider enables text-to-video and image-to-video generation
 * using Azure's hosted Sora models.
 *
 * Usage: azure:video:<deployment-name>
 *
 * Environment variables:
 * - AZURE_API_KEY or AZURE_OPENAI_API_KEY
 * - AZURE_API_BASE_URL or AZURE_OPENAI_API_BASE_URL
 *
 * Or use Entra ID authentication with:
 * - AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
 */
import logger from '../../logger';
import { storeMedia } from '../../storage';
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
} from '../video';
import {
  AZURE_SORA_COST_PER_SECOND,
  AZURE_VIDEO_DIMENSIONS,
  AZURE_VIDEO_DURATIONS,
  DEFAULT_AZURE_VIDEO_API_VERSION,
} from './defaults';
import { AzureGenericProvider } from './generic';

import type { MediaStorageRef } from '../../storage/types';
import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type {
  AzureVideoDuration,
  AzureVideoGeneration,
  AzureVideoJob,
  AzureVideoOptions,
  AzureVideoSize,
} from './types';

// =============================================================================
// Constants
// =============================================================================

/** Provider name for logging */
const PROVIDER_NAME = 'Azure Video';

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate Azure video dimensions (width x height combination)
 */
export function validateAzureVideoDimensions(
  width: number,
  height: number,
): { valid: boolean; message?: string } {
  const key = `${width}x${height}` as AzureVideoSize;
  if (!(key in AZURE_VIDEO_DIMENSIONS)) {
    return {
      valid: false,
      message: `Invalid video dimensions "${key}". Valid sizes: ${Object.keys(AZURE_VIDEO_DIMENSIONS).join(', ')}`,
    };
  }
  return { valid: true };
}

/**
 * Validate Azure video duration
 */
export const validateAzureVideoDuration = createValidator(AZURE_VIDEO_DURATIONS, 'video duration');

/**
 * Calculate Azure video generation cost based on duration
 */
export function calculateAzureVideoCost(seconds: number, cached: boolean = false): number {
  if (cached) {
    return 0;
  }
  return AZURE_SORA_COST_PER_SECOND * seconds;
}

// =============================================================================
// AzureVideoProvider
// =============================================================================

/**
 * Azure AI Foundry Video Provider for Sora video generation.
 *
 * Supports:
 * - Text-to-video generation
 * - Image-to-video generation (with inpaint_items)
 *
 * Videos are generated asynchronously via polling, then downloaded
 * to ~/.promptfoo/media/video/ and served via API routes.
 */
export class AzureVideoProvider extends AzureGenericProvider {
  declare config: AzureVideoOptions;
  private providerId?: string;

  constructor(
    deploymentName: string,
    options: { config?: AzureVideoOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(deploymentName, options);
    this.config = options.config || {};
    this.providerId = options.id;
  }

  id(): string {
    return this.providerId || `azure:video:${this.deploymentName}`;
  }

  toString(): string {
    return `[Azure Video Provider ${this.deploymentName}]`;
  }

  /**
   * Create a video generation job
   */
  private async createVideoJob(
    prompt: string,
    config: AzureVideoOptions,
  ): Promise<{ job: AzureVideoJob; error?: string }> {
    await this.ensureInitialized();

    const apiVersion = config.apiVersion || DEFAULT_AZURE_VIDEO_API_VERSION;
    const baseUrl = this.getApiBaseUrl();
    if (!baseUrl) {
      return {
        job: {} as AzureVideoJob,
        error: 'Azure API base URL must be set.',
      };
    }

    const url = `${baseUrl}/openai/v1/video/generations/jobs?api-version=${apiVersion}`;

    const body: Record<string, unknown> = {
      model: 'sora', // Azure always uses 'sora' as model name
      prompt,
      width: config.width || 1280,
      height: config.height || 720,
      n_seconds: config.n_seconds || 5,
      n_variants: config.n_variants || 1,
    };

    // Handle inpainting (image-to-video)
    if (config.inpaint_items) {
      body.inpaint_items = config.inpaint_items;
    }

    try {
      logger.debug(`[${PROVIDER_NAME}] Creating video job`, { url });

      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders,
          ...config.headers,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          (errorData as { error?: { message?: string } }).error?.message ||
          (errorData as { detail?: string }).detail ||
          response.statusText;
        return {
          job: {} as AzureVideoJob,
          error: `API error ${response.status}: ${errorMessage}`,
        };
      }

      const job = (await response.json()) as AzureVideoJob;
      return { job };
    } catch (err: unknown) {
      return {
        job: {} as AzureVideoJob,
        error: `Failed to create video job: ${String(err)}`,
      };
    }
  }

  /**
   * Poll for video job completion
   */
  private async pollVideoStatus(
    jobId: string,
    pollIntervalMs: number,
    maxPollTimeMs: number,
  ): Promise<{ job: AzureVideoJob; error?: string }> {
    const startTime = Date.now();
    const apiVersion = this.config.apiVersion || DEFAULT_AZURE_VIDEO_API_VERSION;
    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/openai/v1/video/generations/jobs/${jobId}?api-version=${apiVersion}`;

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const response = await fetchWithProxy(url, {
          method: 'GET',
          headers: this.authHeaders!,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            (errorData as { error?: { message?: string } }).error?.message || response.statusText;
          return {
            job: {} as AzureVideoJob,
            error: `Status check failed: ${errorMessage}`,
          };
        }

        const job = (await response.json()) as AzureVideoJob;

        logger.debug(`[${PROVIDER_NAME}] Job ${jobId} status: ${job.status}`);

        if (job.status === 'succeeded') {
          return { job };
        }

        if (job.status === 'failed' || job.status === 'cancelled') {
          return {
            job,
            error: job.failure_reason || `Video generation ${job.status}`,
          };
        }

        // Wait before next poll
        await sleep(pollIntervalMs);
      } catch (err: unknown) {
        return {
          job: {} as AzureVideoJob,
          error: `Polling error: ${String(err)}`,
        };
      }
    }

    return {
      job: {} as AzureVideoJob,
      error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds`,
    };
  }

  /**
   * Download video content and store in media storage
   */
  private async downloadVideoContent(
    generationId: string,
    cacheKey: string,
    evalId?: string,
  ): Promise<{ storageRef?: MediaStorageRef; error?: string }> {
    const apiVersion = this.config.apiVersion || DEFAULT_AZURE_VIDEO_API_VERSION;
    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}/openai/v1/video/generations/${generationId}/content/video?api-version=${apiVersion}`;

    try {
      const response = await fetchWithProxy(url, {
        method: 'GET',
        headers: this.authHeaders!,
      });

      if (!response.ok) {
        return {
          error: `Failed to download video: ${response.status} ${response.statusText}`,
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      const { ref } = await storeMedia(buffer, {
        contentType: 'video/mp4',
        mediaType: 'video',
        evalId,
        contentHash: cacheKey,
      });

      logger.debug(`[${PROVIDER_NAME}] Stored video at ${ref.key}`);
      return { storageRef: ref };
    } catch (err: unknown) {
      return {
        error: `Download error: ${String(err)}`,
      };
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    await this.ensureInitialized();

    if (!this.getApiBaseUrl()) {
      throw new Error('Azure API base URL must be set.');
    }

    const config: AzureVideoOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const width = config.width || 1280;
    const height = config.height || 720;
    const seconds = (config.n_seconds || 5) as AzureVideoDuration;
    const evalId = context?.evaluationId;

    // Validate dimensions
    const dimValidation = validateAzureVideoDimensions(width, height);
    if (!dimValidation.valid) {
      return { error: dimValidation.message };
    }

    // Validate duration
    const durValidation = validateAzureVideoDuration(seconds);
    if (!durValidation.valid) {
      return { error: durValidation.message };
    }

    // Generate deterministic cache key from inputs
    const size = `${width}x${height}`;
    const cacheKey = generateVideoCacheKey({
      provider: 'azure',
      prompt,
      model: this.deploymentName,
      size,
      seconds,
      inputReference: null, // Azure uses inpaint_items instead
    });

    // Check for cached video
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
          id: undefined, // No generation ID for cached results
          storageRef: { key: cachedVideoKey },
          url: videoUrl,
          format: 'mp4',
          size,
          duration: seconds,
          model: this.deploymentName,
        },
        metadata: {
          cached: true,
          cacheKey,
          provider: 'azure',
          deploymentName: this.deploymentName,
          width,
          height,
          seconds,
        },
      };
    }

    const startTime = Date.now();

    // Step 1: Create video job
    logger.info(`[${PROVIDER_NAME}] Creating video job for deployment ${this.deploymentName}...`);
    const { job: createdJob, error: createError } = await this.createVideoJob(prompt, {
      ...config,
      width,
      height,
      n_seconds: seconds,
    });

    if (createError) {
      return { error: createError };
    }

    const jobId = createdJob.id;
    logger.info(`[${PROVIDER_NAME}] Video job created: ${jobId}`);

    // Step 2: Poll for completion
    const pollIntervalMs = config.poll_interval_ms || DEFAULT_POLL_INTERVAL_MS;
    const maxPollTimeMs = config.max_poll_time_ms || DEFAULT_MAX_POLL_TIME_MS;

    const { job: completedJob, error: pollError } = await this.pollVideoStatus(
      jobId,
      pollIntervalMs,
      maxPollTimeMs,
    );

    if (pollError) {
      return { error: pollError };
    }

    // Step 3: Download video (Azure returns generations array)
    if (!completedJob.generations || completedJob.generations.length === 0) {
      return { error: 'No video generations returned' };
    }

    const generation: AzureVideoGeneration = completedJob.generations[0];
    logger.debug(`[${PROVIDER_NAME}] Downloading video from generation ${generation.id}...`);

    const { storageRef, error: downloadError } = await this.downloadVideoContent(
      generation.id,
      cacheKey,
      evalId,
    );

    if (downloadError || !storageRef) {
      return { error: downloadError || 'Failed to download video' };
    }

    const latencyMs = Date.now() - startTime;
    const cost = calculateAzureVideoCost(seconds, false);

    // Store cache mapping for future lookups
    storeCacheMapping(cacheKey, storageRef.key, undefined, undefined, PROVIDER_NAME);

    // Build output
    const videoUrl = buildStorageRefUrl(storageRef.key);
    const output = formatVideoOutput(prompt, videoUrl);

    return {
      output,
      cached: false,
      latencyMs,
      cost,
      video: {
        id: generation.id,
        storageRef: { key: storageRef.key },
        url: videoUrl,
        format: 'mp4',
        size,
        duration: seconds,
        model: this.deploymentName,
      },
      metadata: {
        jobId,
        generationId: generation.id,
        cacheKey,
        provider: 'azure',
        deploymentName: this.deploymentName,
        width,
        height,
        seconds,
        storageKey: storageRef.key,
      },
    };
  }
}
