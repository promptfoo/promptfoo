import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import {
  OpenAiVideoProvider,
  SORA_COSTS,
  calculateVideoCost,
  checkVideoCache,
  generateVideoCacheKey,
  getVideoApiPath,
  validateVideoSize,
  validateVideoSeconds,
} from '../../../src/providers/openai/video';

// Hoist mock functions so they're available in vi.mock factories
const { mockFetchWithProxy } = vi.hoisted(() => ({
  mockFetchWithProxy: vi.fn(),
}));

// Mock the dependencies
vi.mock('fs');
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234-5678-9012-345678901234'),
}));
vi.mock('../../../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn(() => '/mock/.promptfoo'),
}));
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logRequestResponse: vi.fn(),
}));
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: mockFetchWithProxy,
}));

describe('OpenAiVideoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithProxy.mockReset();
    // Default: no cached video exists, directory operations succeed
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
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
      expect(result.message).toContain('1920x1080');
    });

    it('should reject non-standard sizes', () => {
      const result = validateVideoSize('500x500');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateVideoSeconds', () => {
    it('should accept 4 seconds', () => {
      expect(validateVideoSeconds(4)).toEqual({ valid: true });
    });

    it('should accept 8 seconds', () => {
      expect(validateVideoSeconds(8)).toEqual({ valid: true });
    });

    it('should accept 12 seconds', () => {
      expect(validateVideoSeconds(12)).toEqual({ valid: true });
    });

    it('should reject invalid duration like 5 seconds', () => {
      const result = validateVideoSeconds(5);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid video duration');
      expect(result.message).toContain('5');
      expect(result.message).toContain('4, 8, 12');
    });

    it('should reject 10 seconds', () => {
      const result = validateVideoSeconds(10);
      expect(result.valid).toBe(false);
    });

    it('should reject 0 seconds', () => {
      const result = validateVideoSeconds(0);
      expect(result.valid).toBe(false);
    });
  });

  describe('calculateVideoCost', () => {
    it('should calculate cost for sora-2', () => {
      // $0.10 per second * 10 seconds = $1.00
      expect(calculateVideoCost('sora-2', 10)).toBe(1.0);
    });

    it('should calculate cost for sora-2-pro', () => {
      // $0.30 per second * 10 seconds = $3.00
      expect(calculateVideoCost('sora-2-pro', 10)).toBe(3.0);
    });

    it('should return 0 for cached results', () => {
      expect(calculateVideoCost('sora-2', 10, true)).toBe(0);
      expect(calculateVideoCost('sora-2-pro', 10, true)).toBe(0);
    });

    it('should calculate cost for different durations', () => {
      expect(calculateVideoCost('sora-2', 5)).toBe(0.5);
      expect(calculateVideoCost('sora-2', 20)).toBe(2.0);
    });
  });

  describe('getVideoApiPath', () => {
    it('should generate correct API path for video', () => {
      const path = getVideoApiPath('abc-123', 'video');
      expect(path).toBe('/api/output/video/abc-123/video.mp4');
    });

    it('should generate correct API path for thumbnail', () => {
      const path = getVideoApiPath('abc-123', 'thumbnail');
      expect(path).toBe('/api/output/video/abc-123/thumbnail.webp');
    });

    it('should generate correct API path for spritesheet', () => {
      const path = getVideoApiPath('abc-123', 'spritesheet');
      expect(path).toBe('/api/output/video/abc-123/spritesheet.jpg');
    });
  });

  describe('SORA_COSTS', () => {
    it('should have correct cost for sora-2', () => {
      expect(SORA_COSTS['sora-2']).toBe(0.1);
    });

    it('should have correct cost for sora-2-pro', () => {
      expect(SORA_COSTS['sora-2-pro']).toBe(0.3);
    });
  });

  describe('provider id', () => {
    it('should return correct provider ID', () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });
      expect(provider.id()).toBe('openai:video:sora-2');
    });

    it('should use custom ID if provided', () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
        id: 'custom-video-provider',
      });
      expect(provider.id()).toBe('custom-video-provider');
    });
  });

  describe('toString', () => {
    it('should return correct string representation', () => {
      const provider = new OpenAiVideoProvider('sora-2-pro', {
        config: { apiKey: 'test-key' },
      });
      expect(provider.toString()).toBe('[OpenAI Video Provider sora-2-pro]');
    });
  });

  describe('callApi', () => {
    const setupMocksForSuccess = () => {
      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'queued', progress: 0 }),
      });

      // Mock polling - completed
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'completed', progress: 100 }),
      });

      // Mock video download
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock thumbnail download
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      // Mock spritesheet download
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(75),
      });
    };

    it('should create video job and poll for completion', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      setupMocksForSuccess();

      const prompt = 'A cat riding a skateboard';
      const result = await provider.callApi(prompt);

      expect(result.error).toBeUndefined();
      expect(result.video).toBeDefined();
      expect(result.video?.id).toBe('video_123');
      expect(result.video?.format).toBe('mp4');
      // UUID should now be a deterministic cache key based on inputs
      const expectedCacheKey = generateVideoCacheKey(prompt, 'sora-2', '1280x720', 8);
      expect(result.video?.uuid).toBe(expectedCacheKey);
      expect(result.video?.url).toContain('/api/output/video/');
      expect(result.video?.thumbnail).toContain('thumbnail.webp');
      expect(result.video?.spritesheet).toContain('spritesheet.jpg');
      expect(result.cost).toBeGreaterThan(0);
    });

    it('should handle invalid video size', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', size: '1920x1080' as any },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Invalid video size');
    });

    it('should handle job creation failure', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid prompt' } }),
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Invalid prompt');
    });

    it('should handle job failed status', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'queued' }),
      });

      // Mock polling - failed
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'video_123',
          status: 'failed',
          error: { message: 'Content policy violation' },
        }),
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Content policy violation');
    });

    it('should handle polling timeout', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'test-key',
          poll_interval_ms: 10,
          max_poll_time_ms: 50,
        },
      });

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'queued' }),
      });

      // Always return in_progress to trigger timeout
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'in_progress', progress: 10 }),
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('timed out');
    });

    it('should throw error if API key is not set', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const provider = new OpenAiVideoProvider('sora-2');

        await expect(provider.callApi('test prompt')).rejects.toThrow('OpenAI API key is not set');
      } finally {
        process.env.OPENAI_API_KEY = originalEnv;
      }
    });

    it('should handle video download failure', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'queued' }),
      });

      // Mock polling - completed
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'completed', progress: 100 }),
      });

      // Mock video download failure
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Failed to download video');
    });

    it('should use default model sora-2 when not specified', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      setupMocksForSuccess();

      const result = await provider.callApi('test prompt');

      // Verify the first fetch call (job creation) includes sora-2 model
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        expect.stringContaining('/videos'),
        expect.objectContaining({
          body: expect.stringContaining('"model":"sora-2"'),
        }),
      );
      expect(result.video?.model).toBe('sora-2');
    });

    it('should use specified size and seconds', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', size: '720x1280', seconds: 12 },
      });

      setupMocksForSuccess();

      const result = await provider.callApi('test prompt');

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        expect.stringContaining('/videos'),
        expect.objectContaining({
          body: expect.stringContaining('"size":"720x1280"'),
        }),
      );
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        expect.stringContaining('/videos'),
        expect.objectContaining({
          body: expect.stringContaining('"seconds":"12"'),
        }),
      );
      expect(result.video?.size).toBe('720x1280');
      expect(result.video?.duration).toBe(12);
    });

    it('should skip thumbnail download when disabled', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', download_thumbnail: false },
      });

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'queued' }),
      });

      // Mock polling - completed
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'completed', progress: 100 }),
      });

      // Mock video download
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock spritesheet download
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(75),
      });

      const result = await provider.callApi('test prompt');

      expect(result.video?.thumbnail).toBeUndefined();
      expect(result.video?.spritesheet).toBeDefined();
    });

    it('should skip spritesheet download when disabled', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', download_spritesheet: false },
      });

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'queued' }),
      });

      // Mock polling - completed
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'completed', progress: 100 }),
      });

      // Mock video download
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock thumbnail download
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      const result = await provider.callApi('test prompt');

      expect(result.video?.thumbnail).toBeDefined();
      expect(result.video?.spritesheet).toBeUndefined();
    });

    it('should continue even if thumbnail/spritesheet download fails', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      // Mock job creation
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'queued' }),
      });

      // Mock polling - completed
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_123', status: 'completed', progress: 100 }),
      });

      // Mock video download - success
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock thumbnail download - failure
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      // Mock spritesheet download - failure
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await provider.callApi('test prompt');

      // Should still succeed, just without thumbnail/spritesheet
      expect(result.error).toBeUndefined();
      expect(result.video).toBeDefined();
      expect(result.video?.thumbnail).toBeUndefined();
      expect(result.video?.spritesheet).toBeUndefined();
    });

    it('should sanitize prompt in output', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      setupMocksForSuccess();

      const result = await provider.callApi('Test [prompt] with\nnewlines');

      expect(result.output).toContain('Test (prompt) with newlines');
    });
  });

  describe('generateVideoCacheKey', () => {
    it('should generate deterministic cache key for same inputs', () => {
      const key1 = generateVideoCacheKey('test prompt', 'sora-2', '1280x720', 8);
      const key2 = generateVideoCacheKey('test prompt', 'sora-2', '1280x720', 8);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different prompts', () => {
      const key1 = generateVideoCacheKey('prompt one', 'sora-2', '1280x720', 8);
      const key2 = generateVideoCacheKey('prompt two', 'sora-2', '1280x720', 8);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different models', () => {
      const key1 = generateVideoCacheKey('test prompt', 'sora-2', '1280x720', 8);
      const key2 = generateVideoCacheKey('test prompt', 'sora-2-pro', '1280x720', 8);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different sizes', () => {
      const key1 = generateVideoCacheKey('test prompt', 'sora-2', '1280x720', 8);
      const key2 = generateVideoCacheKey('test prompt', 'sora-2', '720x1280', 8);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different durations', () => {
      const key1 = generateVideoCacheKey('test prompt', 'sora-2', '1280x720', 4);
      const key2 = generateVideoCacheKey('test prompt', 'sora-2', '1280x720', 8);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys with and without input_reference', () => {
      const key1 = generateVideoCacheKey('test prompt', 'sora-2', '1280x720', 8);
      const key2 = generateVideoCacheKey('test prompt', 'sora-2', '1280x720', 8, 'base64imagedata');

      expect(key1).not.toBe(key2);
    });

    it('should return UUID-formatted string', () => {
      const key = generateVideoCacheKey('test prompt', 'sora-2', '1280x720', 8);

      // Should match UUID-like format: 8-4-4-4-12 hex characters
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('checkVideoCache', () => {
    it('should return true if video file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = checkVideoCache('test-cache-key');

      expect(result).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('test-cache-key/video.mp4'),
      );
    });

    it('should return false if video file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = checkVideoCache('nonexistent-key');

      expect(result).toBe(false);
    });
  });

  describe('caching behavior', () => {
    it('should return cached result when video already exists', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      // Mock fs.existsSync to return true for video file (cache hit)
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await provider.callApi('cached video prompt');

      // Should not make any API calls
      expect(mockFetchWithProxy).not.toHaveBeenCalled();

      // Should return cached response
      expect(result.cached).toBe(true);
      expect(result.cost).toBe(0);
      expect(result.latencyMs).toBe(0);
      expect(result.video).toBeDefined();
      expect(result.video?.url).toContain('/api/output/video/');
      expect(result.video?.format).toBe('mp4');
      expect(result.video?.model).toBe('sora-2');
    });

    it('should include thumbnail path in cached result if thumbnail exists', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      // Mock fs.existsSync to return true for all files
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await provider.callApi('cached video with assets');

      expect(result.cached).toBe(true);
      expect(result.video?.thumbnail).toContain('thumbnail.webp');
      expect(result.video?.spritesheet).toContain('spritesheet.jpg');
    });

    it('should not include thumbnail in cached result if it does not exist', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      // Mock fs.existsSync to return true only for video, false for thumbnail/spritesheet
      vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.includes('video.mp4')) {
          return true;
        }
        return false;
      });

      const result = await provider.callApi('cached video without extras');

      expect(result.cached).toBe(true);
      expect(result.video?.thumbnail).toBeUndefined();
      expect(result.video?.spritesheet).toBeUndefined();
    });

    it('should use deterministic cache key based on prompt and config', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', size: '720x1280', seconds: 4 },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await provider.callApi('specific prompt');

      // The cache key should be deterministic based on the inputs
      const expectedCacheKey = generateVideoCacheKey(
        'specific prompt',
        'sora-2',
        '720x1280',
        4,
        undefined,
      );

      expect(result.video?.uuid).toBe(expectedCacheKey);
    });

    it('should skip caching for remix operations', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', remix_video_id: 'existing_video_123' },
      });

      // Even though fs.existsSync returns true, remix should not use cache
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Setup mocks for API calls (remix should make API calls)
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'remixed_video', status: 'queued' }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'remixed_video', status: 'completed', progress: 100 }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(75),
      });

      const result = await provider.callApi('remix this video with new style');

      // Should make API calls (not use cache)
      expect(mockFetchWithProxy).toHaveBeenCalled();
      expect(result.cached).toBe(false);
    });
  });

  describe('input_reference (image-to-video)', () => {
    it('should include input_reference in request body for base64 data', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', input_reference: 'base64EncodedImageData' },
      });

      // Need cache miss for this test
      vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
        const pathStr = path.toString();
        // Return false for cache check (video file), true for directory creation
        return !pathStr.includes('video.mp4');
      });

      // Setup mocks for success
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_img2vid', status: 'queued' }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_img2vid', status: 'completed', progress: 100 }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(75),
      });

      await provider.callApi('Animate this image');

      // Verify the request body includes input_reference
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        expect.stringContaining('/videos'),
        expect.objectContaining({
          body: expect.stringContaining('"input_reference":"base64EncodedImageData"'),
        }),
      );
    });

    it('should read and base64 encode file when input_reference starts with file://', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', input_reference: 'file:///path/to/image.png' },
      });

      // Mock file system for reading the image file
      vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr === '/path/to/image.png') {
          return true;
        }
        // Return false for cache check (video file)
        return !pathStr.includes('video.mp4');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake image data'));

      // Setup mocks for success
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_from_file', status: 'queued' }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_from_file', status: 'completed', progress: 100 }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(75),
      });

      await provider.callApi('Animate this file');

      // Verify the file was read
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/image.png');

      // Verify the request body includes base64 encoded data
      const expectedBase64 = Buffer.from('fake image data').toString('base64');
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        expect.stringContaining('/videos'),
        expect.objectContaining({
          body: expect.stringContaining(`"input_reference":"${expectedBase64}"`),
        }),
      );
    });

    it('should return error if input_reference file does not exist', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', input_reference: 'file:///nonexistent/image.png' },
      });

      // Mock file system - file does not exist
      vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr === '/nonexistent/image.png') {
          return false;
        }
        // Return false for cache check too
        return !pathStr.includes('video.mp4');
      });

      const result = await provider.callApi('Animate nonexistent file');

      expect(result.error).toContain('Input reference file not found');
      expect(result.error).toContain('/nonexistent/image.png');
    });

    it('should generate different cache keys for same prompt with different input_reference', async () => {
      const key1 = generateVideoCacheKey('animate', 'sora-2', '1280x720', 8, 'imageDataA');
      const key2 = generateVideoCacheKey('animate', 'sora-2', '1280x720', 8, 'imageDataB');

      expect(key1).not.toBe(key2);
    });
  });

  describe('remix_video_id', () => {
    it('should use remix endpoint when remix_video_id is provided', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', remix_video_id: 'original_video_456' },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Setup mocks for remix
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'remixed_video', status: 'queued' }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'remixed_video', status: 'completed', progress: 100 }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(75),
      });

      await provider.callApi('Make it more colorful');

      // Verify the remix endpoint was called
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        expect.stringContaining('/videos/original_video_456/remix'),
        expect.any(Object),
      );
    });

    it('should not include size and seconds in remix request', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'test-key',
          remix_video_id: 'original_video_789',
          size: '720x1280',
          seconds: 12,
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Setup mocks for remix
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'remixed_video', status: 'queued' }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'remixed_video', status: 'completed', progress: 100 }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(75),
      });

      await provider.callApi('Change the style');

      // Get the first call (job creation for remix)
      const [, options] = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(options.body);

      // Remix requests should not include size and seconds
      expect(body.size).toBeUndefined();
      expect(body.seconds).toBeUndefined();
      // But should include model and prompt
      expect(body.model).toBe('sora-2');
      expect(body.prompt).toBe('Change the style');
    });

    it('should use random UUID for remix output (not deterministic cache key)', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', remix_video_id: 'original_video_abc' },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Setup mocks
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'remixed_video', status: 'queued' }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'remixed_video', status: 'completed', progress: 100 }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(75),
      });

      const result = await provider.callApi('Remix prompt');

      // Should use the random UUID from the mock, not a deterministic hash
      expect(result.video?.uuid).toBe('test-uuid-1234-5678-9012-345678901234');
    });
  });
});
