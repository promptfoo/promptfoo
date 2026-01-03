# Azure Sora Video Provider Implementation Plan

## Overview

Add support for Azure AI Foundry's Sora video generation API to promptfoo. This enables users to generate videos using Azure-hosted Sora models with the same unified interface as the OpenAI Sora provider.

**Provider syntax:** `azure:video:<deployment-name>`

## Background Research

### API Differences Between OpenAI and Azure

| Aspect | OpenAI Direct API | Azure AI Foundry |
|--------|-------------------|------------------|
| **Base URL** | `https://api.openai.com/v1/videos` | `https://{resource}.cognitiveservices.azure.com/openai/v1/video/generations/jobs?api-version=preview` |
| **Auth Header** | `Authorization: Bearer $OPENAI_API_KEY` | `api-key: $AZURE_API_KEY` or `Authorization: Bearer $ENTRA_TOKEN` |
| **Create Job** | `POST /videos` | `POST /openai/v1/video/generations/jobs?api-version=preview` |
| **Check Status** | `GET /videos/{id}` | `GET /openai/v1/video/generations/jobs/{id}?api-version=preview` |
| **Download Video** | `GET /videos/{id}/content` | `GET /openai/v1/video/generations/{generation_id}/content/video?api-version=preview` |
| **Model Parameter** | `model: "sora-2"` | `model: "sora"` (always "sora", not the deployment name) |
| **Response Structure** | `{ id, status, progress, ... }` | `{ id, status, generations: [{ id: generation_id }], ... }` |
| **Regions** | Global | `eastus2`, `swedencentral` |

### Request/Response Format Differences

**OpenAI Create Request:**
```json
{
  "model": "sora-2",
  "prompt": "A cat playing piano",
  "size": "1280x720",
  "seconds": "8"
}
```

**Azure Create Request:**
```json
{
  "model": "sora",
  "prompt": "A cat playing piano",
  "width": 1280,
  "height": 720,
  "n_seconds": 5
}
```

**OpenAI Status Response:**
```json
{
  "id": "video_abc123",
  "status": "completed",
  "progress": 100
}
```

**Azure Status Response:**
```json
{
  "id": "task_abc123",
  "status": "succeeded",
  "generations": [{
    "id": "gen_xyz789",
    "width": 1280,
    "height": 720
  }]
}
```

## Implementation Architecture

### Option A: Extend OpenAiVideoProvider (Recommended)

Similar to how `AzureChatCompletionProvider` extends patterns from OpenAI but with Azure-specific auth and endpoints. This approach:

- Reuses video caching, storage, and output formatting logic
- Keeps Azure-specific code isolated
- Follows existing codebase patterns

### Option B: Create Standalone AzureVideoProvider

Create a completely independent provider extending `AzureGenericProvider`. More code duplication but cleaner separation.

**Recommendation:** Option A - Create `AzureVideoProvider` that extends `AzureGenericProvider` but reuses utility functions from the OpenAI video provider.

---

## Implementation Steps

### Phase 1: Types and Configuration

#### 1.1 Add Azure Video Types (`src/providers/azure/types.ts`)

```typescript
// Add after existing types

/**
 * Azure-specific video generation options
 */
export interface AzureVideoOptions extends AzureCompletionOptions {
  // Video parameters (Azure uses different names than OpenAI)
  width?: number;        // 480, 720, 854, 1080, 1280, 1920
  height?: number;       // 480, 720, 1080
  n_seconds?: number;    // 5, 10, 15, 20
  n_variants?: number;   // Number of video variants to generate

  // Image-to-video inpainting
  inpaint_items?: AzureVideoInpaintItem[];

  // Polling configuration
  poll_interval_ms?: number;  // Default: 10000
  max_poll_time_ms?: number;  // Default: 600000

  // Output options
  download_thumbnail?: boolean;
}

export interface AzureVideoInpaintItem {
  frame_index: number;
  type: 'image' | 'video';
  file_name: string;
  crop_bounds?: {
    left_fraction: number;
    top_fraction: number;
    right_fraction: number;
    bottom_fraction: number;
  };
}

/**
 * Azure video job response structure
 */
export interface AzureVideoJob {
  object: 'video.generation.job';
  id: string;
  status: 'queued' | 'preprocessing' | 'running' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  created_at: number;
  finished_at: number | null;
  expires_at: number | null;
  generations: AzureVideoGeneration[];
  prompt: string;
  model: string;
  n_variants: number;
  n_seconds: number;
  height: number;
  width: number;
  inpaint_items: AzureVideoInpaintItem[] | null;
  failure_reason: string | null;
}

export interface AzureVideoGeneration {
  object: 'video.generation';
  id: string;
  job_id: string;
  created_at: number;
  width: number;
  height: number;
  n_seconds: number;
  prompt: string;
}
```

#### 1.2 Add Azure Video Constants (`src/providers/azure/defaults.ts`)

```typescript
// Add to existing file

export const DEFAULT_AZURE_VIDEO_API_VERSION = 'preview';

// Valid Azure Sora video dimensions
export const AZURE_VIDEO_DIMENSIONS = {
  '480x480': { width: 480, height: 480 },
  '854x480': { width: 854, height: 480 },
  '720x720': { width: 720, height: 720 },
  '1280x720': { width: 1280, height: 720 },
  '1080x1080': { width: 1080, height: 1080 },
  '1920x1080': { width: 1920, height: 1080 },
} as const;

// Valid Azure Sora durations
export const AZURE_VIDEO_DURATIONS = [5, 10, 15, 20] as const;

// Azure Sora cost per second (estimate - verify with Azure pricing)
export const AZURE_SORA_COST_PER_SECOND = 0.10;
```

---

### Phase 2: Core Provider Implementation

#### 2.1 Create AzureVideoProvider (`src/providers/azure/video.ts`)

```typescript
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import logger from '../../logger';
import { getMediaStorage, storeMedia } from '../../storage';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { fetchWithProxy } from '../../util/fetch/index';
import { ellipsize } from '../../util/text';
import { sleep } from '../../util/time';
import { AzureGenericProvider } from './generic';
import {
  DEFAULT_AZURE_VIDEO_API_VERSION,
  AZURE_VIDEO_DIMENSIONS,
  AZURE_VIDEO_DURATIONS,
  AZURE_SORA_COST_PER_SECOND,
} from './defaults';

import type { MediaStorageRef } from '../../storage/types';
import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { AzureVideoOptions, AzureVideoJob, AzureVideoGeneration } from './types';

// =============================================================================
// Constants
// =============================================================================

const MEDIA_DIR = 'media';
const CACHE_DIR = 'video/_cache';
const DEFAULT_POLL_INTERVAL_MS = 10000;
const DEFAULT_MAX_POLL_TIME_MS = 600000;

// =============================================================================
// Cache Utilities (reuse pattern from OpenAI video provider)
// =============================================================================

function getCacheMappingPath(cacheKey: string): string {
  const basePath = path.join(getConfigDirectoryPath(true), MEDIA_DIR);
  const cacheDir = path.join(basePath, CACHE_DIR);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, `${cacheKey}.json`);
}

export function generateVideoCacheKey(
  prompt: string,
  deploymentName: string,
  width: number,
  height: number,
  seconds: number,
): string {
  const hashInput = JSON.stringify({
    provider: 'azure',
    prompt,
    deploymentName,
    width,
    height,
    seconds,
  });
  return crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
}

export async function checkVideoCache(cacheKey: string): Promise<string | null> {
  const mappingPath = getCacheMappingPath(cacheKey);
  if (!fs.existsSync(mappingPath)) {
    return null;
  }
  try {
    const mappingData = fs.readFileSync(mappingPath, 'utf8');
    const mapping = JSON.parse(mappingData);
    if (mapping.videoKey) {
      const storage = getMediaStorage();
      if (await storage.exists(mapping.videoKey)) {
        return mapping.videoKey;
      }
    }
  } catch (err) {
    logger.debug(`[Azure Video] Cache mapping read failed: ${err}`);
  }
  return null;
}

function storeCacheMapping(cacheKey: string, videoKey: string): void {
  const mapping = {
    videoKey,
    createdAt: new Date().toISOString(),
  };
  const mappingPath = getCacheMappingPath(cacheKey);
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');
  logger.debug(`[Azure Video] Stored cache mapping at ${mappingPath}`);
}

// =============================================================================
// Validation
// =============================================================================

export function validateAzureVideoDimensions(
  width: number,
  height: number,
): { valid: boolean; message?: string } {
  const key = `${width}x${height}`;
  if (!(key in AZURE_VIDEO_DIMENSIONS)) {
    return {
      valid: false,
      message: `Invalid video dimensions "${key}". Valid sizes: ${Object.keys(AZURE_VIDEO_DIMENSIONS).join(', ')}`,
    };
  }
  return { valid: true };
}

export function validateAzureVideoDuration(seconds: number): { valid: boolean; message?: string } {
  if (!AZURE_VIDEO_DURATIONS.includes(seconds as any)) {
    return {
      valid: false,
      message: `Invalid video duration "${seconds}" seconds. Valid durations: ${AZURE_VIDEO_DURATIONS.join(', ')} seconds`,
    };
  }
  return { valid: true };
}

// =============================================================================
// AzureVideoProvider
// =============================================================================

/**
 * Azure AI Foundry Video Provider for Sora video generation.
 *
 * Supports text-to-video and image-to-video generation via Azure's
 * hosted Sora models.
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
export class AzureVideoProvider extends AzureGenericProvider {
  config: AzureVideoOptions;
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
   * Get the video generation API base URL
   */
  private getVideoApiUrl(): string {
    const baseUrl = this.getApiBaseUrl();
    if (!baseUrl) {
      throw new Error('Azure API base URL must be set.');
    }
    const apiVersion = this.config.apiVersion || DEFAULT_AZURE_VIDEO_API_VERSION;
    return `${baseUrl}/openai/v1/video/generations`;
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
    const url = `${this.getApiBaseUrl()}/openai/v1/video/generations/jobs?api-version=${apiVersion}`;

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
      logger.debug('[Azure Video] Creating video job', { url });

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
          (errorData as any).error?.message ||
          (errorData as any).detail ||
          response.statusText;
        return {
          job: {} as AzureVideoJob,
          error: `API error ${response.status}: ${errorMessage}`,
        };
      }

      const job = (await response.json()) as AzureVideoJob;
      return { job };
    } catch (err) {
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
    const url = `${this.getApiBaseUrl()}/openai/v1/video/generations/jobs/${jobId}?api-version=${apiVersion}`;

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const response = await fetchWithProxy(url, {
          method: 'GET',
          headers: this.authHeaders!,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return {
            job: {} as AzureVideoJob,
            error: `Status check failed: ${(errorData as any).error?.message || response.statusText}`,
          };
        }

        const job = (await response.json()) as AzureVideoJob;

        logger.debug(`[Azure Video] Job ${jobId} status: ${job.status}`);

        if (job.status === 'succeeded') {
          return { job };
        }

        if (job.status === 'failed' || job.status === 'cancelled') {
          return {
            job,
            error: job.failure_reason || `Video generation ${job.status}`,
          };
        }

        await sleep(pollIntervalMs);
      } catch (err) {
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
    const url = `${this.getApiBaseUrl()}/openai/v1/video/generations/${generationId}/content/video?api-version=${apiVersion}`;

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

      logger.debug(`[Azure Video] Stored video at ${ref.key}`);
      return { storageRef: ref };
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
    const seconds = config.n_seconds || 5;
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

    // Generate cache key
    const cacheKey = generateVideoCacheKey(prompt, this.deploymentName, width, height, seconds);

    // Check cache
    const cachedVideoKey = await checkVideoCache(cacheKey);
    if (cachedVideoKey) {
      logger.info(`[Azure Video] Cache hit for video: ${cacheKey}`);
      const videoUrl = `storageRef:${cachedVideoKey}`;
      const sanitizedPrompt = prompt.replace(/\r?\n|\r/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')');
      const output = `[Video: ${ellipsize(sanitizedPrompt, 50)}](${videoUrl})`;

      return {
        output,
        cached: true,
        latencyMs: 0,
        cost: 0,
        video: {
          storageRef: { key: cachedVideoKey },
          url: videoUrl,
          format: 'mp4',
          size: `${width}x${height}`,
          duration: seconds,
          model: this.deploymentName,
        },
        metadata: {
          cached: true,
          cacheKey,
          provider: 'azure',
          deploymentName: this.deploymentName,
        },
      };
    }

    const startTime = Date.now();

    // Step 1: Create video job
    logger.info(`[Azure Video] Creating video job for deployment ${this.deploymentName}...`);
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
    logger.info(`[Azure Video] Video job created: ${jobId}`);

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

    const generation = completedJob.generations[0];
    logger.debug(`[Azure Video] Downloading video from generation ${generation.id}...`);

    const { storageRef, error: downloadError } = await this.downloadVideoContent(
      generation.id,
      cacheKey,
      evalId,
    );

    if (downloadError || !storageRef) {
      return { error: downloadError || 'Failed to download video' };
    }

    const latencyMs = Date.now() - startTime;
    const cost = AZURE_SORA_COST_PER_SECOND * seconds;

    // Store cache mapping
    storeCacheMapping(cacheKey, storageRef.key);

    // Build output
    const videoUrl = `storageRef:${storageRef.key}`;
    const sanitizedPrompt = prompt.replace(/\r?\n|\r/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')');
    const output = `[Video: ${ellipsize(sanitizedPrompt, 50)}](${videoUrl})`;

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
        size: `${width}x${height}`,
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
      },
    };
  }
}
```

---

### Phase 3: Registry Integration

#### 3.1 Update Provider Registry (`src/providers/registry.ts`)

Add import at top:
```typescript
import { AzureVideoProvider } from './azure/video';
```

Update the Azure provider handler (around line 286-332):
```typescript
{
  test: (providerPath: string) =>
    providerPath.startsWith('azure:') ||
    providerPath.startsWith('azureopenai:') ||
    providerPath === 'azure:moderation',
  create: async (
    providerPath: string,
    providerOptions: ProviderOptions,
    _context: LoadApiProviderContext,
  ) => {
    // Handle azure:moderation directly
    if (providerPath === 'azure:moderation') {
      const { deploymentName, modelName } = providerOptions.config || {};
      return new AzureModerationProvider(
        deploymentName || modelName || 'text-content-safety',
        providerOptions,
      );
    }

    // Handle other Azure providers
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const deploymentName = splits.slice(2).join(':');

    if (modelType === 'chat') {
      return new AzureChatCompletionProvider(deploymentName, providerOptions);
    }
    if (modelType === 'assistant') {
      return new AzureAssistantProvider(deploymentName, providerOptions);
    }
    if (modelType === 'embedding') {
      return new AzureEmbeddingProvider(deploymentName, providerOptions);
    }
    if (modelType === 'completion') {
      return new AzureCompletionProvider(deploymentName, providerOptions);
    }
    if (modelType === 'responses') {
      return new AzureResponsesProvider(deploymentName || 'gpt-4.1-2025-04-14', providerOptions);
    }
    // NEW: Video provider
    if (modelType === 'video') {
      return new AzureVideoProvider(deploymentName || 'sora', providerOptions);
    }
    throw new Error(
      `Unknown Azure model type: ${modelType}. Use one of the following providers: azure:chat:<deployment>, azure:assistant:<id>, azure:completion:<deployment>, azure:moderation:<deployment>, azure:responses:<deployment>, azure:video:<deployment>`,
    );
  },
},
```

---

### Phase 4: Testing

#### 4.1 Create Unit Tests (`test/providers/azure/video.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AzureVideoProvider } from '../../../src/providers/azure/video';

// Mock fetch
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

// Mock storage
vi.mock('../../../src/storage', () => ({
  getMediaStorage: vi.fn(() => ({
    exists: vi.fn().mockResolvedValue(false),
  })),
  storeMedia: vi.fn().mockResolvedValue({
    ref: { key: 'video/test-video.mp4' },
  }),
}));

describe('AzureVideoProvider', () => {
  let provider: AzureVideoProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AzureVideoProvider('sora', {
      config: {
        apiBaseUrl: 'https://test-resource.cognitiveservices.azure.com',
        apiKey: 'test-api-key',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with deployment name', () => {
      expect(provider.id()).toBe('azure:video:sora');
    });

    it('should use custom provider ID if specified', () => {
      const customProvider = new AzureVideoProvider('sora', {
        id: 'my-custom-id',
        config: { apiBaseUrl: 'https://test.azure.com', apiKey: 'key' },
      });
      expect(customProvider.id()).toBe('my-custom-id');
    });
  });

  describe('callApi', () => {
    it('should create and poll video job successfully', async () => {
      const { fetchWithProxy } = await import('../../../src/util/fetch/index');

      // Mock job creation
      (fetchWithProxy as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: 'task_123',
            status: 'queued',
            generations: [],
          }),
        })
        // Mock status polling - queued
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: 'task_123',
            status: 'succeeded',
            generations: [{
              id: 'gen_456',
              width: 1280,
              height: 720,
              n_seconds: 5,
            }],
          }),
        })
        // Mock video download
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
        });

      const result = await provider.callApi('A cat playing piano');

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('[Video:');
      expect(result.video).toBeDefined();
      expect(result.video?.format).toBe('mp4');
    });

    it('should handle API errors gracefully', async () => {
      const { fetchWithProxy } = await import('../../../src/util/fetch/index');

      (fetchWithProxy as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () => Promise.resolve({
          error: { message: 'Rate limit exceeded' },
        }),
      });

      const result = await provider.callApi('A cat playing piano');

      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should validate video dimensions', async () => {
      provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'key',
          width: 999,
          height: 999,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Invalid video dimensions');
    });

    it('should validate video duration', async () => {
      provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'key',
          n_seconds: 7,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Invalid video duration');
    });
  });

  describe('authentication', () => {
    it('should use api-key header when API key is provided', async () => {
      const { fetchWithProxy } = await import('../../../src/util/fetch/index');

      (fetchWithProxy as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'task_123', status: 'succeeded', generations: [] }),
      });

      // Access the auth headers after initialization
      await provider['ensureInitialized']();
      expect(provider['authHeaders']).toEqual({ 'api-key': 'test-api-key' });
    });
  });
});
```

#### 4.2 Create Integration Test Example (`examples/azure-video/promptfooconfig.yaml`)

```yaml
description: Azure Sora Video Generation Test

providers:
  - id: azure:video:sora
    config:
      apiBaseUrl: ${AZURE_API_BASE_URL}
      # Uses AZURE_API_KEY from environment
      width: 1280
      height: 720
      n_seconds: 5

prompts:
  - "A majestic eagle soaring over snow-capped mountains at sunset"
  - "A futuristic city with flying cars and neon lights at night"

tests:
  - vars: {}
    assert:
      - type: is-video
      - type: latency
        threshold: 120000  # 2 minutes max
```

---

### Phase 5: Documentation

#### 5.1 Update Provider Documentation (`site/docs/providers/azure.md`)

Add new section:

```markdown
## Video Generation (Sora)

Azure AI Foundry provides access to OpenAI's Sora video generation model. Generate videos from text prompts using Azure-hosted infrastructure.

### Prerequisites

1. An Azure AI Foundry resource in a supported region (`eastus2` or `swedencentral`)
2. A Sora model deployment

### Deploy Sora via Azure CLI

```bash
# Deploy Sora model
az cognitiveservices account deployment create \
  --name "your-resource-name" \
  --resource-group "your-resource-group" \
  --deployment-name "sora" \
  --model-name "sora" \
  --model-version "2025-05-02" \
  --model-format "OpenAI" \
  --sku-capacity 1 \
  --sku-name "GlobalStandard"
```

### Configuration

```yaml
providers:
  - id: azure:video:sora
    config:
      apiBaseUrl: https://your-resource.cognitiveservices.azure.com
      # Authentication (choose one):
      apiKey: ${AZURE_API_KEY}  # Or use AZURE_API_KEY env var
      # Or use Entra ID (DefaultAzureCredential)

      # Video parameters
      width: 1280       # 480, 720, 854, 1080, 1280, 1920
      height: 720       # 480, 720, 1080
      n_seconds: 5      # 5, 10, 15, 20

      # Polling
      poll_interval_ms: 10000
      max_poll_time_ms: 600000
```

### Supported Dimensions

| Size | Aspect Ratio |
|------|--------------|
| 480x480 | 1:1 (Square) |
| 720x720 | 1:1 (Square) |
| 1080x1080 | 1:1 (Square) |
| 854x480 | 16:9 (Landscape) |
| 1280x720 | 16:9 (Landscape) |
| 1920x1080 | 16:9 (Landscape) |

### Supported Durations

- 5 seconds
- 10 seconds
- 15 seconds
- 20 seconds

### Example

```yaml
providers:
  - azure:video:sora

prompts:
  - "A serene Japanese garden with koi fish swimming in a pond"

tests:
  - vars: {}
    assert:
      - type: is-video
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AZURE_API_KEY` | Azure API key |
| `AZURE_API_BASE_URL` | Resource endpoint URL |
| `AZURE_CLIENT_ID` | Entra ID client ID |
| `AZURE_CLIENT_SECRET` | Entra ID client secret |
| `AZURE_TENANT_ID` | Entra ID tenant ID |
```

---

### Phase 6: Export and Index Updates

#### 6.1 Update Azure Index (`src/providers/azure/index.ts`)

```typescript
export { AzureVideoProvider } from './video';
export type { AzureVideoOptions, AzureVideoJob, AzureVideoGeneration } from './types';
```

---

## Testing Checklist

- [ ] Unit tests pass (`npx vitest run test/providers/azure/video.test.ts`)
- [ ] Integration test works with real Azure deployment
- [ ] Cache hit/miss works correctly
- [ ] Video is stored in media storage
- [ ] Error handling covers all edge cases
- [ ] Entra ID authentication works
- [ ] API key authentication works
- [ ] Documentation builds without errors
- [ ] TypeScript compiles without errors

## Files to Create/Modify

### New Files
1. `src/providers/azure/video.ts` - Main provider implementation
2. `test/providers/azure/video.test.ts` - Unit tests
3. `examples/azure-video/promptfooconfig.yaml` - Example config
4. `examples/azure-video/README.md` - Example documentation

### Modified Files
1. `src/providers/azure/types.ts` - Add video types
2. `src/providers/azure/defaults.ts` - Add video constants
3. `src/providers/azure/index.ts` - Export video provider
4. `src/providers/registry.ts` - Register video provider
5. `site/docs/providers/azure.md` - Add video documentation

## Estimated Effort

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Types and Configuration | 1 hour |
| 2 | Core Provider | 3-4 hours |
| 3 | Registry Integration | 30 min |
| 4 | Testing | 2-3 hours |
| 5 | Documentation | 1-2 hours |
| 6 | Exports and Cleanup | 30 min |

**Total:** ~8-11 hours

## Notes

1. **Cost Calculation:** Azure pricing for Sora is based on resolution and duration. The exact pricing should be verified with Azure documentation and potentially made configurable.

2. **Content Filtering:** Azure's content filtering applies to Sora. The provider should handle `content_filter` errors gracefully like other Azure providers do.

3. **Inpainting:** Azure's API supports image-to-video via `inpaint_items`. This is different from OpenAI's `input_reference`. Consider adding a helper function to convert between formats for consistency.

4. **Model Naming:** Azure always expects `model: "sora"` in requests, regardless of deployment name. This is unlike chat models where the deployment name is used.

5. **API Version:** Azure uses `api-version=preview` for video generation. This should be monitored for when it moves to GA.
