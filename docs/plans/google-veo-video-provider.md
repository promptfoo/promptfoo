# Plan: Add Google Veo Video Generation Support

## Overview

Add a new `google:video:<model>` provider type to support Google's Veo video generation API (Veo 3.1, Veo 3, Veo 2). This follows the same pattern as the existing `openai:video:<model>` provider but adapts to Google's async operation-based API flow.

---

## API Analysis

### Veo API Endpoints

The Veo API uses long-running operations via the Gemini API:

| Endpoint                             | Method | Description                   |
| ------------------------------------ | ------ | ----------------------------- |
| `/models/{model}:predictLongRunning` | POST   | Create video generation job   |
| `/{operation.name}`                  | GET    | Get operation status/progress |
| `{video.uri}`                        | GET    | Download completed video      |

### Async Operation Flow

```
1. POST /models/veo-3.1-generate-preview:predictLongRunning
   → { name: "operations/xxx", done: false }

2. Poll GET /{operation.name}
   → { done: false, metadata: { progress: 50 } }

3. Poll GET /{operation.name}
   → { done: true, response: { generatedSamples: [...] } }

4. GET {video.uri} with API key
   → Binary MP4 data with audio
```

### Models & Features

| Model                      | Audio  | Resolution              | Duration | Status  |
| -------------------------- | ------ | ----------------------- | -------- | ------- |
| `veo-3.1-generate-preview` | Native | 720p, 1080p             | 4, 6, 8s | Preview |
| `veo-3.1-fast-preview`     | Native | 720p, 1080p             | 4, 6, 8s | Preview |
| `veo-3-generate`           | Native | 720p, 1080p (16:9 only) | 4, 6, 8s | Stable  |
| `veo-3-fast`               | Native | 720p, 1080p (16:9 only) | 4, 6, 8s | Stable  |
| `veo-2-generate`           | Silent | 720p                    | 5, 6, 8s | Stable  |

### Video Specifications

| Parameter          | Veo 3.1         | Veo 3                   | Veo 2           |
| ------------------ | --------------- | ----------------------- | --------------- |
| Aspect Ratios      | 16:9, 9:16      | 16:9, 9:16              | 16:9, 9:16      |
| Resolutions        | 720p, 1080p     | 720p, 1080p (16:9 only) | 720p            |
| Durations          | 4, 6, 8 seconds | 4, 6, 8 seconds         | 5, 6, 8 seconds |
| Frame Rate         | 24fps           | 24fps                   | 24fps           |
| Output Format      | MP4 with audio  | MP4 with audio          | MP4 (silent)    |
| Videos per Request | 1               | 1                       | 1-2             |

### Unique Veo 3.1 Features

1. **Reference Images**: Up to 3 images to guide video content (style, character, product)
2. **Interpolation**: Specify first AND last frame for video generation
3. **Video Extension**: Extend previous Veo videos by 7 seconds (up to 20 times, max 148s total)

### Content Restrictions

- SynthID watermarking applied to all videos
- Person generation controls vary by region (EU/UK/CH/MENA have restrictions)
- Videos stored on server for 2 days only
- Safety filters for content policy

---

## Implementation Plan

### Step 1: Add Video Types to ProviderResponse

**File: `src/types/providers.ts`**

The existing `video` field from the OpenAI implementation can be reused. No changes needed.

### Step 2: Add Google Video Configuration Types

**File: `src/providers/google/types.ts`** (new or extend existing)

```typescript
// =============================================================================
// Video Generation Types (Veo)
// =============================================================================

/**
 * Supported Veo video models
 */
export type GoogleVideoModel =
  | 'veo-3.1-generate-preview'
  | 'veo-3.1-fast-preview'
  | 'veo-3-generate'
  | 'veo-3-fast'
  | 'veo-2-generate';

/**
 * Supported aspect ratios
 */
export type GoogleVideoAspectRatio = '16:9' | '9:16';

/**
 * Supported resolutions
 */
export type GoogleVideoResolution = '720p' | '1080p';

/**
 * Valid video durations by model
 * Veo 3.1/3: 4, 6, 8 seconds
 * Veo 2: 5, 6, 8 seconds
 */
export type GoogleVideoDuration = 4 | 5 | 6 | 8;

/**
 * Person generation control settings
 */
export type GoogleVideoPersonGeneration = 'allow_all' | 'allow_adult' | 'dont_allow';

/**
 * Reference image for guiding video content (Veo 3.1 only)
 */
export interface GoogleVideoReferenceImage {
  /** Base64 encoded image data or file:// path */
  image: string;
  /** Type of reference: 'asset' for style/character/product guidance */
  referenceType: 'asset';
}

/**
 * Configuration options for Google video generation (Veo)
 */
export interface GoogleVideoOptions {
  // Model selection
  model?: GoogleVideoModel;

  // Video parameters
  aspectRatio?: GoogleVideoAspectRatio;
  resolution?: GoogleVideoResolution;
  durationSeconds?: GoogleVideoDuration;

  // Content guidance
  negativePrompt?: string;

  // Image-to-video: first frame
  image?: string; // Base64 or file:// path

  // Interpolation: last frame (Veo 3.1 only, requires image)
  lastFrame?: string; // Base64 or file:// path

  // Reference images (Veo 3.1 only, up to 3)
  referenceImages?: GoogleVideoReferenceImage[];

  // Video extension (Veo 3.1 only)
  extendVideoId?: string; // Previous Veo video operation ID

  // Person generation control
  personGeneration?: GoogleVideoPersonGeneration;

  // Seed for improved (not guaranteed) determinism (Veo 3 only)
  seed?: number;

  // Polling configuration
  pollIntervalMs?: number; // Default: 10000 (10 seconds)
  maxPollTimeMs?: number; // Default: 600000 (10 minutes)

  // API configuration
  apiKey?: string;
  apiHost?: string;
}

/**
 * Veo API operation response
 */
export interface GoogleVideoOperation {
  name: string;
  done: boolean;
  metadata?: {
    progress?: number;
  };
  response?: {
    generateVideoResponse?: {
      generatedSamples: Array<{
        video: {
          uri: string;
        };
      }>;
    };
  };
  error?: {
    code: number;
    message: string;
  };
}
```

### Step 3: Create Video Provider Implementation

**File: `src/providers/google/video.ts`**

```typescript
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../logger';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { fetchWithProxy } from '../../util/fetch/index';
import { ellipsize } from '../../util/text';
import { sleep } from '../../util/time';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  ApiProvider,
} from '../../types/index';
import type {
  GoogleVideoOptions,
  GoogleVideoOperation,
  GoogleVideoModel,
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
  const videoPath = path.join(getVideoOutputDir(), cacheKey, 'video.mp4');
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

function getVideoFilePath(uuid: string): string {
  return path.join(getVideoOutputDir(), uuid, 'video.mp4');
}

export function getVideoApiPath(uuid: string): string {
  return `/api/output/video/${uuid}/video.mp4`;
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

// =============================================================================
// GoogleVideoProvider
// =============================================================================

export class GoogleVideoProvider implements ApiProvider {
  private modelName: string;
  private config: GoogleVideoOptions;
  private providerId?: string;

  constructor(modelName: string, options: { config?: GoogleVideoOptions; id?: string } = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.providerId = options.id;
  }

  id(): string {
    return this.providerId || `google:video:${this.modelName}`;
  }

  toString(): string {
    return `[Google Video Provider ${this.modelName}]`;
  }

  private getApiKey(): string | undefined {
    return this.config.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  }

  private getApiHost(): string {
    return this.config.apiHost || DEFAULT_API_HOST;
  }

  /**
   * Create a new video generation job
   */
  private async createVideoJob(
    prompt: string,
    config: GoogleVideoOptions,
  ): Promise<{ operation: GoogleVideoOperation; error?: string }> {
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
      let imageData = config.image;
      if (config.image.startsWith('file://')) {
        const filePath = config.image.slice(7);
        if (!fs.existsSync(filePath)) {
          return {
            operation: {} as GoogleVideoOperation,
            error: `Image file not found: ${filePath}`,
          };
        }
        imageData = fs.readFileSync(filePath).toString('base64');
      }
      instance.image = {
        imageBytes: imageData,
        mimeType: 'image/png',
      };
    }

    // Handle last frame (interpolation, Veo 3.1 only)
    if (config.lastFrame) {
      let lastFrameData = config.lastFrame;
      if (config.lastFrame.startsWith('file://')) {
        const filePath = config.lastFrame.slice(7);
        if (!fs.existsSync(filePath)) {
          return {
            operation: {} as GoogleVideoOperation,
            error: `Last frame file not found: ${filePath}`,
          };
        }
        lastFrameData = fs.readFileSync(filePath).toString('base64');
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
        let imageData = ref.image;
        if (ref.image.startsWith('file://')) {
          const filePath = ref.image.slice(7);
          if (!fs.existsSync(filePath)) {
            return {
              operation: {} as GoogleVideoOperation,
              error: `Reference image file not found: ${filePath}`,
            };
          }
          imageData = fs.readFileSync(filePath).toString('base64');
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
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          (errorData as { error?: { message?: string } }).error?.message || response.statusText;
        return {
          operation: {} as GoogleVideoOperation,
          error: `API error ${response.status}: ${errorMessage}`,
        };
      }

      const operation = (await response.json()) as GoogleVideoOperation;
      return { operation };
    } catch (err) {
      return {
        operation: {} as GoogleVideoOperation,
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
  ): Promise<{ operation: GoogleVideoOperation; error?: string }> {
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
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            (errorData as { error?: { message?: string } }).error?.message || response.statusText;
          return {
            operation: {} as GoogleVideoOperation,
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
              operation,
              error: `Video generation failed: ${operation.error.message}`,
            };
          }
          return { operation };
        }

        await sleep(pollIntervalMs);
      } catch (err) {
        return {
          operation: {} as GoogleVideoOperation,
          error: `Polling error: ${String(err)}`,
        };
      }
    }

    return {
      operation: {} as GoogleVideoOperation,
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

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Google API key is not set. Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
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
          size: `${aspectRatio === '16:9' ? resolution : resolution.replace('p', '')}`,
          duration: durationSeconds,
          model,
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

    if (createError) {
      return { error: createError };
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

    if (pollError) {
      return { error: pollError };
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
        size: `${resolution}`,
        duration: durationSeconds,
        model,
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
```

### Step 4: Register Provider in Registry

**File: `src/providers/registry.ts`**

Add import:

```typescript
import { GoogleVideoProvider } from './google/video';
```

Add case in Google handler:

```typescript
if (modelType === 'video') {
  return new GoogleVideoProvider(modelName || 'veo-3.1-generate-preview', providerOptions);
}
```

Update error message to include video option.

### Step 5: Reuse Existing Server Route

The existing `/api/output/video/` route from the OpenAI implementation will work for Google videos as well since they use the same output directory structure.

### Step 6: UI Support

The existing video playback UI from the OpenAI implementation will work for Google videos since they share the same `video` response structure.

### Step 7: Add Tests

**File: `test/providers/google/video.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import {
  GoogleVideoProvider,
  generateVideoCacheKey,
  checkVideoCache,
  getVideoApiPath,
  validateAspectRatio,
  validateDuration,
} from '../../../src/providers/google/video';

// Mock setup similar to OpenAI video tests...

describe('GoogleVideoProvider', () => {
  describe('validateAspectRatio', () => {
    it('should accept 16:9', () => {
      expect(validateAspectRatio('16:9')).toEqual({ valid: true });
    });

    it('should accept 9:16', () => {
      expect(validateAspectRatio('9:16')).toEqual({ valid: true });
    });

    it('should reject invalid ratio', () => {
      const result = validateAspectRatio('4:3');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDuration', () => {
    it('should accept 4, 6, 8 for Veo 3', () => {
      expect(validateDuration('veo-3.1-generate-preview', 4)).toEqual({ valid: true });
      expect(validateDuration('veo-3.1-generate-preview', 6)).toEqual({ valid: true });
      expect(validateDuration('veo-3.1-generate-preview', 8)).toEqual({ valid: true });
    });

    it('should accept 5, 6, 8 for Veo 2', () => {
      expect(validateDuration('veo-2-generate', 5)).toEqual({ valid: true });
      expect(validateDuration('veo-2-generate', 6)).toEqual({ valid: true });
      expect(validateDuration('veo-2-generate', 8)).toEqual({ valid: true });
    });

    it('should reject 5 for Veo 3', () => {
      const result = validateDuration('veo-3.1-generate-preview', 5);
      expect(result.valid).toBe(false);
    });

    it('should reject 4 for Veo 2', () => {
      const result = validateDuration('veo-2-generate', 4);
      expect(result.valid).toBe(false);
    });
  });

  describe('generateVideoCacheKey', () => {
    it('should generate deterministic key', () => {
      const key1 = generateVideoCacheKey('prompt', 'veo-3.1-generate-preview', '16:9', '720p', 8);
      const key2 = generateVideoCacheKey('prompt', 'veo-3.1-generate-preview', '16:9', '720p', 8);
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different prompts', () => {
      const key1 = generateVideoCacheKey('prompt1', 'veo-3.1-generate-preview', '16:9', '720p', 8);
      const key2 = generateVideoCacheKey('prompt2', 'veo-3.1-generate-preview', '16:9', '720p', 8);
      expect(key1).not.toBe(key2);
    });
  });

  describe('callApi', () => {
    // Tests for:
    // - Successful video generation
    // - Cache hit behavior
    // - Image-to-video (first frame)
    // - Interpolation (first + last frame)
    // - Reference images
    // - Video extension
    // - Error handling
    // - Polling timeout
  });

  describe('Veo 3.1 specific features', () => {
    it('should handle reference images', async () => {
      // Test reference images feature
    });

    it('should handle interpolation (first + last frame)', async () => {
      // Test interpolation feature
    });

    it('should handle video extension', async () => {
      // Test video extension feature
    });
  });
});
```

### Step 8: Add Documentation

**File: `site/docs/providers/google.md`** (add section)

````markdown
## Video Generation (Veo)

Google supports video generation via `google:video:<model>` using the Veo API. Veo 3+ models
include native audio generation.

### Supported Models

| Model                      | Audio  | Resolution  | Duration | Status  |
| -------------------------- | ------ | ----------- | -------- | ------- |
| `veo-3.1-generate-preview` | Native | 720p, 1080p | 4-8s     | Preview |
| `veo-3.1-fast-preview`     | Native | 720p, 1080p | 4-8s     | Preview |
| `veo-3-generate`           | Native | 720p, 1080p | 4-8s     | Stable  |
| `veo-3-fast`               | Native | 720p, 1080p | 4-8s     | Stable  |
| `veo-2-generate`           | Silent | 720p        | 5-8s     | Stable  |

### Basic Usage

```yaml title="promptfooconfig.yaml"
providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      aspectRatio: '16:9'
      resolution: '720p'
      durationSeconds: 8
```
````

### Configuration Options

| Parameter          | Description                    | Default     | Options                                  |
| ------------------ | ------------------------------ | ----------- | ---------------------------------------- |
| `aspectRatio`      | Video aspect ratio             | `16:9`      | `16:9`, `9:16`                           |
| `resolution`       | Output resolution              | `720p`      | `720p`, `1080p`                          |
| `durationSeconds`  | Video length                   | `8`         | 4, 6, 8 (Veo 3); 5, 6, 8 (Veo 2)         |
| `negativePrompt`   | What to avoid                  | -           | Text description                         |
| `image`            | First frame image              | -           | Base64 or `file://path`                  |
| `lastFrame`        | Last frame (Veo 3.1)           | -           | Base64 or `file://path`                  |
| `referenceImages`  | Style/content guides (Veo 3.1) | -           | Array of up to 3 images                  |
| `personGeneration` | Person generation control      | `allow_all` | `allow_all`, `allow_adult`, `dont_allow` |
| `pollIntervalMs`   | Status check interval          | `10000`     | Any number                               |
| `maxPollTimeMs`    | Max wait time                  | `600000`    | Any number                               |

### Image-to-Video

Use an image as the first frame:

```yaml
providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      image: file://./first-frame.png
      durationSeconds: 8
```

### Interpolation (Veo 3.1)

Generate a video that transitions from a first frame to a last frame:

```yaml
providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      image: file://./start.png
      lastFrame: file://./end.png
      durationSeconds: 8
```

### Reference Images (Veo 3.1)

Use up to 3 reference images to guide video style and content:

```yaml
providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      referenceImages:
        - image: file://./character.png
          referenceType: asset
        - image: file://./style.png
          referenceType: asset
```

### Audio Generation

Veo 3+ models natively generate audio. Use dialogue in quotes and describe sound effects:

```yaml
prompts:
  - |
    A close-up of a person saying "Hello, world!" with birds chirping
    in the background and wind rustling through leaves.
```

### Example

```yaml title="promptfooconfig.yaml"
description: Google Veo video generation

prompts:
  - 'A cinematic shot of: {{scene}}'

providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      aspectRatio: '16:9'
      resolution: '720p'
      durationSeconds: 8
  - id: google:video:veo-3-fast
    config:
      aspectRatio: '16:9'
      resolution: '720p'
      durationSeconds: 4

tests:
  - vars:
      scene: a golden retriever running through a field at sunset
  - vars:
      scene: waves crashing on a rocky coastline with seagulls flying overhead
```

````

### Step 9: Create Example

**File: `examples/google-video/promptfooconfig.yaml`**

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Google Veo video generation

prompts:
  - 'A cinematic shot of: {{scene}}'

providers:
  # Veo 3.1 - Latest preview with native audio ($X.XX/second)
  - id: google:video:veo-3.1-generate-preview
    config:
      aspectRatio: '16:9'
      resolution: '720p'
      durationSeconds: 4

  # Veo 3 Fast - Optimized for speed
  - id: google:video:veo-3-fast
    config:
      aspectRatio: '16:9'
      resolution: '720p'
      durationSeconds: 4

tests:
  - vars:
      scene: a cat stretching on a sunny windowsill
  - vars:
      scene: a coffee cup with steam rising, soft morning light
  - vars:
      scene: autumn leaves falling in a peaceful forest path
  - vars:
      scene: a hummingbird hovering near a flower in slow motion
````

**File: `examples/google-video/README.md`**

````markdown
# google-video (Google Veo Video Generation)

This example demonstrates how to use Google's Veo video generation models with Promptfoo.

## Setup

Initialize this example:

```bash
npx promptfoo@latest init --example google-video
```
````

Set your Google API key:

```bash
export GOOGLE_API_KEY=your_api_key_here
# or
export GEMINI_API_KEY=your_api_key_here
```

## Usage

Run the evaluation:

```bash
npx promptfoo@latest eval
```

View results in the web UI:

```bash
npx promptfoo@latest view
```

## Models

| Model                    | Description              | Audio  |
| ------------------------ | ------------------------ | ------ |
| veo-3.1-generate-preview | Latest with all features | Native |
| veo-3.1-fast-preview     | Speed optimized          | Native |
| veo-3-generate           | Stable release           | Native |
| veo-3-fast               | Fast, stable             | Native |
| veo-2-generate           | Previous generation      | Silent |

## Configuration Options

| Parameter         | Description                            | Default |
| ----------------- | -------------------------------------- | ------- |
| `aspectRatio`     | `16:9` or `9:16`                       | `16:9`  |
| `resolution`      | `720p` or `1080p`                      | `720p`  |
| `durationSeconds` | 4, 6, or 8 (Veo 3); 5, 6, or 8 (Veo 2) | `8`     |
| `negativePrompt`  | What to avoid                          | -       |
| `image`           | First frame image                      | -       |
| `lastFrame`       | Last frame (interpolation)             | -       |
| `referenceImages` | Up to 3 style/content guides           | -       |

## Notes

- Video generation can take 11 seconds to 6 minutes
- Videos are cached to avoid regeneration
- Veo 3+ includes native audio generation
- Videos are watermarked with SynthID

````

---

## Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `src/providers/google/types.ts` | Modify | Add Veo video-related type definitions |
| `src/providers/google/video.ts` | **Create** | Main Google video provider implementation |
| `src/providers/registry.ts` | Modify | Register `google:video:` provider |
| `test/providers/google/video.test.ts` | **Create** | Unit tests |
| `site/docs/providers/google.md` | Modify | Add Veo documentation section |
| `examples/google-video/promptfooconfig.yaml` | **Create** | Example config |
| `examples/google-video/README.md` | **Create** | Example readme |

---

## Caching Strategy

Identical to the OpenAI video provider:

1. Generate deterministic cache key from prompt, model, aspectRatio, resolution, durationSeconds, image, negativePrompt
2. Check if video exists at `~/.promptfoo/output/video/{cacheKey}/video.mp4`
3. If cached, return immediately with `cached: true`, `cost: 0`, `latencyMs: 0`
4. Video extension operations skip caching (use random UUID)

---

## Testing Strategy

### Unit Tests (Mocked)
- Operation creation success/failure
- Polling logic (done: true/false, error handling)
- Video download success/failure
- Aspect ratio validation
- Duration validation (model-specific)
- Caching behavior
- Image-to-video (first frame)
- Interpolation (first + last frame)
- Reference images (Veo 3.1)
- Video extension (Veo 3.1)

### Manual Testing
```bash
npm run build
npm run local -- eval -c examples/google-video/promptfooconfig.yaml --env-file .env --no-cache
npm run dev  # View results at http://localhost:5173
````

---

## Key Differences from OpenAI Sora

| Aspect           | OpenAI Sora              | Google Veo                   |
| ---------------- | ------------------------ | ---------------------------- |
| API Style        | `/videos` REST endpoints | Long-running operations      |
| Authentication   | Bearer token             | x-goog-api-key header        |
| Audio            | Not mentioned            | Native in Veo 3+             |
| Reference Images | Not supported            | Up to 3 (Veo 3.1)            |
| Interpolation    | Not supported            | First + last frame (Veo 3.1) |
| Video Extension  | Not mentioned            | Up to 148s total (Veo 3.1)   |
| Download         | Direct content endpoint  | URI with API key             |
| Thumbnails       | Separate download        | Not provided                 |
| Spritesheets     | Separate download        | Not provided                 |

---

## Implementation Order

1. **Types first** - Add video types to `google/types.ts`
2. **Provider implementation** - Create `video.ts` with caching
3. **Registry** - Register the new provider
4. **Tests** - Write comprehensive unit tests
5. **Documentation** - Update docs and create example
6. **Manual testing** - End-to-end verification
