import * as fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleVideoProvider,
  generateVideoCacheKey,
  validateAspectRatio,
  validateDuration,
  validateResolution,
} from '../../../src/providers/google/video';

// Mock the Google client
const mockRequest = vi.fn();
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
vi.mock('../../../src/providers/google/util', () => ({
  getGoogleClient: () => mockGetGoogleClient(),
  loadCredentials: vi.fn((creds) => creds),
  resolveProjectId: (...args: unknown[]) => mockResolveProjectId(...args),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GoogleVideoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest.mockReset();
    mockStoreBlob.mockReset();
    mockResolveProjectId.mockReset();
    mockResolveProjectId.mockResolvedValue('test-project');
    process.env.GOOGLE_PROJECT_ID = 'test-project';
    delete process.env.VERTEX_PROJECT_ID;

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
    delete process.env.GOOGLE_PROJECT_ID;
    delete process.env.VERTEX_PROJECT_ID;
    // Reset fs mocks to prevent leakage between tests
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
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
      expect(validateDuration('veo-3-generate', 4)).toEqual({ valid: true });
      expect(validateDuration('veo-3-generate', 6)).toEqual({ valid: true });
      expect(validateDuration('veo-3-generate', 8)).toEqual({ valid: true });
    });

    it('should accept 5, 6, 8 for Veo 2', () => {
      expect(validateDuration('veo-2-generate', 5)).toEqual({ valid: true });
      expect(validateDuration('veo-2-generate', 6)).toEqual({ valid: true });
      expect(validateDuration('veo-2-generate', 8)).toEqual({ valid: true });
    });

    it('should reject 5 for Veo 3', () => {
      const result = validateDuration('veo-3.1-generate-preview', 5);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid duration');
    });

    it('should reject 4 for Veo 2', () => {
      const result = validateDuration('veo-2-generate', 4);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid duration');
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
      const result = validateResolution('veo-3-generate', '9:16', '1080p');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Veo 3 only supports 1080p for 16:9');
    });

    it('should reject 1080p for Veo 2', () => {
      const result = validateResolution('veo-2-generate', '16:9', '1080p');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Veo 2 only supports 720p');
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
    it('should return error when project ID is missing and ADC fails', async () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GOOGLE_PROJECT_ID;
      // Mock ADC resolution to fail (simulating no credentials configured)
      mockResolveProjectId.mockRejectedValue(new Error('No project ID found'));
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Google Veo video generation requires Vertex AI');
      expect(result.error).toContain('GOOGLE_CLOUD_PROJECT');
    });

    it('should resolve project ID from ADC when not explicitly set', async () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GOOGLE_PROJECT_ID;
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
      const provider = new GoogleVideoProvider('veo-2-generate', {
        config: {
          durationSeconds: 4,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Invalid duration');
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

      const result = await provider.callApi('A cat playing piano');

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
        expect.objectContaining({ kind: 'video' }),
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

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('timed out');
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
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/path/to/image.png') {
          return true;
        }
        return false;
      });
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
          image: 'file:///path/to/image.png',
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
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/path/to/ref1.png' || path === '/path/to/ref2.png') {
          return true;
        }
        return false;
      });
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
          referenceImages: [
            { image: 'file:///path/to/ref1.png', referenceType: 'asset' },
            { image: 'file:///path/to/ref2.png', referenceType: 'asset' },
          ],
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
      vi.mocked(fs.existsSync).mockReset();
      // Return true only for the reference image file paths
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('/path/to/ref')) {
          return true; // Reference image files exist
        }
        return false;
      });
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
          referenceImages: [
            { image: 'file:///path/to/ref1.png', referenceType: 'asset' },
            { image: 'file:///path/to/ref2.png', referenceType: 'asset' },
            { image: 'file:///path/to/ref3.png', referenceType: 'asset' },
            { image: 'file:///path/to/ref4.png', referenceType: 'asset' }, // Should be ignored
          ],
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
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/path/to/first.png' || path === '/path/to/last.png') {
          return true;
        }
        return false;
      });
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
          image: 'file:///path/to/first.png',
          lastFrame: 'file:///path/to/last.png',
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
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/path/to/first.png' || path === '/path/to/last.png') {
          return true;
        }
        return false;
      });
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
          image: 'file:///path/to/first.png',
          lastImage: 'file:///path/to/last.png',
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
