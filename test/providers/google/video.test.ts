import * as fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleVideoProvider,
  generateVideoCacheKey,
  validateAspectRatio,
  validateDuration,
  validateResolution,
} from '../../../src/providers/google/video';
import { mockProcessEnv } from '../../util/utils';

import type { GoogleVideoOptions } from '../../../src/providers/google/types';
import type { CallApiContextParams } from '../../../src/types/providers';

// Mock the Google client
const mockRequest = vi.fn();
const mockFetchWithTimeout = vi.fn();
const mockGetGoogleClient = vi.fn().mockResolvedValue({
  client: { request: mockRequest },
  projectId: 'test-project',
});

// Mock blob storage
const mockStoreBlob = vi.fn();
vi.mock('../../../src/blobs', () => ({
  storeBlob: (...args: unknown[]) => mockStoreBlob(...args),
}));

vi.mock('fs');
const mockResolveProjectId = vi.fn().mockResolvedValue('test-project');
const mockGetGoogleApiKey = vi.fn();
const mockDetermineGoogleVertexMode = vi.fn();
vi.mock('../../../src/providers/google/util', () => ({
  getGoogleClient: () => mockGetGoogleClient(),
  loadCredentials: vi.fn((creds) => creds),
  resolveProjectId: (...args: unknown[]) => mockResolveProjectId(...args),
  getGoogleApiKey: (...args: unknown[]) => mockGetGoogleApiKey(...args),
  determineGoogleVertexMode: (...args: unknown[]) => mockDetermineGoogleVertexMode(...args),
}));
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const durationConstrainedConfigs = [
  ['reference images', { referenceImages: ['file://reference.png'] }],
  ['extendVideoId', { extendVideoId: 'projects/test/operations/123' }],
  ['sourceVideo', { sourceVideo: 'file://source.mp4' }],
  ['1080p resolution', { resolution: '1080p' }],
  ['4k resolution', { resolution: '4k' }],
] satisfies Array<
  [
    string,
    Pick<GoogleVideoOptions, 'referenceImages' | 'extendVideoId' | 'sourceVideo' | 'resolution'>,
  ]
>;

function resolveTestFileRef(fileRef: string): string {
  return path.resolve(fileRef.slice('file://'.length));
}

describe('GoogleVideoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    mockRequest.mockReset();
    mockFetchWithTimeout.mockReset();
    mockStoreBlob.mockReset();
    mockResolveProjectId.mockReset();
    mockGetGoogleApiKey.mockReset();
    mockDetermineGoogleVertexMode.mockReset();
    mockResolveProjectId.mockResolvedValue('test-project');
    mockGetGoogleApiKey.mockImplementation((config: any, env?: any) => ({
      apiKey:
        config?.apiKey ||
        env?.GOOGLE_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        env?.GEMINI_API_KEY ||
        process.env.GEMINI_API_KEY,
      source: 'GOOGLE_API_KEY',
    }));
    mockDetermineGoogleVertexMode.mockImplementation((config: any, env?: any) => {
      if (config?.vertexai !== undefined) {
        return config.vertexai;
      }
      return Boolean(
        config?.projectId ||
          config?.credentials ||
          env?.GOOGLE_CLOUD_PROJECT ||
          env?.GOOGLE_PROJECT_ID ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          process.env.GOOGLE_PROJECT_ID,
      );
    });
    mockProcessEnv({ GOOGLE_PROJECT_ID: 'test-project' });
    mockProcessEnv({ GOOGLE_CLOUD_PROJECT: undefined });
    mockProcessEnv({ GOOGLE_API_KEY: undefined });
    mockProcessEnv({ GEMINI_API_KEY: undefined });
    mockProcessEnv({ VERTEX_PROJECT_ID: undefined });

    // Default mock for blob storage
    mockStoreBlob.mockResolvedValue({
      ref: {
        uri: 'promptfoo://blob/abc123def456',
        hash: 'abc123def456',
        mimeType: 'video/mp4',
        sizeBytes: 1024,
        provider: 'filesystem',
      },
      deduplicated: false,
    });
  });

  afterEach(() => {
    mockProcessEnv({ GOOGLE_API_KEY: undefined });
    mockProcessEnv({ GEMINI_API_KEY: undefined });
    mockProcessEnv({ GOOGLE_CLOUD_PROJECT: undefined });
    mockProcessEnv({ GOOGLE_PROJECT_ID: undefined });
    mockProcessEnv({ VERTEX_PROJECT_ID: undefined });
  });

  describe('constructor and id', () => {
    it('should construct with model name', () => {
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');
      expect(provider.id()).toBe('google:video:veo-3.1-generate-preview');
      expect(provider.toString()).toBe('[Google Video Provider veo-3.1-generate-preview]');
    });

    it('should support custom provider ID', () => {
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        id: 'my-custom-id',
      });
      expect(provider.id()).toBe('my-custom-id');
    });
  });

  describe('request model selection', () => {
    it('uses config.model in the Vertex create endpoint', async () => {
      mockRequest.mockResolvedValueOnce({ data: { name: 'test-op', done: false } });
      const provider = new GoogleVideoProvider('veo-3.1-lite-generate-preview', {
        config: {
          model: 'veo-3.1-generate-preview',
          projectId: 'test-project',
        },
      });

      await (provider as any).createVertexVideoJob('test prompt', provider.config);

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/models/veo-3.1-generate-preview:predictLongRunning'),
        }),
      );
    });

    it('uses config.model in the Google AI Studio create endpoint', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ name: 'models/veo-3.1-generate-preview/operations/test-op' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      const provider = new GoogleVideoProvider('veo-3.1-lite-generate-preview', {
        config: {
          apiKey: 'test-api-key',
          model: 'veo-3.1-generate-preview',
          vertexai: false,
        },
      });

      await (provider as any).createAiStudioVideoJob('test prompt', provider.config);

      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/models/veo-3.1-generate-preview:predictLongRunning'),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('config-relative media paths', () => {
    it.each([
      ['loadImageData', 'image', 'file://assets/start-frame.png'],
      ['loadVideoData', 'video', 'file://assets/veo-input.mp4'],
    ])('resolves %s for a %s relative to the config directory', (method, _kind, fileRef) => {
      const basePath = path.resolve('/tmp', 'google-video');
      const expectedPath = path.resolve(basePath, fileRef.slice('file://'.length));
      vi.mocked(fs.existsSync).mockImplementation((candidate) => candidate === expectedPath);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('media-data'));
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: { basePath },
      });

      expect((provider as any)[method](fileRef)).toEqual({
        data: Buffer.from('media-data').toString('base64'),
      });
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    });

    it.each([
      ['buildVertexRequestBody', 'image', 'file://assets/start-frame.png'],
      ['buildAiStudioRequestBody', 'sourceVideo', 'file://assets/veo-input.mp4'],
    ])('uses the request basePath when %s loads %s media', (method, mediaField, fileRef) => {
      const providerBasePath = path.resolve('/tmp', 'provider-config');
      const requestBasePath = path.resolve('/tmp', 'prompt-config');
      const expectedPath = path.resolve(requestBasePath, fileRef.slice('file://'.length));
      vi.mocked(fs.existsSync).mockImplementation((candidate) => candidate === expectedPath);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('request-media'));
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: { basePath: providerBasePath },
      });

      const result = (provider as any)[method]('test prompt', {
        ...provider.config,
        basePath: requestBasePath,
        [mediaField]: fileRef,
      });

      expect(result.error).toBeUndefined();
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    });
  });

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
      expect(result.message).toContain('Invalid aspect ratio');
    });
  });

  describe('validateDuration', () => {
    it('should accept 4, 6, 8 for Veo 3.1', () => {
      expect(validateDuration('veo-3.1-generate-preview', 4)).toEqual({ valid: true });
      expect(validateDuration('veo-3.1-generate-preview', 6)).toEqual({ valid: true });
      expect(validateDuration('veo-3.1-generate-preview', 8)).toEqual({ valid: true });
    });

    it('should accept 4, 6, 8 for Veo 3', () => {
      expect(validateDuration('veo-3.0-generate-001', 4)).toEqual({ valid: true });
      expect(validateDuration('veo-3.0-generate-001', 6)).toEqual({ valid: true });
      expect(validateDuration('veo-3.0-generate-001', 8)).toEqual({ valid: true });
    });

    it('should accept 5, 6, 8 for Veo 2', () => {
      expect(validateDuration('veo-2.0-generate-001', 5)).toEqual({ valid: true });
      expect(validateDuration('veo-2.0-generate-001', 6)).toEqual({ valid: true });
      expect(validateDuration('veo-2.0-generate-001', 8)).toEqual({ valid: true });
    });

    it('should reject 5 for Veo 3', () => {
      const result = validateDuration('veo-3.1-generate-preview', 5);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid duration');
    });

    it('should reject 4 for Veo 2', () => {
      const result = validateDuration('veo-2.0-generate-001', 4);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid duration');
    });

    it.each(
      durationConstrainedConfigs,
    )('should require 8 seconds for Veo requests using %s', (_feature, config) => {
      const result = validateDuration('veo-3.1-generate-preview', 6, config);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('requires durationSeconds: 8');
      expect(validateDuration('veo-3.1-generate-preview', 8, config)).toEqual({
        valid: true,
      });
    });

    it.each([
      ['reference images', { referenceImages: ['file://reference.png'] }],
      ['video extension', { sourceVideo: 'file://source.mp4' }],
    ])('should reject %s for Veo 3.1 Lite', (_feature, config) => {
      const result = validateDuration('veo-3.1-lite-generate-preview', 8, config);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Veo 3.1 Lite');
    });

    it('should allow shorter high-resolution videos on Vertex Veo 3.1', () => {
      for (const duration of [4, 6] as const) {
        expect(
          validateDuration('veo-3.1-generate-001', duration, {
            resolution: '1080p',
            vertexai: true,
          }),
        ).toEqual({ valid: true });
      }
    });

    it('should allow video extension on stable Vertex Veo 3.1 Lite', () => {
      expect(
        validateDuration('veo-3.1-lite-generate-001', 8, {
          sourceVideo: 'projects/test/operations/123',
          vertexai: true,
        }),
      ).toEqual({ valid: true });
    });
  });

  describe('validateResolution', () => {
    it('should accept 720p and 1080p for Veo 3.1 16:9', () => {
      expect(validateResolution('veo-3.1-generate-preview', '16:9', '720p')).toEqual({
        valid: true,
      });
      expect(validateResolution('veo-3.1-generate-preview', '16:9', '1080p')).toEqual({
        valid: true,
      });
    });

    it('should reject 1080p for Veo 3 with 9:16 aspect ratio', () => {
      const result = validateResolution('veo-3.0-generate-001', '9:16', '1080p');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Veo 3 only supports 1080p for 16:9');
    });

    it('should reject 1080p for Veo 2', () => {
      const result = validateResolution('veo-2.0-generate-001', '16:9', '1080p');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Veo 2 only supports 720p');
    });

    it('should reject 4k for Veo 3.1 Lite', () => {
      const result = validateResolution('veo-3.1-lite-generate-preview', '16:9', '4k');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('does not support 4k');
    });

    it('should reject 4k for stable Veo 3.1 Fast', () => {
      const result = validateResolution('veo-3.1-fast-generate-001', '16:9', '4k');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('does not support 4k');
    });

    it.each([
      ['extendVideoId', { extendVideoId: 'projects/test/operations/123' }],
      ['sourceVideo', { sourceVideo: 'file://source.mp4' }],
    ])('should require 720p for video extension using %s', (_feature, config) => {
      const result = validateResolution('veo-3.1-generate-preview', '16:9', '1080p', config);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Video extension requires 720p');
    });

    it.each([
      '1080p',
      '4k',
    ] as const)('should allow %s video extension on supported Vertex Veo 3.1 models', (resolution) => {
      expect(
        validateResolution('veo-3.1-generate-001', '16:9', resolution, {
          extendVideoId: 'projects/test/operations/123',
          vertexai: true,
        }),
      ).toEqual({ valid: true });
    });
  });

  describe('generateVideoCacheKey', () => {
    it('should generate deterministic key', () => {
      const key1 = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 8);
      const key2 = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 8);
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different prompts', () => {
      const key1 = generateVideoCacheKey('prompt1', 'veo-3.1', '16:9', '720p', 8);
      const key2 = generateVideoCacheKey('prompt2', 'veo-3.1', '16:9', '720p', 8);
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different models', () => {
      const key1 = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 8);
      const key2 = generateVideoCacheKey('prompt', 'veo-2', '16:9', '720p', 8);
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different durations', () => {
      const key1 = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 4);
      const key2 = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 8);
      expect(key1).not.toBe(key2);
    });

    it('should include image data in cache key', () => {
      const key1 = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 8, 'imageBase64');
      const key2 = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 8);
      expect(key1).not.toBe(key2);
    });

    it('should include negative prompt in cache key', () => {
      const key1 = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 8, undefined, 'blur');
      const key2 = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 8);
      expect(key1).not.toBe(key2);
    });

    it('should return UUID-like format', () => {
      const key = generateVideoCacheKey('prompt', 'veo-3.1', '16:9', '720p', 8);
      expect(key).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });
  });

  describe('callApi', () => {
    it('should return error when Google AI Studio API key is missing', async () => {
      mockProcessEnv({ GOOGLE_CLOUD_PROJECT: undefined });
      mockProcessEnv({ GOOGLE_PROJECT_ID: undefined });
      mockResolveProjectId.mockRejectedValue(new Error('No project ID found'));
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Google AI Studio');
      expect(result.error).toContain('GOOGLE_API_KEY');
    });

    it('should not fall back to Vertex when Google AI Studio is explicitly selected', async () => {
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          vertexai: false,
          sourceVideo: 'file://source.mp4',
          durationSeconds: 8,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Google AI Studio');
      expect(result.error).toContain('GOOGLE_API_KEY');
      expect(mockResolveProjectId).not.toHaveBeenCalled();
      expect(mockRequest).not.toHaveBeenCalled();
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it('should return error when Vertex project ID is missing and ADC fails', async () => {
      mockProcessEnv({ GOOGLE_CLOUD_PROJECT: undefined });
      mockProcessEnv({ GOOGLE_PROJECT_ID: undefined });
      mockResolveProjectId.mockRejectedValue(new Error('No project ID found'));
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          vertexai: true,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Vertex AI');
      expect(result.error).toContain('GOOGLE_CLOUD_PROJECT');
    });

    it('should resolve project ID from ADC when not explicitly set', async () => {
      mockProcessEnv({ GOOGLE_CLOUD_PROJECT: undefined });
      mockProcessEnv({ GOOGLE_PROJECT_ID: undefined });
      // ADC can resolve the project ID
      mockResolveProjectId.mockResolvedValue('adc-resolved-project');

      const operationName =
        'projects/adc-resolved-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: { name: operationName, done: false },
      });
      // Mock polling - done with video
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: { videos: [{ bytesBase64Encoded: base64Video }] },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');
      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeUndefined();
      expect(mockResolveProjectId).toHaveBeenCalled();
    });

    it('should return error when prompt is empty', async () => {
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');

      const result = await provider.callApi('');

      expect(result.error).toBe('Prompt is required for video generation');
    });

    it('should return error for invalid aspect ratio', async () => {
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          aspectRatio: '4:3' as any,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Invalid aspect ratio');
    });

    it('should return error for invalid duration', async () => {
      const provider = new GoogleVideoProvider('veo-2.0-generate-001', {
        config: {
          durationSeconds: 4,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Invalid duration');
    });

    it.each(
      durationConstrainedConfigs,
    )('should reject a 6-second Veo request using %s before network I/O', async (_feature, config) => {
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          ...config,
          apiKey: 'test-api-key',
          durationSeconds: 6,
          vertexai: false,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('requires durationSeconds: 8');
      expect(mockRequest).not.toHaveBeenCalled();
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it('should reject non-720p video extension before network I/O', async () => {
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          apiKey: 'test-api-key',
          durationSeconds: 8,
          extendVideoId: 'projects/test/operations/123',
          resolution: '1080p',
          vertexai: false,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Video extension requires 720p');
      expect(mockRequest).not.toHaveBeenCalled();
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it('should create video job, poll for completion, and store to blob storage', async () => {
      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      // Base64 encoded MP4 header (simplified for test)
      const base64Video = Buffer.from('fake mp4 video data').toString('base64');

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - not done yet
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
          metadata: { progress: 50 },
        },
      });

      // Mock polling - done with base64 video
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: {
            '@type': 'type.googleapis.com/cloud.ai.large_models.vision.GenerateVideoResponse',
            videos: [{ bytesBase64Encoded: base64Video }],
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          pollIntervalMs: 10,
          maxPollTimeMs: 5000,
        },
      });

      const result = await provider.callApi('A cat playing piano', {
        evaluationId: 'eval-google-video',
        promptIdx: 4,
        testIdx: 3,
      } as unknown as CallApiContextParams);

      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);
      expect(result.output).toContain('[Video:');
      expect(result.output).toContain('promptfoo://blob/');
      expect(result.video).toBeDefined();
      expect(result.video?.format).toBe('mp4');
      expect(result.video?.model).toBe('veo-3.1-generate-preview');
      expect(result.video?.blobRef).toBeDefined();
      expect(result.video?.blobRef?.uri).toContain('promptfoo://blob/');
      expect(result.video?.url).toBe(result.video?.blobRef?.uri); // url matches blobRef.uri
      // 3 requests: job creation, 2 polls (one in progress, one done)
      expect(mockRequest).toHaveBeenCalledTimes(3);
      // Blob storage called once
      expect(mockStoreBlob).toHaveBeenCalledTimes(1);
      expect(mockStoreBlob).toHaveBeenCalledWith(
        expect.any(Buffer),
        'video/mp4',
        expect.objectContaining({
          evalId: 'eval-google-video',
          kind: 'video',
          promptIdx: 4,
          testIdx: 3,
        }),
      );
    });

    it('should create and poll Veo jobs through Google AI Studio with an API key', async () => {
      mockProcessEnv({ GOOGLE_PROJECT_ID: undefined });
      mockProcessEnv({ GOOGLE_API_KEY: 'test-api-key' });

      const operationName = 'models/veo-3.1-generate-preview/operations/test-op';
      const videoUri = 'https://generativelanguage.googleapis.com/v1beta/files/test-video';
      const videoBytes = Buffer.from('fake ai studio video data');
      const sourceVideo = Buffer.from('source video data').toString('base64');

      mockFetchWithTimeout
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ name: operationName, done: false }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              name: operationName,
              done: true,
              response: {
                generateVideoResponse: {
                  generatedSamples: [{ video: { uri: videoUri } }],
                },
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(videoBytes, {
            status: 200,
            headers: { 'Content-Type': 'video/mp4' },
          }),
        );

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          pollIntervalMs: 10,
          maxPollTimeMs: 5000,
          sourceVideo,
        },
      });

      const result = await provider.callApi('A cinematic shot of a lighthouse in a storm', {
        evaluationId: 'eval-google-video-download',
        promptIdx: 9,
        testIdx: 10,
      } as unknown as CallApiContextParams);

      expect(result.error).toBeUndefined();
      expect(result.video?.model).toBe('veo-3.1-generate-preview');
      expect(result.video?.blobRef?.uri).toContain('promptfoo://blob/');
      expect(mockStoreBlob).toHaveBeenCalledWith(
        expect.any(Buffer),
        'video/mp4',
        expect.objectContaining({
          evalId: 'eval-google-video-download',
          kind: 'video',
          promptIdx: 9,
          testIdx: 10,
        }),
      );
      expect(mockResolveProjectId).not.toHaveBeenCalled();
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(3);
      expect(mockFetchWithTimeout).toHaveBeenNthCalledWith(
        1,
        'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-goog-api-key': 'test-api-key',
          }),
        }),
        expect.any(Number),
      );
      expect(mockFetchWithTimeout.mock.calls[0]?.[1]?.body).toContain(
        '"prompt":"A cinematic shot of a lighthouse in a storm"',
      );
      expect(mockFetchWithTimeout.mock.calls[0]?.[1]?.body).toContain('"durationSeconds":8');
      const requestBody = JSON.parse(mockFetchWithTimeout.mock.calls[0]?.[1]?.body as string);
      expect(requestBody.instances[0].video).toEqual({
        encodedVideo: sourceVideo,
        encoding: 'video/mp4',
      });
      expect(mockFetchWithTimeout).toHaveBeenNthCalledWith(
        2,
        'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview/operations/test-op',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-goog-api-key': 'test-api-key',
          }),
        }),
        expect.any(Number),
      );
      expect(mockFetchWithTimeout).toHaveBeenNthCalledWith(
        3,
        videoUri,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-goog-api-key': 'test-api-key',
          }),
        }),
        expect.any(Number),
      );
    });

    it('should handle API error on job creation', async () => {
      mockRequest.mockRejectedValueOnce({
        response: {
          data: {
            error: { message: 'Invalid prompt' },
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Failed to create video job');
      expect(result.error).toContain('Invalid prompt');
    });

    it('should handle polling timeout', async () => {
      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - always not done
      mockRequest.mockResolvedValue({
        data: {
          name: operationName,
          done: false,
          metadata: { progress: 10 },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          pollIntervalMs: 10,
          maxPollTimeMs: 50, // Very short timeout
        },
      });

      vi.useFakeTimers();
      try {
        const resultPromise = provider.callApi('Test prompt');

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.error).toContain('timed out');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle video generation error', async () => {
      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - error
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          error: {
            code: 400,
            message: 'Content policy violation',
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          pollIntervalMs: 10,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Video generation failed');
      expect(result.error).toContain('Content policy violation');
    });

    it('should handle download error for legacy URI format', async () => {
      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      const videoUri = 'https://storage.googleapis.com/video.mp4';

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - done with legacy URI format
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: videoUri } }],
            },
          },
        },
      });

      // Mock video download - error
      mockRequest.mockRejectedValueOnce({
        message: 'Network error',
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          pollIntervalMs: 10,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Download error');
    });

    it('should include config options in API request', async () => {
      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - done
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: base64Video }],
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          aspectRatio: '9:16',
          resolution: '720p',
          durationSeconds: 4,
          negativePrompt: 'blur, noise',
          personGeneration: 'dont_allow',
          seed: 12345,
          pollIntervalMs: 10,
        },
      });

      await provider.callApi('Test prompt');

      // First call is job creation
      expect(mockRequest).toHaveBeenCalled();
      const firstCallOptions = mockRequest.mock.calls[0][0];
      const body = JSON.parse(firstCallOptions.body);

      expect(body.instances[0].aspectRatio).toBe('9:16');
      expect(body.instances[0].resolution).toBe('720p');
      expect(body.instances[0].durationSeconds).toBe('4');
      expect(body.instances[0].negativePrompt).toBe('blur, noise');
      expect(body.instances[0].personGeneration).toBe('dont_allow');
      expect(body.instances[0].seed).toBe(12345);
    });

    it('should include video extension in request', async () => {
      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      // Mock job creation (POST)
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling (POST) - returns done with video
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: base64Video }],
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          extendVideoId: 'previous-operation-id',
          pollIntervalMs: 10,
        },
      });

      const result = await provider.callApi('Continue the video');

      expect(mockRequest).toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);

      // Should include video extension in request
      const firstCallOptions = mockRequest.mock.calls[0][0];
      const body = JSON.parse(firstCallOptions.body);
      expect(body.instances[0].video).toEqual({ operationName: 'previous-operation-id' });
    });

    it('should handle blob storage deduplication', async () => {
      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      // Mock deduplicated blob storage response
      mockStoreBlob.mockResolvedValueOnce({
        ref: {
          uri: 'promptfoo://blob/existinghash123',
          hash: 'existinghash123',
          mimeType: 'video/mp4',
          sizeBytes: 1024,
          provider: 'filesystem',
        },
        deduplicated: true,
      });

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - done
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: base64Video }],
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          pollIntervalMs: 10,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeUndefined();
      expect(result.video?.blobRef?.hash).toBe('existinghash123');
    });
  });

  describe('image-to-video', () => {
    it('should include image data in request', async () => {
      const image = 'file:///path/to/image.png';
      const expectedImagePath = resolveTestFileRef(image);
      vi.mocked(fs.existsSync).mockImplementation((candidate) => candidate === expectedImagePath);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data'));

      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - done
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: base64Video }],
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          image,
          pollIntervalMs: 10,
        },
      });

      await provider.callApi('Animate this image');

      const firstCallOptions = mockRequest.mock.calls[0][0];
      const body = JSON.parse(firstCallOptions.body);

      expect(body.instances[0].image).toEqual({
        imageBytes: 'ZmFrZS1pbWFnZS1kYXRh', // base64 of 'fake-image-data'
        mimeType: 'image/png',
      });
    });

    it('should return error for missing image file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          image: 'file:///path/to/missing.png',
        },
      });

      const result = await provider.callApi('Animate this image');

      expect(result.error).toContain('Image file not found');
    });
  });

  describe('reference images (Veo 3.1)', () => {
    it('should include reference images in request', async () => {
      const referenceImages = [
        { image: 'file:///path/to/ref1.png', referenceType: 'asset' as const },
        { image: 'file:///path/to/ref2.png', referenceType: 'asset' as const },
      ];
      const expectedReferencePaths = new Set(
        referenceImages.map(({ image }) => resolveTestFileRef(image)),
      );
      vi.mocked(fs.existsSync).mockImplementation((candidate) =>
        expectedReferencePaths.has(candidate.toString()),
      );
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('ref-image-data'));

      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - done with base64 video
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: base64Video }],
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          referenceImages,
          pollIntervalMs: 10,
        },
      });

      await provider.callApi('Generate with references');

      const firstCallOptions = mockRequest.mock.calls[0][0];
      const body = JSON.parse(firstCallOptions.body);

      expect(body.instances[0].referenceImages).toHaveLength(2);
      expect(body.instances[0].referenceImages[0].referenceType).toBe('asset');
    });

    it('should limit reference images to 3', async () => {
      const referenceImages = [
        { image: 'file:///path/to/ref1.png', referenceType: 'asset' as const },
        { image: 'file:///path/to/ref2.png', referenceType: 'asset' as const },
        { image: 'file:///path/to/ref3.png', referenceType: 'asset' as const },
        { image: 'file:///path/to/ref4.png', referenceType: 'asset' as const },
      ];
      const expectedReferencePaths = new Set(
        referenceImages.map(({ image }) => resolveTestFileRef(image)),
      );
      vi.mocked(fs.existsSync).mockImplementation((candidate) =>
        expectedReferencePaths.has(candidate.toString()),
      );
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('ref-image-data'));

      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - done with base64 video
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: base64Video }],
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          referenceImages,
          pollIntervalMs: 10,
        },
      });

      await provider.callApi('Generate with references');

      expect(mockRequest).toHaveBeenCalled();
      const firstCallOptions = mockRequest.mock.calls[0][0];
      const body = JSON.parse(firstCallOptions.body);

      expect(body.instances[0].referenceImages).toHaveLength(3);
    });
  });

  describe('interpolation (Veo 3.1)', () => {
    it('should include last frame in request', async () => {
      const image = 'file:///path/to/first.png';
      const lastFrame = 'file:///path/to/last.png';
      const expectedFramePaths = new Set(
        [image, lastFrame].map((fileRef) => resolveTestFileRef(fileRef)),
      );
      vi.mocked(fs.existsSync).mockImplementation((candidate) =>
        expectedFramePaths.has(candidate.toString()),
      );
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('frame-data'));

      const operationName =
        'projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      // Mock job creation
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: false,
        },
      });

      // Mock polling - done with base64 video
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: base64Video }],
          },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          image,
          lastFrame,
          pollIntervalMs: 10,
        },
      });

      await provider.callApi('Interpolate between frames');

      const firstCallOptions = mockRequest.mock.calls[0][0];
      const body = JSON.parse(firstCallOptions.body);

      expect(body.instances[0].image).toBeDefined();
      expect(body.instances[0].lastFrame).toBeDefined();
    });

    it('should support lastImage alias for interpolation', async () => {
      const image = 'file:///path/to/first.png';
      const lastImage = 'file:///path/to/last.png';
      const expectedFramePaths = new Set(
        [image, lastImage].map((fileRef) => resolveTestFileRef(fileRef)),
      );
      vi.mocked(fs.existsSync).mockImplementation((candidate) =>
        expectedFramePaths.has(candidate.toString()),
      );
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('frame-data'));

      const operationName = 'test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      mockRequest.mockResolvedValueOnce({
        data: { name: operationName, done: false },
      });
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: { videos: [{ bytesBase64Encoded: base64Video }] },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          image,
          lastImage,
          pollIntervalMs: 10,
        },
      });

      await provider.callApi('Interpolate');

      const firstCallOptions = mockRequest.mock.calls[0][0];
      const body = JSON.parse(firstCallOptions.body);

      expect(body.instances[0].lastFrame).toBeDefined();
    });

    it('should support sourceVideo alias for extension', async () => {
      const operationName = 'test-op';
      const base64Video = Buffer.from('fake video').toString('base64');

      mockRequest.mockResolvedValueOnce({
        data: { name: operationName, done: false },
      });
      mockRequest.mockResolvedValueOnce({
        data: {
          name: operationName,
          done: true,
          response: { videos: [{ bytesBase64Encoded: base64Video }] },
        },
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          sourceVideo: 'previous-op-id',
          pollIntervalMs: 10,
        },
      });

      await provider.callApi('Extend');

      const firstCallOptions = mockRequest.mock.calls[0][0];
      const body = JSON.parse(firstCallOptions.body);

      expect(body.instances[0].video).toEqual({ operationName: 'previous-op-id' });
    });
  });
});
