import fsPromises from 'fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateVideoCost,
  OpenAiVideoProvider,
  SORA_COSTS,
  validateVideoSeconds,
  validateVideoSize,
} from '../../../src/providers/openai/video';
import { checkVideoCache, generateVideoCacheKey } from '../../../src/providers/video';
import { mockProcessEnv } from '../../util/utils';
import { getOpenAiMissingApiKeyMessage } from './shared';

// Hoist mock functions so they're available in vi.mock factories
const {
  mockFetchWithProxy,
  mockStoreMedia,
  mockMediaExists,
  mockGetMediaStorage,
  mockGetConfigDirectoryPath,
} = vi.hoisted(() => ({
  mockFetchWithProxy: vi.fn(),
  mockStoreMedia: vi.fn(),
  mockMediaExists: vi.fn(),
  mockGetMediaStorage: vi.fn(),
  mockGetConfigDirectoryPath: vi.fn(),
}));

const fsPromiseMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock the dependencies
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      ...fsPromiseMocks,
    },
    ...fsPromiseMocks,
  };
});
vi.mock('../../../src/storage', () => ({
  storeMedia: mockStoreMedia,
  mediaExists: mockMediaExists,
  getMediaStorage: mockGetMediaStorage,
}));
vi.mock('../../../src/util/config/manage', () => ({
  getConfigDirectoryPath: mockGetConfigDirectoryPath,
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
    mockStoreMedia.mockReset();
    mockMediaExists.mockReset();
    mockGetMediaStorage.mockReset();
    mockGetConfigDirectoryPath.mockReset();

    // Default config directory path
    mockGetConfigDirectoryPath.mockReturnValue('/test/config');

    vi.mocked(fsPromises.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }),
    );
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

    // Default: no cached video exists
    const mockStorage = {
      exists: vi.fn().mockResolvedValue(false),
    };
    mockGetMediaStorage.mockReturnValue(mockStorage);

    // Default store response
    mockStoreMedia.mockResolvedValue({
      ref: {
        provider: 'local',
        key: 'video/abc123.mp4',
        contentHash: 'abc123',
        metadata: {
          contentType: 'video/mp4',
          mediaType: 'video',
        },
      },
      deduplicated: false,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validateVideoSize', () => {
    it('should accept valid landscape size', () => {
      expect(validateVideoSize('1280x720')).toEqual({ valid: true });
    });

    it('should accept valid widescreen size', () => {
      expect(validateVideoSize('1792x1024')).toEqual({ valid: true });
    });

    it('should accept valid portrait size', () => {
      expect(validateVideoSize('720x1280')).toEqual({ valid: true });
    });

    it('should accept valid tall portrait size', () => {
      expect(validateVideoSize('1024x1792')).toEqual({ valid: true });
    });

    it.each([
      '1920x1080',
      '1080x1920',
    ] as const)('should accept 1080p creation size %s for sora-2-pro', (size) => {
      expect(validateVideoSize(size, 'sora-2-pro')).toEqual({ valid: true });
    });

    it.each([
      '1792x1024',
      '1024x1792',
      '1920x1080',
      '1080x1920',
    ] as const)('should reject pro-only size %s for sora-2', (size) => {
      const result = validateVideoSize(size, 'sora-2');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('sora-2');
    });

    it('should reject invalid size', () => {
      // Cast to test runtime validation with invalid values
      const result = validateVideoSize('1920x1079' as '1280x720');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid video size');
      expect(result.message).toContain('1920x1079');
    });

    it('should reject non-standard sizes', () => {
      // Cast to test runtime validation with invalid values
      const result = validateVideoSize('500x500' as '1280x720');
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

    it.each([16, 20] as const)('should accept %s seconds for new Sora videos', (seconds) => {
      expect(validateVideoSeconds(seconds)).toEqual({ valid: true });
    });

    it('should reject invalid duration like 5 seconds', () => {
      // Cast to test runtime validation with invalid values
      const result = validateVideoSeconds(5 as 4);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid video duration');
      expect(result.message).toContain('5');
      expect(result.message).toContain('4, 8, 12, 16, 20');
    });

    it('should reject 10 seconds', () => {
      // Cast to test runtime validation with invalid values
      const result = validateVideoSeconds(10 as 4);
      expect(result.valid).toBe(false);
    });

    it('should reject 0 seconds', () => {
      // Cast to test runtime validation with invalid values
      const result = validateVideoSeconds(0 as 4);
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

    it.each([
      ['1792x1024', 0.5],
      ['1024x1792', 0.5],
      ['1920x1080', 0.7],
      ['1080x1920', 0.7],
    ] as const)('should calculate sora-2-pro cost for %s', (size, rate) => {
      expect(calculateVideoCost('sora-2-pro', 20, false, size)).toBeCloseTo(20 * rate, 10);
    });

    it.each([
      ['sora-2-2025-10-06', '1280x720', 0.1],
      ['sora-2-2025-12-08', '720x1280', 0.1],
      ['sora-2-pro-2025-10-06', '1280x720', 0.3],
      ['sora-2-pro-2025-10-06', '1920x1080', 0.7],
    ] as const)('should calculate cost for active Sora snapshot %s', (model, size, rate) => {
      expect(calculateVideoCost(model, 8, false, size)).toBeCloseTo(8 * rate, 10);
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

  describe('SORA_COSTS', () => {
    it('should have correct cost for sora-2', () => {
      expect(SORA_COSTS['sora-2']).toBe(0.1);
    });

    it('should have correct cost for sora-2-pro', () => {
      expect(SORA_COSTS['sora-2-pro']).toBe(0.3);
    });

    it('should have correct base costs for active Sora snapshots', () => {
      expect(SORA_COSTS['sora-2-2025-10-06']).toBe(0.1);
      expect(SORA_COSTS['sora-2-2025-12-08']).toBe(0.1);
      expect(SORA_COSTS['sora-2-pro-2025-10-06']).toBe(0.3);
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

      // Mock storage for each asset
      mockStoreMedia
        .mockResolvedValueOnce({
          ref: {
            provider: 'local',
            key: 'video/abc123.mp4',
            contentHash: 'abc123',
            metadata: { contentType: 'video/mp4', mediaType: 'video' },
          },
          deduplicated: false,
        })
        .mockResolvedValueOnce({
          ref: {
            provider: 'local',
            key: 'video/abc123.webp',
            contentHash: 'abc123',
            metadata: { contentType: 'image/webp', mediaType: 'image' },
          },
          deduplicated: false,
        })
        .mockResolvedValueOnce({
          ref: {
            provider: 'local',
            key: 'video/abc123.jpg',
            contentHash: 'abc123',
            metadata: { contentType: 'image/jpeg', mediaType: 'image' },
          },
          deduplicated: false,
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
      // Verify structured storageRef object (preferred)
      expect(result.video?.storageRef).toBeDefined();
      expect(result.video?.storageRef?.key).toBe('video/abc123.mp4');
      // Verify legacy URL format for backwards compatibility
      expect(result.video?.url).toContain('storageRef:');
      expect(result.video?.thumbnail).toContain('storageRef:');
      expect(result.video?.spritesheet).toContain('storageRef:');
      expect(result.cost).toBeGreaterThan(0);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        expect.stringMatching(/\/videos$/),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-OpenAI-Originator': 'promptfoo',
          }),
        }),
      );
    });

    it('should propagate per-prompt headers through video polling and downloads', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });
      setupMocksForSuccess();

      const result = await provider.callApi('A routed video request', {
        prompt: {
          raw: 'A routed video request',
          label: 'routed-video',
          config: { headers: { 'X-Route-Token': 'per-prompt-route' } },
        },
        vars: {},
      } as any);

      expect(result.error).toBeUndefined();
      expect(mockFetchWithProxy).toHaveBeenCalledTimes(5);
      for (const [, options] of mockFetchWithProxy.mock.calls) {
        expect(options.headers).toEqual(
          expect.objectContaining({ 'X-Route-Token': 'per-prompt-route' }),
        );
      }
    });

    it('should let lowercase Authorization replace the default video credential across the lifecycle', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'default-key', headers: { authorization: 'Bearer gateway-key' } },
      });
      setupMocksForSuccess();

      const result = await provider.callApi('A gateway video request');

      expect(result.error).toBeUndefined();
      for (const [, options] of mockFetchWithProxy.mock.calls) {
        expect(new Headers(options.headers).get('authorization')).toBe('Bearer gateway-key');
      }
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
      vi.useFakeTimers();
      try {
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

        const resultPromise = provider.callApi('test prompt');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.error).toContain('timed out');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw error if API key is not set', async () => {
      const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });

      try {
        const provider = new OpenAiVideoProvider('sora-2');

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          getOpenAiMissingApiKeyMessage(),
        );
      } finally {
        restoreEnv();
      }
    });

    it('should use custom apiKeyEnvar in missing API key errors', async () => {
      const restoreEnv = mockProcessEnv({
        OPENAI_API_KEY: undefined,
        CUSTOM_VIDEO_API_KEY: undefined,
      });

      try {
        const provider = new OpenAiVideoProvider('sora-2', {
          config: {
            apiKeyEnvar: 'CUSTOM_VIDEO_API_KEY',
          },
          env: {
            OPENAI_API_KEY: undefined,
            CUSTOM_VIDEO_API_KEY: undefined,
          },
        });

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          getOpenAiMissingApiKeyMessage('CUSTOM_VIDEO_API_KEY'),
        );
      } finally {
        restoreEnv();
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

      const request = mockFetchWithProxy.mock.calls[0][1] as {
        body: FormData;
        headers: Record<string, string>;
      };

      expect(request.body).toBeInstanceOf(FormData);
      expect(request.body.get('model')).toBe('sora-2');
      expect(request.body.get('prompt')).toBe('test prompt');
      expect(request.headers['Content-Type']).toBeUndefined();
      expect(result.video?.model).toBe('sora-2');
    });

    it('should use specified size and seconds', async () => {
      const provider = new OpenAiVideoProvider('sora-2-pro', {
        config: { apiKey: 'test-key', size: '1920x1080', seconds: 20 },
      });

      setupMocksForSuccess();

      const result = await provider.callApi('test prompt');

      const request = mockFetchWithProxy.mock.calls[0][1] as { body: FormData };
      expect(request.body.get('size')).toBe('1920x1080');
      expect(request.body.get('seconds')).toBe('20');
      expect(result.video?.size).toBe('1920x1080');
      expect(result.video?.duration).toBe(20);
      expect(result.cost).toBeCloseTo(14, 10);
    });

    it('should include reusable characters in a Sora generation request', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'test-key',
          characters: [{ id: 'char_123' }, { id: 'char_456' }],
        },
      });

      setupMocksForSuccess();
      await provider.callApi('A cinematic shot of Mossy and Lantern');

      const request = mockFetchWithProxy.mock.calls[0][1] as {
        body: string;
        headers: Record<string, string>;
      };
      expect(request.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(request.body)).toMatchObject({
        model: 'sora-2',
        characters: [{ id: 'char_123' }, { id: 'char_456' }],
      });
    });

    it('should reject more than two Sora characters before calling the API', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'test-key',
          characters: [{ id: 'char_1' }, { id: 'char_2' }, { id: 'char_3' }],
        },
      });

      const result = await provider.callApi('A crowded scene');

      expect(result.error).toContain('at most two characters');
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should reject an empty Sora character ID before calling the API', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', characters: [{ id: '   ' }] },
      });

      const result = await provider.callApi('A scene with an invalid character');

      expect(result.error).toContain('non-empty IDs');
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should honor a configured Sora model override in the API request', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', model: 'sora-2-pro', size: '1792x1024', seconds: 12 },
      });

      setupMocksForSuccess();
      const result = await provider.callApi('test prompt');
      const request = mockFetchWithProxy.mock.calls[0][1] as { body: FormData };

      expect(request.body.get('model')).toBe('sora-2-pro');
      expect(request.body.get('size')).toBe('1792x1024');
      expect(request.body.get('seconds')).toBe('12');
      expect(result.cost).toBeCloseTo(6, 10);
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

      // Mock storage
      mockStoreMedia
        .mockResolvedValueOnce({
          ref: { provider: 'local', key: 'video/abc123.mp4', contentHash: 'abc123', metadata: {} },
          deduplicated: false,
        })
        .mockResolvedValueOnce({
          ref: { provider: 'local', key: 'video/abc123.jpg', contentHash: 'abc123', metadata: {} },
          deduplicated: false,
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

      // Mock storage
      mockStoreMedia
        .mockResolvedValueOnce({
          ref: { provider: 'local', key: 'video/abc123.mp4', contentHash: 'abc123', metadata: {} },
          deduplicated: false,
        })
        .mockResolvedValueOnce({
          ref: { provider: 'local', key: 'video/abc123.webp', contentHash: 'abc123', metadata: {} },
          deduplicated: false,
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

      // Mock storage for video only
      mockStoreMedia.mockResolvedValueOnce({
        ref: { provider: 'local', key: 'video/abc123.mp4', contentHash: 'abc123', metadata: {} },
        deduplicated: false,
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
      const key1 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });
      const key2 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different prompts', () => {
      const key1 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'prompt one',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });
      const key2 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'prompt two',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different models', () => {
      const key1 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });
      const key2 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2-pro',
        size: '1280x720',
        seconds: 8,
      });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different sizes', () => {
      const key1 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });
      const key2 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '720x1280',
        seconds: 8,
      });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different durations', () => {
      const key1 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 4,
      });
      const key2 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys with and without input_reference', () => {
      const key1 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });
      const key2 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
        inputReference: 'base64imagedata',
      });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different reusable characters', () => {
      const base = {
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      };

      expect(generateVideoCacheKey({ ...base, characters: [{ id: 'char_1' }] })).not.toBe(
        generateVideoCacheKey({ ...base, characters: [{ id: 'char_2' }] }),
      );
    });

    it('should ignore rotated signed-URL credentials while preserving the image identity', () => {
      const base = {
        provider: 'openai',
        prompt: 'animate the reference image',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      };
      const first = generateVideoCacheKey({
        ...base,
        inputReference:
          'https://bucket.example/start.png?X-Amz-Credential=first&X-Amz-Signature=secret-one&version=1',
      });
      const rotated = generateVideoCacheKey({
        ...base,
        inputReference: {
          image_url:
            'https://bucket.example/start.png?X-Amz-Credential=second&X-Amz-Signature=secret-two&version=1',
        },
      });
      const differentImage = generateVideoCacheKey({
        ...base,
        inputReference:
          'https://bucket.example/other.png?X-Amz-Credential=second&X-Amz-Signature=secret-two&version=1',
      });

      expect(first).toBe(rotated);
      expect(first).not.toBe(differentImage);
    });

    it('should avoid fingerprinting tenant tokens in video cache keys', () => {
      const base = {
        provider: 'openai',
        prompt: 'animate the reference image',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      };

      expect(
        generateVideoCacheKey({
          ...base,
          inputReference: 'https://assets.example/start.png?tenant_token=tenantA-secret',
        }),
      ).toBe(
        generateVideoCacheKey({
          ...base,
          inputReference: 'https://assets.example/start.png?tenant_token=tenantB-secret',
        }),
      );
    });

    it('should not fingerprint URL userinfo or generic access tokens in video cache keys', () => {
      const base = {
        provider: 'openai',
        prompt: 'animate the reference image',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      };

      expect(
        generateVideoCacheKey({
          ...base,
          inputReference: 'https://alice:password-one@assets.example/start.png',
        }),
      ).toBe(
        generateVideoCacheKey({
          ...base,
          inputReference: 'https://alice:password-two@assets.example/start.png',
        }),
      );
      expect(
        generateVideoCacheKey({
          ...base,
          inputReference: 'https://assets.example/start.png?access_token=secret-one',
        }),
      ).toBe(
        generateVideoCacheKey({
          ...base,
          inputReference: 'https://assets.example/start.png?access_token=secret-two',
        }),
      );
    });

    it('should canonicalize equivalent data-URL image-reference forms', () => {
      const base = {
        provider: 'openai',
        prompt: 'animate the reference image',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      };
      const image = 'data:image/png;base64,AA==';

      expect(generateVideoCacheKey({ ...base, inputReference: image })).toBe(
        generateVideoCacheKey({ ...base, inputReference: { image_url: image } }),
      );
    });

    it('should isolate explicit non-secret video cache scopes', () => {
      const base = {
        provider: 'openai',
        prompt: 'animate the reference image',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
        inputReference: 'https://assets.example/start.png?signature=rotating-secret',
      };

      expect(
        generateVideoCacheKey({ ...base, cacheScope: { 'x-tenant-id': 'tenant-a' } }),
      ).not.toBe(generateVideoCacheKey({ ...base, cacheScope: { 'x-tenant-id': 'tenant-b' } }));
    });

    it('should ignore all rotating Azure Blob SAS parameters', () => {
      const base = {
        provider: 'openai',
        prompt: 'animate the reference image',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      };
      const first = generateVideoCacheKey({
        ...base,
        inputReference:
          'https://account.blob.core.windows.net/container/start.png?sv=2024-11-04&st=2026-07-15T00%3A00Z&se=2026-07-15T01%3A00Z&sr=b&sp=r&spr=https&sip=10.0.0.1&saoid=owner-one&scid=correlation-one&sig=one',
      });
      const rotated = generateVideoCacheKey({
        ...base,
        inputReference:
          'https://account.blob.core.windows.net/container/start.png?sv=2024-11-04&st=2026-07-15T02%3A00Z&se=2026-07-15T03%3A00Z&sr=b&sp=r&spr=http&sip=10.0.0.2&saoid=owner-two&scid=correlation-two&sig=two',
      });

      expect(first).toBe(rotated);
    });

    it('should ignore rotating CloudFront signature parameters', () => {
      const base = {
        provider: 'openai',
        prompt: 'animate the reference image',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      };
      const first = generateVideoCacheKey({
        ...base,
        inputReference:
          'https://cdn.example.com/start.png?Policy=policy-one&Signature=signature-one&Key-Pair-Id=key-one',
      });
      const rotated = generateVideoCacheKey({
        ...base,
        inputReference:
          'https://cdn.example.com/start.png?Policy=policy-two&Signature=signature-two&Key-Pair-Id=key-two',
      });

      expect(first).toBe(rotated);
    });

    it('should tolerate malformed URLs and canonicalize the URL scheme case', () => {
      const base = {
        provider: 'openai',
        prompt: 'animate the reference image',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      };

      expect(() =>
        generateVideoCacheKey({ ...base, inputReference: 'http://[bad?sig=secret' }),
      ).not.toThrow();
      expect(
        generateVideoCacheKey({
          ...base,
          inputReference: 'HTTPS://example.com/start.png',
        }),
      ).toBe(
        generateVideoCacheKey({
          ...base,
          inputReference: 'https://example.com/start.png',
        }),
      );
    });

    it('should generate different keys for different uploaded input references', () => {
      const base = {
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      };

      expect(generateVideoCacheKey({ ...base, inputReference: { file_id: 'file_1' } })).not.toBe(
        generateVideoCacheKey({ ...base, inputReference: { file_id: 'file_2' } }),
      );
    });

    it('should generate different keys for different providers', () => {
      const key1 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });
      const key2 = generateVideoCacheKey({
        provider: 'azure',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });

      expect(key1).not.toBe(key2);
    });

    it('should return 12-character hex string', () => {
      const key = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'test prompt',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
      });

      // Should be 12 hex characters
      expect(key).toMatch(/^[0-9a-f]{12}$/);
    });
  });

  describe('checkVideoCache', () => {
    it('should return video key if cache mapping exists and video file exists', async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          videoKey: 'video/abc123def456.mp4',
          thumbnailKey: 'video/abc123def456.webp',
        }),
      );

      // Mock storage: video file exists
      const mockStorage = {
        exists: vi.fn().mockImplementation((key: string) => {
          if (key === 'video/abc123def456.mp4') {
            return Promise.resolve(true);
          }
          return Promise.resolve(false);
        }),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

      const result = await checkVideoCache('test-cache-key');

      expect(result).toBe('video/abc123def456.mp4');
      expect(fsPromises.readFile).toHaveBeenCalled();
      expect(mockStorage.exists).toHaveBeenCalledWith('video/abc123def456.mp4');
    });

    it('should return null if cache mapping does not exist', async () => {
      const result = await checkVideoCache('nonexistent-key');

      expect(result).toBe(null);
    });

    it('should return null if video file no longer exists', async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          videoKey: 'video/deleted123.mp4',
        }),
      );

      // Mock storage: video file was deleted
      const mockStorage = {
        exists: vi.fn().mockResolvedValue(false),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

      const result = await checkVideoCache('test-key');

      expect(result).toBe(null);
    });
  });

  describe('caching behavior', () => {
    it('should return cached result when video already exists', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          videoKey: 'video/stored123.mp4',
        }),
      );

      // Mock storage: video file exists
      const mockStorage = {
        exists: vi.fn().mockImplementation((key: string) => {
          if (key === 'video/stored123.mp4') {
            return Promise.resolve(true);
          }
          return Promise.resolve(false);
        }),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

      const result = await provider.callApi('cached video prompt');

      // Should not make any API calls
      expect(mockFetchWithProxy).not.toHaveBeenCalled();

      // Should return cached response
      expect(result.cached).toBe(true);
      expect(result.cost).toBe(0);
      expect(result.latencyMs).toBe(0);
      expect(result.video).toBeDefined();
      expect(result.video?.url).toBe('storageRef:video/stored123.mp4');
      expect(result.video?.format).toBe('mp4');
      expect(result.video?.model).toBe('sora-2');
    });

    it('should include thumbnail path in cached result if thumbnail exists', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          videoKey: 'video/stored123.mp4',
          thumbnailKey: 'video/stored123.webp',
          spritesheetKey: 'video/stored123.jpg',
        }),
      );

      // Mock storage: all asset files exist
      const mockStorage = {
        exists: vi.fn().mockImplementation((key: string) => {
          if (
            key === 'video/stored123.mp4' ||
            key === 'video/stored123.webp' ||
            key === 'video/stored123.jpg'
          ) {
            return Promise.resolve(true);
          }
          return Promise.resolve(false);
        }),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

      const result = await provider.callApi('cached video with assets');

      expect(result.cached).toBe(true);
      expect(result.video?.thumbnail).toBe('storageRef:video/stored123.webp');
      expect(result.video?.spritesheet).toBe('storageRef:video/stored123.jpg');
    });

    it('should not include thumbnail in cached result if it does not exist', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          videoKey: 'video/stored123.mp4',
          thumbnailKey: 'video/stored123.webp',
          spritesheetKey: 'video/stored123.jpg',
        }),
      );

      // Mock storage: only video exists, not thumbnail/spritesheet
      const mockStorage = {
        exists: vi.fn().mockImplementation((key: string) => {
          if (key === 'video/stored123.mp4') {
            return Promise.resolve(true);
          }
          return Promise.resolve(false);
        }),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

      const result = await provider.callApi('cached video without extras');

      expect(result.cached).toBe(true);
      expect(result.video?.thumbnail).toBeUndefined();
      expect(result.video?.spritesheet).toBeUndefined();
    });

    it('should skip caching for remix operations', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', remix_video_id: 'existing_video_123' },
      });

      // Even though storage indicates file exists, remix should not use cache
      const mockStorage = {
        exists: vi.fn().mockResolvedValue(false),
        store: vi.fn(),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

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

      // Mock storage
      mockStoreMedia.mockResolvedValue({
        ref: { provider: 'local', key: 'video/abc.mp4', contentHash: 'abc', metadata: {} },
        deduplicated: false,
      });

      const result = await provider.callApi('remix this video with new style');

      // Should make API calls (not use cache)
      expect(mockFetchWithProxy).toHaveBeenCalled();
      expect(result.cached).toBe(false);
    });
  });

  describe('input_reference (image-to-video)', () => {
    it('isolates video cache keys across different per-prompt gateway credentials in one tenant', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKeyRequired: false,
          apiBaseUrl: 'https://gateway.example/v1',
          headers: { 'X-Tenant-Id': 'tenant-a' },
          download_thumbnail: false,
          download_spritesheet: false,
        },
      });
      let creates = 0;
      mockFetchWithProxy.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/videos') && options?.method === 'POST') {
          creates++;
          return { ok: true, json: async () => ({ id: `video_${creates}`, status: 'queued' }) };
        }
        if (url.endsWith('/content')) {
          return { ok: true, arrayBuffer: async () => new ArrayBuffer(100) };
        }
        return { ok: true, json: async () => ({ status: 'completed', progress: 100 }) };
      });
      const context = (authorization: string) =>
        ({ prompt: { config: { headers: { authorization, 'X-Tenant-Id': 'tenant-a' } } } }) as any;

      const first = await provider.callApi('Same private video', context('Bearer user-a'));
      const second = await provider.callApi('Same private video', context('Bearer user-b'));

      expect(creates).toBe(2);
      expect(first.metadata?.cacheKey).not.toBe(second.metadata?.cacheKey);
    });

    it('does not persist videos containing an embedded credential-bearing prompt URL', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', download_thumbnail: false, download_spritesheet: false },
      });
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_private_prompt', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_private_prompt', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });

      const result = await provider.callApi(
        'Render this source: https://files.example/storyboard?access_token=tenant-a',
      );

      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should bypass the persistent video cache for authenticated image references without a tenant scope', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'test-key',
          input_reference: 'https://assets.example/start.png?signature=tenant-a-secret',
          download_thumbnail: false,
          download_spritesheet: false,
        },
      });
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_private', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_private', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });

      const result = await provider.callApi('Animate a private reference');

      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should bypass the persistent video cache for an authenticated custom gateway without a tenant scope', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'tenant-secret',
          apiBaseUrl: 'https://gateway.example/v1',
          download_thumbnail: false,
          download_spritesheet: false,
        },
      });
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_gateway', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_gateway', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });

      const result = await provider.callApi('Private gateway video');

      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should not treat credential-like tenant headers as a safe video cache scope', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'test-key',
          input_reference: 'https://assets.example/start.png?signature=private-reference',
          headers: { 'X-Tenant-Token': 'tenant-secret' },
          download_thumbnail: false,
          download_spritesheet: false,
        },
      });
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_private_scope', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_private_scope', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });

      const result = await provider.callApi('Private reference video');

      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should not persist video requests when a gateway credential is embedded in the URL path', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKeyRequired: false,
          apiBaseUrl: 'https://gateway.example/v1/sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          headers: { 'X-Tenant-Id': 'tenant-a' },
          download_thumbnail: false,
          download_spritesheet: false,
        },
      });
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_path_secret', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_path_secret', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });

      const result = await provider.callApi('Private gateway video');

      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should not treat secret-valued tenant headers as a safe video cache scope', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'test-key',
          input_reference: 'https://assets.example/start.png?signature=private-reference',
          headers: { 'X-Tenant-Id': 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          download_thumbnail: false,
          download_spritesheet: false,
        },
      });
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_secret_scope', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_secret_scope', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });

      const result = await provider.callApi('Private reference video');

      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should not persist video prompts containing embedded credentials', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'test-key',
          headers: { 'X-Tenant-Id': 'tenant-a' },
          download_thumbnail: false,
          download_spritesheet: false,
        },
      });
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_secret_prompt', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_secret_prompt', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });

      const result = await provider.callApi(
        'Render this API key: sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      );

      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should not persist videos when a response-varying routing header contains a credential', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'gateway-secret',
          apiBaseUrl: 'https://gateway.example/v1',
          headers: {
            'X-Tenant-Id': 'tenant-a',
            'X-Route': 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
          download_thumbnail: false,
          download_spritesheet: false,
        },
      });
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_secret_route', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_secret_route', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });

      const result = await provider.callApi('Routed video');

      expect(result.error).toBeUndefined();
      expect(result.cached).toBe(false);
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should not persist videos from authenticated routed gateways', async () => {
      const config = {
        apiKey: 'gateway-secret',
        apiBaseUrl: 'https://gateway.example/v1',
        headers: { 'X-Tenant-Id': 'tenant-a', 'X-User-Id': 'alice', 'X-Route': 'blue' },
        download_thumbnail: false,
        download_spritesheet: false,
      };
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_alice', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_alice', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_bob', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video_bob', status: 'completed', progress: 100 }),
        })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) });

      await new OpenAiVideoProvider('sora-2', { config }).callApi('Same routed prompt');
      await new OpenAiVideoProvider('sora-2', {
        config: { ...config, headers: { ...config.headers, 'X-User-Id': 'bob', 'X-Route': 'red' } },
      }).callApi('Same routed prompt');

      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
    it('should wrap base64 input_reference in the documented image_url object', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', input_reference: 'base64EncodedImageData' },
      });

      // Mock storage to indicate no cache
      const mockStorage = {
        exists: vi.fn().mockResolvedValue(false),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

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

      // Mock storage
      mockStoreMedia.mockResolvedValue({
        ref: { provider: 'local', key: 'video/abc.mp4', contentHash: 'abc', metadata: {} },
        deduplicated: false,
      });

      await provider.callApi('Animate this image');

      const request = mockFetchWithProxy.mock.calls[0][1] as {
        body: string;
        headers: Record<string, string>;
      };
      expect(request.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(request.body).input_reference).toEqual({
        image_url: 'data:image/png;base64,base64EncodedImageData',
      });
    });

    it.each([
      'file:///path/to/image.png',
      'FILE:///path/to/image.png',
    ])('should read and wrap %s as a data URL', async (inputReference) => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', input_reference: inputReference },
      });

      // Mock storage
      const mockStorage = {
        exists: vi.fn().mockResolvedValue(false),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

      vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
        if (String(filePath) === '/path/to/image.png') {
          return Buffer.from('fake image data');
        }
        throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
      });

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

      // Mock storage
      mockStoreMedia.mockResolvedValue({
        ref: { provider: 'local', key: 'video/abc.mp4', contentHash: 'abc', metadata: {} },
        deduplicated: false,
      });

      await provider.callApi('Animate this file');

      // Verify the file was read
      expect(fsPromises.readFile).toHaveBeenCalledWith('/path/to/image.png');

      // Verify the request body includes base64 encoded data
      const expectedBase64 = Buffer.from('fake image data').toString('base64');
      const request = mockFetchWithProxy.mock.calls[0][1] as { body: string };
      expect(JSON.parse(request.body).input_reference).toEqual({
        image_url: `data:image/png;base64,${expectedBase64}`,
      });
    });

    it.each([
      [
        'an image URL',
        'https://example.com/start.png',
        { image_url: 'https://example.com/start.png' },
      ],
      [
        'an uppercase image URL',
        'HTTPS://example.com/start.png',
        { image_url: 'HTTPS://example.com/start.png' },
      ],
      [
        'a data URL',
        'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        { image_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' },
      ],
      [
        'an uppercase data URL',
        'DATA:image/jpeg;base64,/9j/4AAQSkZJRg==',
        { image_url: 'DATA:image/jpeg;base64,/9j/4AAQSkZJRg==' },
      ],
      [
        'raw JPEG data',
        '/9j/4AAQSkZJRg==',
        { image_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' },
      ],
      ['an uploaded file ID', { file_id: 'file_123' }, { file_id: 'file_123' }],
    ])('should encode %s input_reference in the documented JSON shape', async (_label, input, expected) => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', input_reference: input as any },
      });

      mockGetMediaStorage.mockReturnValue({ exists: vi.fn().mockResolvedValue(false) });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_ref', status: 'queued' }),
      });
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'video_ref', status: 'completed', progress: 100 }),
      });
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });
      mockStoreMedia.mockResolvedValue({
        ref: { provider: 'local', key: 'video/ref.mp4', contentHash: 'ref', metadata: {} },
        deduplicated: false,
      });

      await provider.callApi('Animate this image');

      const request = mockFetchWithProxy.mock.calls[0][1] as { body: string };
      expect(JSON.parse(request.body).input_reference).toEqual(expected);
    });

    it.each([
      [
        'both image_url and file_id',
        { image_url: 'https://example.com/start.png', file_id: 'file_123' },
      ],
      ['neither image_url nor file_id', {}],
      ['an empty file_id', { file_id: '   ' }],
    ])('should reject %s before calling the Videos API', async (_label, inputReference) => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', input_reference: inputReference as any },
      });

      const result = await provider.callApi('Animate this image');

      expect(result.error).toContain('exactly one of image_url or file_id');
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should return error if input_reference file does not exist', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', input_reference: 'file:///nonexistent/image.png' },
      });

      // Mock storage
      const mockStorage = {
        exists: vi.fn().mockResolvedValue(false),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

      vi.mocked(fsPromises.readFile).mockRejectedValue(
        Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }),
      );

      const result = await provider.callApi('Animate nonexistent file');

      expect(result.error).toContain('Input reference file not found');
      expect(result.error).toContain('/nonexistent/image.png');
    });

    it('should generate different cache keys for same prompt with different input_reference', async () => {
      const key1 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'animate',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
        inputReference: 'imageDataA',
      });
      const key2 = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'animate',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
        inputReference: 'imageDataB',
      });

      expect(key1).not.toBe(key2);
    });
  });

  describe('remix_video_id', () => {
    it('should use remix endpoint when remix_video_id is provided', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: { apiKey: 'test-key', remix_video_id: 'original_video_456' },
      });

      const mockStorage = {
        exists: vi.fn().mockResolvedValue(true),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

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

      // Mock storage
      mockStoreMedia.mockResolvedValue({
        ref: { provider: 'local', key: 'video/abc.mp4', contentHash: 'abc', metadata: {} },
        deduplicated: false,
      });

      await provider.callApi('Make it more colorful');

      // Verify the remix endpoint was called
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        expect.stringContaining('/videos/original_video_456/remix'),
        expect.any(Object),
      );
    });

    it('should only include the prompt in a remix request', async () => {
      const provider = new OpenAiVideoProvider('sora-2', {
        config: {
          apiKey: 'test-key',
          remix_video_id: 'original_video_789',
          size: '1792x1024',
          seconds: 12,
          input_reference: { file_id: 'file_unused' },
        },
      });

      const mockStorage = {
        exists: vi.fn().mockResolvedValue(true),
      };
      mockGetMediaStorage.mockReturnValue(mockStorage);

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

      // Mock storage
      mockStoreMedia.mockResolvedValue({
        ref: { provider: 'local', key: 'video/abc.mp4', contentHash: 'abc', metadata: {} },
        deduplicated: false,
      });

      await provider.callApi('Change the style');

      // Get the first call (job creation for remix)
      const [, options] = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body).toEqual({ prompt: 'Change the style' });
    });

    it('should use the completed remix dimensions and duration for cost and metadata', async () => {
      const provider = new OpenAiVideoProvider('sora-2-pro', {
        config: {
          apiKey: 'test-key',
          remix_video_id: 'original_video_1080p',
          download_thumbnail: false,
          download_spritesheet: false,
        },
      });
      mockGetMediaStorage.mockReturnValue({ exists: vi.fn().mockResolvedValue(true) });
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'remixed_video_1080p', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'remixed_video_1080p',
            status: 'completed',
            progress: 100,
            model: 'sora-2-pro',
            size: '1920x1080',
            seconds: '20',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(100),
        });
      mockStoreMedia.mockResolvedValue({
        ref: { provider: 'local', key: 'video/abc.mp4', contentHash: 'abc', metadata: {} },
        deduplicated: false,
      });

      const result = await provider.callApi('Change the lighting');

      expect(result.error).toBeUndefined();
      expect(result.cost).toBeCloseTo(14, 10);
      expect(result.video).toEqual(
        expect.objectContaining({ model: 'sora-2-pro', size: '1920x1080', duration: 20 }),
      );
      expect(result.metadata).toEqual(
        expect.objectContaining({ model: 'sora-2-pro', size: '1920x1080', seconds: 20 }),
      );
    });
  });
});
