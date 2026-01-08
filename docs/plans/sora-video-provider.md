# Plan: Add Sora Video Generation Support to OpenAI Provider

## Overview

Add a new `openai:video:<model>` provider type to support OpenAI's Sora video generation API. This follows the same pattern as the existing `openai:image:<model>` provider but handles the asynchronous nature of video generation.

---

## API Analysis

### Sora API Endpoints

The Sora API uses `/v1/videos` endpoints:

| Endpoint                                      | Method | Description                 |
| --------------------------------------------- | ------ | --------------------------- |
| `/v1/videos`                                  | POST   | Create video generation job |
| `/v1/videos/{id}`                             | GET    | Get job status/progress     |
| `/v1/videos/{id}/content`                     | GET    | Download completed video    |
| `/v1/videos/{id}/content?variant=thumbnail`   | GET    | Download thumbnail          |
| `/v1/videos/{id}/content?variant=spritesheet` | GET    | Download spritesheet        |
| `/v1/videos/{id}/remix`                       | POST   | Remix existing video        |
| `/v1/videos`                                  | GET    | List videos (pagination)    |
| `/v1/videos/{id}`                             | DELETE | Delete video                |

### Async Job Flow

```
1. POST /v1/videos          → { id, status: "queued", progress: 0 }
2. Poll GET /v1/videos/{id} → { status: "in_progress", progress: 33 }
3. Poll GET /v1/videos/{id} → { status: "completed", progress: 100 }
4. GET /v1/videos/{id}/content → Binary MP4 data
5. GET /v1/videos/{id}/content?variant=thumbnail → WebP thumbnail
6. GET /v1/videos/{id}/content?variant=spritesheet → JPG spritesheet
```

### Models & Pricing

| Model        | Description        | Cost/Second | Best For                    |
| ------------ | ------------------ | ----------- | --------------------------- |
| `sora-2`     | Speed-optimized    | $0.10       | Rapid iteration, prototypes |
| `sora-2-pro` | Production quality | $0.30       | Final output, marketing     |

### Video Specifications

| Parameter     | Values                                           |
| ------------- | ------------------------------------------------ |
| Sizes         | `1280x720` (landscape), `720x1280` (portrait)    |
| Duration      | 4, 8, or 12 seconds                              |
| Output format | MP4 (video), WebP (thumbnail), JPG (spritesheet) |

### Content Restrictions

- No copyrighted characters/music
- No real people (including public figures)
- No human faces in input images
- Under-18 suitable content only (SFW)

---

## Implementation Plan

### Step 1: Add Video Types to ProviderResponse

**File: `src/types/providers.ts`**

Add `video` field to `ProviderResponse` (similar to existing `audio` field):

```typescript
export interface ProviderResponse {
  // ... existing fields ...

  audio?: {
    id?: string;
    expiresAt?: number;
    data?: string; // base64 encoded audio data
    transcript?: string;
    format?: string;
    sampleRate?: number;
    channels?: number;
    duration?: number;
  };

  // NEW: Video output field
  video?: {
    id?: string; // Sora job ID
    uuid?: string; // Local storage UUID
    url?: string; // API path to serve video (e.g., /api/output/video/{uuid}/video.mp4)
    format?: string; // 'mp4'
    size?: string; // '1280x720' or '720x1280'
    duration?: number; // Seconds
    thumbnail?: string; // API path to thumbnail
    spritesheet?: string; // API path to spritesheet
    model?: string; // 'sora-2' or 'sora-2-pro'
  };
}
```

### Step 2: Add Video Configuration Types

**File: `src/providers/openai/types.ts`**

```typescript
// Video model types
export type OpenAiVideoModel = 'sora-2' | 'sora-2-pro';

// Video sizes
export type OpenAiVideoSize = '1280x720' | '720x1280';

// Job status
export type OpenAiVideoStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

// Download variants
export type OpenAiVideoVariant = 'video' | 'thumbnail' | 'spritesheet';

// Provider configuration options
export interface OpenAiVideoOptions extends OpenAiSharedOptions {
  // Model selection
  model?: OpenAiVideoModel;

  // Video parameters
  size?: OpenAiVideoSize;
  seconds?: number;

  // Image-to-video: base64 image data or file path
  input_reference?: string;

  // Remix mode: ID of previous video to modify
  remix_video_id?: string;

  // Polling configuration
  poll_interval_ms?: number; // Default: 10000 (10 seconds)
  max_poll_time_ms?: number; // Default: 600000 (10 minutes)

  // Output options
  download_thumbnail?: boolean; // Default: true
  download_spritesheet?: boolean; // Default: true
}

// API response types
export interface OpenAiVideoJob {
  id: string;
  object: 'video';
  created_at: number;
  status: OpenAiVideoStatus;
  model: string;
  progress?: number; // 0-100
  seconds?: string;
  size?: string;
  error?: {
    message: string;
    code?: string;
  };
}

export interface OpenAiVideoCreateRequest {
  model: string;
  prompt: string;
  size?: string;
  seconds?: number;
}

export interface OpenAiVideoRemixRequest {
  prompt: string;
}
```

### Step 3: Create Video Provider Implementation

**File: `src/providers/openai/video.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { sleep } from '../../util/time';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { OpenAiGenericProvider } from './';

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

// Cost per second of video
export const SORA_COSTS: Record<OpenAiVideoModel, number> = {
  'sora-2': 0.1,
  'sora-2-pro': 0.3,
};

// Valid video sizes
const VALID_VIDEO_SIZES: OpenAiVideoSize[] = ['1280x720', '720x1280'];

// Default configuration
const DEFAULT_SIZE: OpenAiVideoSize = '1280x720';
const DEFAULT_SECONDS = 8;
const DEFAULT_POLL_INTERVAL_MS = 10000; // 10 seconds
const DEFAULT_MAX_POLL_TIME_MS = 600000; // 10 minutes

// Video output directory in .promptfoo
const VIDEO_OUTPUT_SUBDIR = 'output/video';

function getVideoOutputDir(): string {
  return path.join(getConfigDirectoryPath(true), VIDEO_OUTPUT_SUBDIR);
}

export function validateVideoSize(size: string): { valid: boolean; message?: string } {
  if (!VALID_VIDEO_SIZES.includes(size as OpenAiVideoSize)) {
    return {
      valid: false,
      message: `Invalid video size "${size}". Valid sizes: ${VALID_VIDEO_SIZES.join(', ')}`,
    };
  }
  return { valid: true };
}

export function calculateVideoCost(
  model: OpenAiVideoModel,
  seconds: number,
  cached: boolean = false,
): number {
  if (cached) return 0;
  const costPerSecond = SORA_COSTS[model] || SORA_COSTS['sora-2'];
  return costPerSecond * seconds;
}

// Extension mapping for each variant
const VARIANT_EXTENSIONS: Record<OpenAiVideoVariant, string> = {
  video: 'mp4',
  thumbnail: 'webp',
  spritesheet: 'jpg',
};

// File names within UUID directory
const VARIANT_FILENAMES: Record<OpenAiVideoVariant, string> = {
  video: 'video.mp4',
  thumbnail: 'thumbnail.webp',
  spritesheet: 'spritesheet.jpg',
};

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

export class OpenAiVideoProvider extends OpenAiGenericProvider {
  config: OpenAiVideoOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiVideoOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
  }

  id(): string {
    return `openai:video:${this.modelName}`;
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

    const body: Record<string, any> = {
      model: this.modelName,
      prompt,
    };

    // Only include these for new videos (not remix)
    if (!config.remix_video_id) {
      body.size = config.size || DEFAULT_SIZE;
      body.seconds = config.seconds || DEFAULT_SECONDS;
    }

    // Handle input_reference (image-to-video)
    // If it's a file path, read and convert to base64
    if (config.input_reference) {
      let imageData = config.input_reference;
      if (config.input_reference.startsWith('file://')) {
        const filePath = config.input_reference.slice(7);
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          imageData = buffer.toString('base64');
        }
      }
      body.input_reference = imageData;
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.getApiKey()}`,
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
      ...config.headers,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          job: {} as OpenAiVideoJob,
          error: `API error ${response.status}: ${errorData.error?.message || response.statusText}`,
        };
      }

      const job = await response.json();
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
    onProgress?: (progress: number) => void,
  ): Promise<{ job: OpenAiVideoJob; error?: string }> {
    const startTime = Date.now();
    const url = `${this.getApiUrl()}/videos/${videoId}`;

    const headers = {
      Authorization: `Bearer ${this.getApiKey()}`,
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
    };

    while (Date.now() - startTime < maxPollTimeMs) {
      try {
        const response = await fetch(url, { method: 'GET', headers });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return {
            job: {} as OpenAiVideoJob,
            error: `Status check failed: ${errorData.error?.message || response.statusText}`,
          };
        }

        const job: OpenAiVideoJob = await response.json();

        // Report progress
        if (onProgress && job.progress !== undefined) {
          onProgress(job.progress);
        }

        logger.debug(`Video ${videoId} status: ${job.status}, progress: ${job.progress}%`);

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
   * @param soraVideoId - The Sora API video ID
   * @param variant - Which content variant to download
   * @param outputUuid - The UUID for our local storage directory
   */
  private async downloadVideoContent(
    soraVideoId: string,
    variant: OpenAiVideoVariant,
    outputUuid: string,
  ): Promise<{ filePath?: string; apiPath?: string; error?: string }> {
    const url = `${this.getApiUrl()}/videos/${soraVideoId}/content${variant !== 'video' ? `?variant=${variant}` : ''}`;

    const headers = {
      Authorization: `Bearer ${this.getApiKey()}`,
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
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
      logger.debug(`Downloaded ${variant} to ${filePath} (API: ${apiPath})`);

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
    logger.info(`Creating video job for model ${model}...`);
    const { job: createdJob, error: createError } = await this.createVideoJob(prompt, {
      ...config,
      size,
      seconds,
    });

    if (createError) {
      return { error: createError };
    }

    const videoId = createdJob.id;
    logger.info(`Video job created: ${videoId}`);

    // Step 2: Poll for completion
    const pollIntervalMs = config.poll_interval_ms || DEFAULT_POLL_INTERVAL_MS;
    const maxPollTimeMs = config.max_poll_time_ms || DEFAULT_MAX_POLL_TIME_MS;

    const { job: completedJob, error: pollError } = await this.pollVideoStatus(
      videoId,
      pollIntervalMs,
      maxPollTimeMs,
    );

    if (pollError) {
      return { error: pollError };
    }

    // Step 3: Create UUID-based output directory
    const outputUuid = createVideoOutputDirectory();
    logger.debug(`Created video output directory: ${outputUuid}`);

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
        logger.warn(`Failed to download thumbnail: ${error}`);
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
        logger.warn(`Failed to download spritesheet: ${error}`);
      } else {
        spritesheetApiPath = apiPath;
      }
    }

    const latencyMs = Date.now() - startTime;
    const cost = calculateVideoCost(model, seconds, false);

    // Format output as markdown (similar to image provider)
    const ellipsizedPrompt = prompt.length > 50 ? prompt.slice(0, 47) + '...' : prompt;
    const output = `[Video: ${ellipsizedPrompt}](${videoApiPath})`;

    return {
      output,
      cached: false,
      latencyMs,
      cost,
      video: {
        id: videoId,
        uuid: outputUuid, // Our local storage UUID
        url: videoApiPath, // API path to serve video
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
```

### Step 4: Register Provider in Registry

**File: `src/providers/registry.ts`**

Add import:

```typescript
import { OpenAiVideoProvider } from './openai/video';
```

Add case in OpenAI handler (around line 917):

```typescript
if (modelType === 'video') {
  return new OpenAiVideoProvider(modelName || 'sora-2', providerOptions);
}
```

Update error message (around line 922):

```typescript
logger.warn(
  `Unknown OpenAI model type: ${modelType}. Treating it as a chat model. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>, openai:embeddings:<model name>, openai:image:<model name>, openai:video:<model name>, openai:realtime:<model name>, openai:agents:<agent name>, openai:chatkit:<workflow_id>, openai:codex-sdk`,
);
```

### Step 5: Add Server Route to Serve Video Files

**File: `src/server/routes/output.ts`** (NEW)

Create a new route to serve video files from `~/.promptfoo/output/video/`:

```typescript
import express from 'express';
import fs from 'fs';
import path from 'path';
import { getConfigDirectoryPath } from '../../util/config/manage';
import logger from '../../logger';

const router = express.Router();

// MIME types for video assets
const MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webp: 'image/webp',
  jpg: 'image/jpeg',
};

// Allowed filenames to prevent directory traversal
const ALLOWED_FILES = new Set(['video.mp4', 'thumbnail.webp', 'spritesheet.jpg']);

/**
 * Serve video output files from ~/.promptfoo/output/video/{uuid}/{filename}
 * GET /api/output/video/:uuid/:filename
 */
router.get('/video/:uuid/:filename', (req, res) => {
  const { uuid, filename } = req.params;

  // Validate UUID format (prevent directory traversal)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    logger.warn(`Invalid UUID in video request: ${uuid}`);
    return res.status(400).json({ error: 'Invalid UUID format' });
  }

  // Validate filename
  if (!ALLOWED_FILES.has(filename)) {
    logger.warn(`Invalid filename in video request: ${filename}`);
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const outputDir = getConfigDirectoryPath();
  const filePath = path.join(outputDir, 'output', 'video', uuid, filename);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    logger.debug(`Video file not found: ${filePath}`);
    return res.status(404).json({ error: 'File not found' });
  }

  // Get file stats for Content-Length
  const stat = fs.statSync(filePath);

  // Determine MIME type
  const ext = path.extname(filename).slice(1);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  // Support range requests for video streaming
  const range = req.headers.range;
  if (range && ext === 'mp4') {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mimeType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

export { router as outputRouter };
```

**File: `src/server/server.ts`**

Add the output router (after existing route imports, around line 40):

```typescript
import { outputRouter } from './routes/output';
```

Register the route (after existing route registrations):

```typescript
app.use('/api/output', outputRouter);
```

### Step 6: Add UI Support for Video Playback

**File: `src/app/src/pages/eval/components/EvalOutputCell.tsx`**

Add video detection function (similar to `isImageProvider`):

```typescript
export function isVideoProvider(provider: string | undefined): boolean {
  if (!provider) return false;
  return provider.includes(':video:');
}
```

Add video rendering case (after audio case, around line 303):

```typescript
} else if (output.video) {
  // Build video URL - use API path directly (e.g., /api/output/video/{uuid}/video.mp4)
  const videoSrc = output.video.url || '';
  const posterSrc = output.video.thumbnail || undefined;

  node = (
    <div className="video-output">
      <video
        controls
        style={{ width: '100%', maxWidth: maxImageWidth || 512 }}
        data-testid="video-player"
        poster={posterSrc}
      >
        <source src={videoSrc} type="video/mp4" />
        Your browser does not support the video element.
      </video>
      {(output.video.duration || output.video.size || output.video.model) && (
        <div className="video-info">
          {output.video.duration && <span>Duration: {output.video.duration}s</span>}
          {output.video.size && <span> | Size: {output.video.size}</span>}
          {output.video.model && <span> | Model: {output.video.model}</span>}
        </div>
      )}
    </div>
  );
}
```

**File: `src/app/src/pages/eval/components/ResultsTable.css`**

Add video styles:

```css
.video-output {
  margin: 1rem 0;
}

.video-output video {
  margin-bottom: 0.5rem;
  border-radius: 4px;
}

.video-output .video-info {
  font-size: 0.85rem;
  color: var(--ifm-color-emphasis-600);
}
```

### Step 7: Add EvaluateTableOutput Type Support

**File: `src/types/index.ts` (or relevant types file)**

Ensure `EvaluateTableOutput` includes the video field:

```typescript
export interface EvaluateTableOutput {
  // ... existing fields ...
  video?: {
    id?: string;
    uuid?: string;
    url?: string;
    format?: string;
    size?: string;
    duration?: number;
    thumbnail?: string;
    spritesheet?: string;
    model?: string;
  };
}
```

### Step 8: Add Tests

**File: `test/providers/openai/video.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenAiVideoProvider,
  validateVideoSize,
  calculateVideoCost,
  SORA_COSTS,
} from '../../../src/providers/openai/video';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenAiVideoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('validateVideoSize', () => {
    it('should accept valid landscape size', () => {
      expect(validateVideoSize('1280x720')).toEqual({ valid: true });
    });

    it('should accept valid portrait size', () => {
      expect(validateVideoSize('720x1280')).toEqual({ valid: true });
    });

    it('should reject invalid size', () => {
      const result = validateVideoSize('1920x1080');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid video size');
    });
  });

  describe('calculateVideoCost', () => {
    it('should calculate cost for sora-2', () => {
      expect(calculateVideoCost('sora-2', 10)).toBe(1.0); // $0.10 * 10 seconds
    });

    it('should calculate cost for sora-2-pro', () => {
      expect(calculateVideoCost('sora-2-pro', 10)).toBe(3.0); // $0.30 * 10 seconds
    });

    it('should return 0 for cached results', () => {
      expect(calculateVideoCost('sora-2', 10, true)).toBe(0);
    });
  });

  describe('callApi', () => {
    it('should create video job and poll for completion', async () => {
      const provider = new OpenAiVideoProvider('sora-2');

      // Mock job creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'queued', progress: 0 }),
      });

      // Mock status poll (in_progress)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'in_progress', progress: 50 }),
      });

      // Mock status poll (completed)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'completed', progress: 100 }),
      });

      // Mock video download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock thumbnail download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      // Mock spritesheet download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(75),
      });

      const result = await provider.callApi('A cat riding a skateboard');

      expect(result.error).toBeUndefined();
      expect(result.video).toBeDefined();
      expect(result.video?.id).toBe('video_123');
      expect(result.video?.format).toBe('mp4');
      expect(result.cost).toBeGreaterThan(0);
    });

    it('should handle job creation failure', async () => {
      const provider = new OpenAiVideoProvider('sora-2');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid prompt' } }),
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Invalid prompt');
    });

    it('should handle polling timeout', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          poll_interval_ms: 10,
          max_poll_time_ms: 50,
        },
      });

      // Mock job creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'queued' }),
      });

      // Always return in_progress to trigger timeout
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'in_progress', progress: 10 }),
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('timed out');
    });

    it('should handle content policy violation', async () => {
      const provider = new OpenAiVideoProvider('sora-2');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Content policy violation: copyrighted character detected',
          },
        }),
      });

      const result = await provider.callApi('Mickey Mouse dancing');

      expect(result.error).toContain('copyrighted character');
    });
  });

  describe('id()', () => {
    it('should return correct provider ID', () => {
      const provider = new OpenAiVideoProvider('sora-2');
      expect(provider.id()).toBe('openai:video:sora-2');
    });
  });
});
```

### Step 9: Add Documentation

**File: `site/docs/providers/openai.md`**

Add new section after "Generating images" (~line 585):

````markdown
## Video Generation (Sora)

OpenAI supports video generation via `openai:video:<model>` using the Sora API. Video generation is asynchronous - jobs are created, polled for completion, and then assets are downloaded.

### Supported Models

| Model        | Description        | Cost         | Best For                    |
| ------------ | ------------------ | ------------ | --------------------------- |
| `sora-2`     | Speed-optimized    | $0.10/second | Rapid iteration, prototypes |
| `sora-2-pro` | Production quality | $0.30/second | Final output, marketing     |

### Basic Usage

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:video:sora-2
    config:
      size: 1280x720 # landscape (or 720x1280 for portrait)
      seconds: 8

prompts:
  - 'A serene mountain lake at sunrise with mist rising from the water'

tests:
  - vars: {}
```
````

### Configuration Options

| Parameter              | Description           | Default    | Options                 |
| ---------------------- | --------------------- | ---------- | ----------------------- |
| `size`                 | Video dimensions      | `1280x720` | `1280x720`, `720x1280`  |
| `seconds`              | Video duration        | `8`        | 4, 8, 12                |
| `input_reference`      | First frame image     | -          | Base64 or `file://path` |
| `remix_video_id`       | Video ID to remix     | -          | Previous video ID       |
| `poll_interval_ms`     | Status check interval | `10000`    | Any number              |
| `max_poll_time_ms`     | Max wait time         | `600000`   | Any number              |
| `download_thumbnail`   | Download thumbnail    | `true`     | Boolean                 |
| `download_spritesheet` | Download spritesheet  | `true`     | Boolean                 |

### Image-to-Video

Use an image as the first frame to guide video generation:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:video:sora-2-pro
    config:
      size: 1280x720
      seconds: 8
      input_reference: file://./first-frame.png

prompts:
  - 'She turns around and smiles, then slowly walks out of the frame.'
```

The input image must match the target video resolution.

### Remixing Videos

Make targeted adjustments to existing videos without regenerating everything:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:video:sora-2
    config:
      remix_video_id: video_abc123

prompts:
  - 'Change the color palette to warm sunset tones.'
```

Remix works best with single, well-defined changes to preserve the original's structure.

### Output Format

Videos are saved to `~/.promptfoo/output/video/{uuid}/` with UUID-based naming. The response includes:

- **Video**: `video.mp4` - Main video file
- **Thumbnail**: `thumbnail.webp` - Preview image
- **Spritesheet**: `spritesheet.jpg` - Timeline preview

In the web viewer, videos are served via API routes (`/api/output/video/{uuid}/...`) and display with an embedded player supporting seeking and fullscreen playback.

### Effective Prompting

For best results, describe **shot type, subject, action, setting, and lighting**:

- "Wide shot of a child flying a red kite in a grassy park, golden hour sunlight, camera slowly pans upward."
- "Close-up of a steaming coffee cup on a wooden table, morning light through blinds, soft depth of field."

### Content Restrictions

Sora enforces content policies:

- No copyrighted characters or music
- No real people (including public figures)
- No human faces in input images
- Content must be suitable for general audiences

### Example

See the [OpenAI video generation example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-video) or initialize it with:

```bash
npx promptfoo@latest init --example openai-video
```

````

### Step 10: Create Example

**File: `examples/openai-video/promptfooconfig.yaml`**

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: OpenAI Sora Video Generation Example

prompts:
  - 'A serene mountain lake at sunrise with mist rising from the water, wide shot, golden hour lighting'
  - 'A futuristic city with flying cars and neon signs in the rain, cinematic drone shot'

providers:
  # Fast iteration model
  - id: openai:video:sora-2
    config:
      size: 1280x720
      seconds: 5

  # Production quality model
  - id: openai:video:sora-2-pro
    config:
      size: 1280x720
      seconds: 5

tests:
  - vars: {}
    assert:
      # Video should be generated successfully
      - type: javascript
        value: output.includes('/api/output/video/')
````

**File: `examples/openai-video/README.md`**

````markdown
# OpenAI Sora Video Generation Example

This example demonstrates video generation using OpenAI's Sora models.

## Prerequisites

- OpenAI API key with Sora access
- Set `OPENAI_API_KEY` environment variable

## Running the Example

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```
````

## Models

- **sora-2**: Faster, more affordable ($0.10/sec) - good for iteration
- **sora-2-pro**: Higher quality ($0.30/sec) - good for final output

## Configuration Options

- `size`: Video dimensions (`1280x720` or `720x1280`)
- `seconds`: Video duration (4, 8, or 12 seconds)
- `input_reference`: Image for first frame (image-to-video)
- `remix_video_id`: Remix an existing video

## Notes

- Video generation takes several minutes
- Videos are saved to `~/.promptfoo/output/video/` with UUID-based directories
- Thumbnail and spritesheet are downloaded automatically
- Videos can be viewed in the web UI at `npm run dev` (http://localhost:5173)

````

---

## Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `src/types/providers.ts` | Modify | Add `video` field to `ProviderResponse` |
| `src/providers/openai/types.ts` | Modify | Add video-related type definitions |
| `src/providers/openai/video.ts` | **Create** | Main video provider implementation |
| `src/providers/registry.ts` | Modify | Register `openai:video:` provider |
| `src/server/routes/output.ts` | **Create** | Server route to serve video files |
| `src/server/server.ts` | Modify | Register output router |
| `src/app/src/pages/eval/components/EvalOutputCell.tsx` | Modify | Add video playback UI |
| `src/app/src/pages/eval/components/ResultsTable.css` | Modify | Add video styles |
| `test/providers/openai/video.test.ts` | **Create** | Unit tests |
| `site/docs/providers/openai.md` | Modify | Add documentation |
| `examples/openai-video/promptfooconfig.yaml` | **Create** | Example config |
| `examples/openai-video/README.md` | **Create** | Example readme |

---

## Caching Strategy

Video generation is expensive ($0.10-$0.30 per second) and slow (1-5 minutes per video). To avoid regenerating identical videos, we implement deterministic caching based on a hash of the input parameters.

### Cache Key Generation

A deterministic cache key is generated from:
- **prompt** - The video generation prompt
- **model** - The model name (e.g., 'sora-2', 'sora-2-pro')
- **size** - Video dimensions (e.g., '1280x720')
- **seconds** - Video duration (4, 8, or 12)
- **input_reference** - Optional image data for image-to-video

```typescript
export function generateVideoCacheKey(
  prompt: string,
  model: string,
  size: string,
  seconds: number,
  inputReference?: string,
): string {
  const hashInput = JSON.stringify({
    prompt,
    model,
    size,
    seconds,
    inputReference: inputReference || null,
  });

  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

  // Format as UUID-like string: 8-4-4-4-12
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}
````

### Cache Check Flow

Before making API calls:

1. Generate cache key from inputs
2. Check if `~/.promptfoo/output/video/{cacheKey}/video.mp4` exists
3. If exists, return cached response immediately with `cached: true`, `cost: 0`, `latencyMs: 0`
4. If not, proceed with video generation and use cache key as the output directory

### Remix Operations Skip Caching

Remix operations (`remix_video_id` config) always regenerate because:

- Each remix produces a unique variation
- Users expect fresh results when remixing
- Uses random UUID instead of deterministic cache key

### Cached Response Structure

```typescript
{
  output: "[Video: ...](apiPath)",
  cached: true,
  latencyMs: 0,
  cost: 0,
  video: {
    id: undefined,  // No Sora ID for cached results
    uuid: cacheKey,
    url: videoApiPath,
    format: 'mp4',
    size,
    duration: seconds,
    thumbnail: thumbnailApiPath,  // If exists
    spritesheet: spritesheetApiPath,  // If exists
    model,
  },
  metadata: {
    cached: true,
    cacheKey,
    model,
    size,
    seconds,
  },
}
```

---

## Testing Strategy

### Unit Tests (Mocked)

- Job creation success/failure
- Polling logic (in_progress, completed, failed, timeout)
- Download success/failure for all variants
- Cost calculation
- Size validation
- Configuration merging
- **Caching behavior** (cache hit, cache miss, remix bypass)
- **input_reference** (base64 data, file:// paths, missing files)
- **remix_video_id** (endpoint URL, excluded params, random UUID)

### Manual Testing

```bash
# Build and test locally
npm run build
npm run local -- eval -c examples/openai-video/promptfooconfig.yaml --env-file .env --no-cache

# View results
npm run dev  # Then open http://localhost:5173
```

### Integration Testing (Optional, requires API key)

- Real video generation with sora-2
- Verify downloaded files are valid
- Test image-to-video flow

---

## Implementation Order

1. **Types first** - Add video types to `providers.ts` and `openai/types.ts`
2. **Provider implementation** - Create `video.ts` with UUID-based storage in `~/.promptfoo/output/video/`
3. **Registry** - Register the new provider
4. **Server route** - Create `/api/output/video/` route to serve video files
5. **Tests** - Write comprehensive unit tests
6. **UI** - Add video playback support using API paths
7. **Documentation** - Update docs and create example
8. **Manual testing** - End-to-end verification
