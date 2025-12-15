import { Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import {
  GoogleVideoProvider,
  generateVideoCacheKey,
  checkVideoCache,
  getVideoApiPath,
  getVideoFilePath,
  validateAspectRatio,
  validateDuration,
  validateResolution,
} from '../../../src/providers/google/video';
import { fetchWithProxy } from '../../../src/util/fetch/index';

vi.mock('fs');
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn().mockReturnValue('/mock/.promptfoo'),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockFetchWithProxy = fetchWithProxy as Mock;

describe('GoogleVideoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_API_KEY = 'test-api-key';
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    // Default mock for fs.existsSync - no cache
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  afterEach(() => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
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

  describe('checkVideoCache', () => {
    it('should return true when video file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(checkVideoCache('test-uuid')).toBe(true);
    });

    it('should return false when video file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(checkVideoCache('test-uuid')).toBe(false);
    });
  });

  describe('getVideoFilePath', () => {
    it('should return correct file path', () => {
      const path = getVideoFilePath('test-uuid');
      expect(path).toBe('/mock/.promptfoo/output/video/test-uuid/video.mp4');
    });
  });

  describe('getVideoApiPath', () => {
    it('should return correct API path', () => {
      const path = getVideoApiPath('test-uuid');
      expect(path).toBe('/api/output/video/test-uuid/video.mp4');
    });
  });

  describe('callApi', () => {
    it('should return error when API key is missing', async () => {
      delete process.env.GOOGLE_API_KEY;
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Google API key is not set');
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

    it('should return cached result when video exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');

      const result = await provider.callApi('Test prompt');

      expect(result.cached).toBe(true);
      expect(result.cost).toBe(0);
      expect(result.latencyMs).toBe(0);
      expect(result.output).toContain('[Video:');
      expect(result.video).toBeDefined();
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should create video job and poll for completion', async () => {
      const operationName = 'operations/test-operation-id';
      const videoUri = 'https://storage.googleapis.com/video.mp4';

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: operationName,
          done: false,
        }),
      });

      // Mock polling - not done yet
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: operationName,
          done: false,
          metadata: { progress: 50 },
        }),
      });

      // Mock polling - done
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: operationName,
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: videoUri } }],
            },
          },
        }),
      });

      // Mock video download
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
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
      expect(result.video).toBeDefined();
      expect(result.video?.format).toBe('mp4');
      expect(result.video?.model).toBe('veo-3.1-generate-preview');
      expect(mockFetchWithProxy).toHaveBeenCalledTimes(4);
    });

    it('should handle API error on job creation', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: { message: 'Invalid prompt' },
        }),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('API error 400');
      expect(result.error).toContain('Invalid prompt');
    });

    it('should handle polling timeout', async () => {
      const operationName = 'operations/test-operation-id';

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: operationName,
          done: false,
        }),
      });

      // Mock polling - always not done
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({
          name: operationName,
          done: false,
          metadata: { progress: 10 },
        }),
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
      const operationName = 'operations/test-operation-id';

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: operationName,
          done: false,
        }),
      });

      // Mock polling - error
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: operationName,
          done: true,
          error: {
            code: 400,
            message: 'Content policy violation',
          },
        }),
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

    it('should handle download error', async () => {
      const operationName = 'operations/test-operation-id';
      const videoUri = 'https://storage.googleapis.com/video.mp4';

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: operationName,
          done: false,
        }),
      });

      // Mock polling - done
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: operationName,
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: videoUri } }],
            },
          },
        }),
      });

      // Mock video download - error
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          pollIntervalMs: 10,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Failed to download video');
    });

    it('should include config options in API request', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: 'https://storage.googleapis.com/video.mp4' } }],
            },
          },
        }),
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          aspectRatio: '9:16',
          resolution: '720p',
          durationSeconds: 4,
          negativePrompt: 'blur, noise',
          personGeneration: 'dont_allow',
          seed: 12345,
        },
      });

      await provider.callApi('Test prompt');

      const [, options] = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.instances[0].aspectRatio).toBe('9:16');
      expect(body.instances[0].resolution).toBe('720p');
      expect(body.instances[0].durationSeconds).toBe('4');
      expect(body.instances[0].negativePrompt).toBe('blur, noise');
      expect(body.instances[0].personGeneration).toBe('dont_allow');
      expect(body.instances[0].seed).toBe(12345);
    });

    it('should skip cache for video extension', async () => {
      // Reset mocks and set up for this specific test
      vi.mocked(fs.existsSync).mockReset();

      // When extendVideoId is set, cache is skipped entirely
      // existsSync will be called for:
      // 1. Creating output directory - return false so it creates it
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const videoUri = 'https://storage.googleapis.com/video.mp4';

      // Mock job creation (POST)
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: false,
        }),
      });

      // Mock polling (GET) - returns done with video
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: videoUri } }],
            },
          },
        }),
      });

      // Mock download
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          extendVideoId: 'previous-operation-id',
          pollIntervalMs: 10,
        },
      });

      const result = await provider.callApi('Continue the video');

      // Should NOT return cached result - fetch should have been called
      expect(mockFetchWithProxy).toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);

      // Should include video extension in request
      const [, options] = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.instances[0].video).toEqual({ operationName: 'previous-operation-id' });
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

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: 'https://storage.googleapis.com/video.mp4' } }],
            },
          },
        }),
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          image: 'file:///path/to/image.png',
        },
      });

      await provider.callApi('Animate this image');

      const [, options] = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(options.body);

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

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: 'https://storage.googleapis.com/video.mp4' } }],
            },
          },
        }),
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          referenceImages: [
            { image: 'file:///path/to/ref1.png', referenceType: 'asset' },
            { image: 'file:///path/to/ref2.png', referenceType: 'asset' },
          ],
        },
      });

      await provider.callApi('Generate with references');

      const [, options] = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.instances[0].referenceImages).toHaveLength(2);
      expect(body.instances[0].referenceImages[0].referenceType).toBe('asset');
    });

    it('should limit reference images to 3', async () => {
      vi.mocked(fs.existsSync).mockReset();
      // Return true only for the reference image file paths, false for cache check
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('/path/to/ref')) {
          return true; // Reference image files exist
        }
        if (pathStr.includes('video.mp4')) {
          return false; // No cache hit
        }
        return false; // Output directory doesn't exist
      });
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('ref-image-data'));

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: 'https://storage.googleapis.com/video.mp4' } }],
            },
          },
        }),
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          referenceImages: [
            { image: 'file:///path/to/ref1.png', referenceType: 'asset' },
            { image: 'file:///path/to/ref2.png', referenceType: 'asset' },
            { image: 'file:///path/to/ref3.png', referenceType: 'asset' },
            { image: 'file:///path/to/ref4.png', referenceType: 'asset' }, // Should be ignored
          ],
        },
      });

      await provider.callApi('Generate with references');

      expect(mockFetchWithProxy).toHaveBeenCalled();
      const [, options] = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(options.body);

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

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: 'https://storage.googleapis.com/video.mp4' } }],
            },
          },
        }),
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          image: 'file:///path/to/first.png',
          lastFrame: 'file:///path/to/last.png',
        },
      });

      await provider.callApi('Interpolate between frames');

      const [, options] = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.instances[0].image).toBeDefined();
      expect(body.instances[0].lastFrame).toBeDefined();
    });
  });

  describe('API key handling', () => {
    it('should use GOOGLE_API_KEY', async () => {
      process.env.GOOGLE_API_KEY = 'google-key';

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: 'https://storage.googleapis.com/video.mp4' } }],
            },
          },
        }),
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');
      await provider.callApi('Test');

      const [, options] = mockFetchWithProxy.mock.calls[0];
      expect(options.headers['x-goog-api-key']).toBe('google-key');
    });

    it('should use GEMINI_API_KEY as fallback', async () => {
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'gemini-key';

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: 'https://storage.googleapis.com/video.mp4' } }],
            },
          },
        }),
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview');
      await provider.callApi('Test');

      const [, options] = mockFetchWithProxy.mock.calls[0];
      expect(options.headers['x-goog-api-key']).toBe('gemini-key');
    });

    it('should use config apiKey over environment', async () => {
      process.env.GOOGLE_API_KEY = 'env-key';

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/test',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: 'https://storage.googleapis.com/video.mp4' } }],
            },
          },
        }),
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
        config: {
          apiKey: 'config-key',
        },
      });
      await provider.callApi('Test');

      const [, options] = mockFetchWithProxy.mock.calls[0];
      expect(options.headers['x-goog-api-key']).toBe('config-key');
    });
  });
});
