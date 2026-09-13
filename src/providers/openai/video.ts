import { randomUUID } from 'node:crypto';
import fs from 'fs/promises';
import path from 'path';

import OpenAI from 'openai';
import logger from '../../logger';
import { getMediaStorage, storeMedia } from '../../storage';
import { fetchWithProxy } from '../../util/fetch/index';
import { isSecretField, sanitizeUrl } from '../../util/sanitizer';
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
import {
  assertOpenAiApiModel,
  hasSensitiveOpenAiCachePath,
  hasSensitiveOpenAiCacheString,
} from './util';

import type { MediaStorageRef } from '../../storage/types';
import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type {
  OpenAiVideoCreateSize,
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
  'sora-2-2025-10-06': 0.1,
  'sora-2-2025-12-08': 0.1,
  'sora-2-pro': 0.3,
  'sora-2-pro-2025-10-06': 0.3,
};

/**
 * Valid video sizes (aspect ratios) for OpenAI Sora
 */
const VALID_VIDEO_SIZES: readonly OpenAiVideoSize[] = [
  '1280x720',
  '720x1280',
  '1792x1024',
  '1024x1792',
  '1920x1080',
  '1080x1920',
] as const;

/**
 * Valid video durations in seconds for OpenAI Sora
 */
const VALID_VIDEO_DURATIONS: readonly OpenAiVideoDuration[] = [4, 8, 12, 16, 20] as const;

/**
 * Default configuration values
 */
const DEFAULT_SIZE: OpenAiVideoCreateSize = '1280x720';
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

type OpenAiVideoInputReference = { file_id: string } | { image_url: string };

function getImageMimeType(value: string): string {
  const extension = path.extname(value).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg' || value.startsWith('/9j/')) {
    return 'image/jpeg';
  }
  if (extension === '.webp' || value.startsWith('UklGR')) {
    return 'image/webp';
  }
  return 'image/png';
}

async function normalizeInputReference(
  reference: NonNullable<OpenAiVideoOptions['input_reference']>,
): Promise<OpenAiVideoInputReference> {
  if (typeof reference !== 'string') {
    return reference;
  }
  if (/^(?:https?:\/\/|data:)/i.test(reference)) {
    return { image_url: reference };
  }
  if (/^file:\/\//i.test(reference)) {
    const filePath = reference.slice(7);
    const buffer = await fs.readFile(filePath);
    return {
      image_url: `data:${getImageMimeType(filePath)};base64,${buffer.toString('base64')}`,
    };
  }
  return { image_url: `data:${getImageMimeType(reference)};base64,${reference}` };
}

function hasValidInputReference(reference: OpenAiVideoOptions['input_reference']): boolean {
  if (!reference || typeof reference === 'string') {
    return true;
  }

  const candidate = reference as { file_id?: unknown; image_url?: unknown };
  const hasFileId = typeof candidate.file_id === 'string' && candidate.file_id.trim().length > 0;
  const hasImageUrl =
    typeof candidate.image_url === 'string' && candidate.image_url.trim().length > 0;
  return hasFileId !== hasImageUrl;
}

function hasValidCharacters(characters: OpenAiVideoOptions['characters']): boolean {
  return (
    !characters ||
    (Array.isArray(characters) &&
      characters.length <= 2 &&
      characters.every(
        (character) =>
          character && typeof character.id === 'string' && character.id.trim().length > 0,
      ))
  );
}

function hasAuthenticatedInputReference(reference: OpenAiVideoOptions['input_reference']): boolean {
  const imageUrl =
    typeof reference === 'string'
      ? reference
      : reference && 'image_url' in reference
        ? reference.image_url
        : undefined;
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return false;
  }
  try {
    const parsedUrl = new URL(imageUrl);
    const normalizedUrl = parsedUrl.toString();
    return (
      sanitizeUrl(normalizedUrl) !== normalizedUrl ||
      hasSensitiveOpenAiCachePath(decodeURIComponent(parsedUrl.pathname))
    );
  } catch {
    return true;
  }
}

function isSensitiveCacheHeader(key: string): boolean {
  return (
    isSecretField(key) ||
    /(?:authorization|api[-_]?key|token|secret|signature|credential|cookie|password)/i.test(key)
  );
}

function hasSensitiveCacheValue(value: string): boolean {
  return hasSensitiveOpenAiCacheString(value);
}

// =============================================================================
// Validation Functions (using shared validator)
// =============================================================================

/**
 * Validate video size parameter
 */
const validateKnownVideoSize = createValidator(VALID_VIDEO_SIZES, 'video size');

export function validateVideoSize(
  size: OpenAiVideoSize,
  model?: OpenAiVideoModel,
): { valid: boolean; message?: string } {
  const validation = validateKnownVideoSize(size);
  if (!validation.valid) {
    return validation;
  }

  if (model?.startsWith('sora-2') && !model.startsWith('sora-2-pro')) {
    if (size !== '1280x720' && size !== '720x1280') {
      return {
        valid: false,
        message: `Invalid video size "${size}" for ${model}. Valid options: 1280x720, 720x1280`,
      };
    }
  }

  return { valid: true };
}

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
  size: OpenAiVideoSize = DEFAULT_SIZE,
): number {
  if (cached) {
    return 0;
  }
  let costPerSecond = SORA_COSTS[model] || SORA_COSTS['sora-2'];
  if (model.startsWith('sora-2-pro')) {
    if (size === '1792x1024' || size === '1024x1792') {
      costPerSecond = 0.5;
    } else if (size === '1920x1080' || size === '1080x1920') {
      costPerSecond = 0.7;
    }
  }
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

  /**
   * Build authorization headers for API requests
   */
  private getAuthHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    const resolvedHeaders = this.getOpenAiRequestHeaders(customHeaders);
    const hasAuthorizationOverride = Object.keys(resolvedHeaders).some(
      (header) => header.toLowerCase() === 'authorization',
    );
    const apiKey = this.getApiKey();
    return {
      ...(apiKey && !hasAuthorizationOverride ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...resolvedHeaders,
    };
  }

  private createClient(customHeaders?: Record<string, string>) {
    const headers = this.getAuthHeaders(customHeaders);
    for (const header of Object.keys(headers)) {
      if (header.toLowerCase() === 'content-type') {
        delete headers[header];
      }
    }
    return createOpenAiClient({
      apiKey: this.getApiKey(),
      allowMissingApiKey: !this.requiresApiKey(),
      organization: this.getOrganization(),
      baseURL: this.getApiUrl(),
      headers,
      maxRetries: 0,
      fetch: (url, init) => fetchWithProxy(url instanceof URL ? url.toString() : url, init),
    });
  }

  private async createVideoJob(
    prompt: string,
    config: OpenAiVideoOptions,
  ): Promise<{ job: OpenAiVideoJob; error?: string }> {
    const client = this.createClient(config.headers);
    try {
      let job: OpenAiVideoJob;
      if (config.remix_video_id) {
        job = (await client.videos.remix(config.remix_video_id, { prompt })) as OpenAiVideoJob;
      } else {
        const body = {
          model: config.model || this.modelName,
          prompt,
          size: config.size || DEFAULT_SIZE,
          seconds: String(config.seconds || DEFAULT_SECONDS),
          ...(config.characters?.length ? { characters: config.characters } : {}),
          ...(config.input_reference
            ? { input_reference: await normalizeInputReference(config.input_reference) }
            : {}),
        };
        // Reference objects and reusable characters use the JSON API contract.
        // The SDK's generated create helper currently always encodes multipart.
        job =
          config.input_reference || config.characters?.length
            ? await client.post<OpenAiVideoJob>('/videos', { body })
            : ((await client.videos.create(body as OpenAI.VideoCreateParams)) as OpenAiVideoJob);
      }
      return { job };
    } catch (err: unknown) {
      const error = unwrapOpenAiTransportError(err);
      return {
        job: {} as OpenAiVideoJob,
        error:
          error instanceof OpenAI.APIError
            ? `API error ${error.status}: ${error.error?.message ?? error.message}`
            : (error as NodeJS.ErrnoException)?.code === 'ENOENT'
              ? `Input reference file not found: ${String(config.input_reference).slice(7)}`
              : `Failed to create video job: ${String(error)}`,
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
    customHeaders?: Record<string, string>,
  ): Promise<{ job: OpenAiVideoJob; error?: string }> {
    const startTime = Date.now();
    const client = this.createClient(customHeaders);

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
          error:
            err instanceof OpenAI.APIError
              ? `Status check failed: ${err.error?.message ?? err.message}`
              : `Polling error: ${String(unwrapOpenAiTransportError(err))}`,
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
    customHeaders?: Record<string, string>,
  ): Promise<{ storageRef?: MediaStorageRef; error?: string }> {
    const client = this.createClient(customHeaders);

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
        error:
          err instanceof OpenAI.APIError
            ? `Failed to download ${variant}: ${err.status} ${err.error?.message ?? err.message}`
            : `Download error for ${variant}: ${String(unwrapOpenAiTransportError(err))}`,
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
    assertOpenAiApiModel(model, this.getApiUrl());
    const size = (config.size || DEFAULT_SIZE) as OpenAiVideoCreateSize;
    const seconds = config.seconds || DEFAULT_SECONDS;
    const evalId = context?.evaluationId;

    if (!config.remix_video_id) {
      const sizeValidation = validateVideoSize(size, model);
      if (!sizeValidation.valid) {
        return { error: sizeValidation.message };
      }

      const secondsValidation = validateVideoSeconds(seconds);
      if (!secondsValidation.valid) {
        return { error: secondsValidation.message };
      }

      if (!hasValidCharacters(config.characters)) {
        return { error: 'Sora generation accepts at most two characters with non-empty IDs.' };
      }

      if (!hasValidInputReference(config.input_reference)) {
        return { error: 'Sora input_reference must provide exactly one of image_url or file_id.' };
      }
    }

    // Generate deterministic cache key from inputs
    // Note: remix_video_id is excluded from cache key as remixes should always regenerate
    const apiUrl = this.getApiUrl();
    const requestHeaders = this.getAuthHeaders(config.headers);
    let sendsToOpenAiApi = false;
    let hasSensitiveUrlCredentials = false;
    let hasSensitiveUrlPath = false;
    try {
      const parsedApiUrl = new URL(apiUrl);
      const normalizedApiUrl = parsedApiUrl.toString();
      sendsToOpenAiApi = parsedApiUrl.hostname.toLowerCase() === 'api.openai.com';
      hasSensitiveUrlCredentials = sanitizeUrl(normalizedApiUrl) !== normalizedApiUrl;
      hasSensitiveUrlPath = hasSensitiveOpenAiCachePath(decodeURIComponent(parsedApiUrl.pathname));
    } catch {
      hasSensitiveUrlCredentials = true;
      hasSensitiveUrlPath = true;
    }
    const safeCacheHeaders = Object.fromEntries(
      Object.entries(this.getOpenAiRequestHeaders(config.headers))
        .filter(
          ([key, value]) =>
            !isSensitiveCacheHeader(key) &&
            typeof value === 'string' &&
            value.trim().length > 0 &&
            !hasSensitiveCacheValue(value),
        )
        .map(([key, value]) => [key.toLowerCase(), value])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const hasSensitiveHeaderValue = Object.entries(requestHeaders).some(
      ([key, value]) =>
        !isSensitiveCacheHeader(key) && typeof value === 'string' && hasSensitiveCacheValue(value),
    );
    const cacheScope = {
      ...safeCacheHeaders,
      ...(sendsToOpenAiApi ? {} : { 'api-base-url': sanitizeUrl(apiUrl) }),
    };
    const usesAuthenticatedCustomEndpoint =
      !sendsToOpenAiApi &&
      (hasSensitiveUrlCredentials || Object.keys(requestHeaders).some(isSensitiveCacheHeader));
    const hasProjectDiscriminator = Object.keys(safeCacheHeaders).some((key) =>
      /(?:^|[-_])(?:project|tenant|account)(?:[-_]|$)/i.test(key),
    );
    const hasProjectScopedAsset =
      Boolean(config.characters?.length) ||
      Boolean(
        config.input_reference &&
          typeof config.input_reference === 'object' &&
          'file_id' in config.input_reference,
      );
    const canCacheVideo =
      !hasSensitiveCacheValue(prompt) &&
      !hasSensitiveHeaderValue &&
      !hasSensitiveUrlPath &&
      !hasAuthenticatedInputReference(config.input_reference) &&
      !usesAuthenticatedCustomEndpoint &&
      (!hasProjectScopedAsset || hasProjectDiscriminator);
    const cacheKey = generateVideoCacheKey({
      provider: 'openai',
      prompt: canCacheVideo ? prompt : randomUUID(),
      model,
      size,
      seconds,
      inputReference: config.remix_video_id || !canCacheVideo ? null : config.input_reference,
      characters: config.remix_video_id || !canCacheVideo ? undefined : config.characters,
      cacheScope: canCacheVideo ? cacheScope : undefined,
    });

    // Check for cached video (skip for remix operations)
    const cachedVideoKey =
      config.remix_video_id || !canCacheVideo
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

    const { job: completedJob, error: pollError } = await this.pollVideoStatus(
      videoId,
      pollIntervalMs,
      maxPollTimeMs,
      config.headers,
    );

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
      config.headers,
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
        config.headers,
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
        config.headers,
      );
      if (error) {
        logger.warn(`[OpenAI Video] Failed to download spritesheet: ${error}`);
      } else {
        spritesheetRef = storageRef;
      }
    }

    const latencyMs = Date.now() - startTime;
    const completedModel = (completedJob.model || model) as OpenAiVideoModel;
    const completedSize = (completedJob.size || size) as OpenAiVideoSize;
    const parsedSeconds = Number(completedJob.seconds);
    const completedSeconds =
      Number.isFinite(parsedSeconds) && parsedSeconds > 0 ? parsedSeconds : seconds;
    const cost = calculateVideoCost(completedModel, completedSeconds, false, completedSize);

    // Store cache mapping for future lookups
    if (canCacheVideo) {
      await storeCacheMapping(
        cacheKey,
        videoRef.key,
        thumbnailRef?.key,
        spritesheetRef?.key,
        PROVIDER_NAME,
      );
    }

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
        size: completedSize,
        duration: completedSeconds,
        thumbnail: thumbnailUrl,
        spritesheet: spritesheetUrl,
        model: completedModel,
      },
      metadata: {
        soraVideoId: videoId,
        cacheKey,
        model: completedModel,
        size: completedSize,
        seconds: completedSeconds,
        storageKey: videoRef.key,
      },
    };
  }
}
