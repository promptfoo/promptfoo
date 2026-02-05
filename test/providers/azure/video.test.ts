import * as fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AZURE_SORA_COST_PER_SECOND,
  AZURE_VIDEO_DIMENSIONS,
  AZURE_VIDEO_DURATIONS,
} from '../../../src/providers/azure/defaults';
import {
  AzureVideoProvider,
  calculateAzureVideoCost,
  validateAzureVideoDimensions,
  validateAzureVideoDuration,
} from '../../../src/providers/azure/video';
import { generateVideoCacheKey } from '../../../src/providers/video';

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

// Mock the dependencies
vi.mock('fs');
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

describe('AzureVideoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithProxy.mockReset();
    mockStoreMedia.mockReset();
    mockMediaExists.mockReset();
    mockGetMediaStorage.mockReset();
    mockGetConfigDirectoryPath.mockReset();

    // Default config directory path
    mockGetConfigDirectoryPath.mockReturnValue('/test/config');

    // Default: no cached video exists (fs.existsSync returns false for cache files)
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

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

  describe('validateAzureVideoDimensions', () => {
    it('should accept valid 1280x720 dimensions', () => {
      expect(validateAzureVideoDimensions(1280, 720)).toEqual({ valid: true });
    });

    it('should accept valid 1920x1080 dimensions', () => {
      expect(validateAzureVideoDimensions(1920, 1080)).toEqual({ valid: true });
    });

    it('should accept valid square dimensions', () => {
      expect(validateAzureVideoDimensions(720, 720)).toEqual({ valid: true });
      expect(validateAzureVideoDimensions(1080, 1080)).toEqual({ valid: true });
    });

    it('should accept valid 854x480 dimensions', () => {
      expect(validateAzureVideoDimensions(854, 480)).toEqual({ valid: true });
    });

    it('should reject invalid dimensions', () => {
      const result = validateAzureVideoDimensions(1920, 720);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid video dimensions');
      expect(result.message).toContain('1920x720');
    });

    it('should list valid sizes in error message', () => {
      const result = validateAzureVideoDimensions(999, 999);
      expect(result.message).toContain('480x480');
      expect(result.message).toContain('1280x720');
    });
  });

  describe('validateAzureVideoDuration', () => {
    it('should accept valid durations', () => {
      for (const duration of AZURE_VIDEO_DURATIONS) {
        expect(validateAzureVideoDuration(duration)).toEqual({ valid: true });
      }
    });

    it('should reject invalid duration', () => {
      // TypeScript requires cast for invalid values
      const result = validateAzureVideoDuration(8 as 5);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid video duration');
    });
  });

  describe('calculateAzureVideoCost', () => {
    it('should calculate cost correctly for 5 seconds', () => {
      const cost = calculateAzureVideoCost(5, false);
      expect(cost).toBe(AZURE_SORA_COST_PER_SECOND * 5);
    });

    it('should calculate cost correctly for 20 seconds', () => {
      const cost = calculateAzureVideoCost(20, false);
      expect(cost).toBe(AZURE_SORA_COST_PER_SECOND * 20);
    });

    it('should return 0 for cached videos', () => {
      const cost = calculateAzureVideoCost(10, true);
      expect(cost).toBe(0);
    });
  });

  describe('constructor', () => {
    it('should create provider with deployment name', () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.cognitiveservices.azure.com',
          apiKey: 'test-key',
        },
      });
      expect(provider.id()).toBe('azure:video:sora');
    });

    it('should use custom provider ID if specified', () => {
      const provider = new AzureVideoProvider('sora', {
        id: 'my-custom-video-provider',
        config: {
          apiBaseUrl: 'https://test.cognitiveservices.azure.com',
          apiKey: 'test-key',
        },
      });
      expect(provider.id()).toBe('my-custom-video-provider');
    });

    it('should store config options', () => {
      const config = {
        apiBaseUrl: 'https://custom.azure.com',
        apiKey: 'custom-key',
        width: 1920,
        height: 1080,
        n_seconds: 10 as const,
      };
      const provider = new AzureVideoProvider('sora', { config });
      expect(provider.config).toEqual(config);
    });
  });

  describe('toString', () => {
    it('should return descriptive string', () => {
      const provider = new AzureVideoProvider('my-deployment', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'test-key',
        },
      });
      expect(provider.toString()).toBe('[Azure Video Provider my-deployment]');
    });
  });

  describe('callApi - validation', () => {
    it('should reject invalid video dimensions', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'test-key',
          width: 999,
          height: 999,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Invalid video dimensions');
    });

    it('should reject invalid video duration', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'test-key',
          n_seconds: 7 as 5,
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Invalid video duration');
    });

    it('should return error if API base URL is not set', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt');

      // The error is returned during job creation since base URL is null
      expect(result.error).toBeDefined();
    });
  });

  describe('callApi - successful flow', () => {
    it('should create and poll video job successfully', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.cognitiveservices.azure.com',
          apiKey: 'test-key',
        },
      });

      // Mock job creation
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'job_123',
              status: 'queued',
              generations: [],
            }),
        })
        // Mock status polling - succeeded
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'job_123',
              status: 'succeeded',
              generations: [
                {
                  id: 'gen_456',
                  job_id: 'job_123',
                  width: 1280,
                  height: 720,
                  n_seconds: 5,
                  prompt: 'A cat playing piano',
                },
              ],
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
      expect(result.video?.size).toBe('1280x720');
      expect(result.video?.duration).toBe(5);
      expect(result.cached).toBe(false);
    });

    it('should use custom dimensions and duration', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'test-key',
          width: 1920,
          height: 1080,
          n_seconds: 10,
        },
      });

      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'job_123',
              status: 'succeeded',
              generations: [{ id: 'gen_456', width: 1920, height: 1080, n_seconds: 10 }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'job_123',
              status: 'succeeded',
              generations: [{ id: 'gen_456', width: 1920, height: 1080, n_seconds: 10 }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
        });

      const result = await provider.callApi('Test');

      expect(result.video?.size).toBe('1920x1080');
      expect(result.video?.duration).toBe(10);
    });
  });

  describe('callApi - error handling', () => {
    it('should handle job creation failure', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'test-key',
        },
      });

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () =>
          Promise.resolve({
            error: { message: 'Rate limit exceeded' },
          }),
      });

      const result = await provider.callApi('Test');

      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should handle polling failure', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'test-key',
        },
      });

      // Job creation succeeds
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'job_123', status: 'queued' }),
      });

      // Status check fails
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'job_123',
            status: 'failed',
            failure_reason: 'Content policy violation',
          }),
      });

      const result = await provider.callApi('Test');

      expect(result.error).toContain('Content policy violation');
    });

    it('should handle video download failure', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'test-key',
        },
      });

      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'job_123',
              status: 'succeeded',
              generations: [{ id: 'gen_456' }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'job_123',
              status: 'succeeded',
              generations: [{ id: 'gen_456' }],
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });

      const result = await provider.callApi('Test');

      expect(result.error).toContain('Failed to download video');
    });

    it('should handle empty generations array', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'test-key',
        },
      });

      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'job_123',
              status: 'succeeded',
              generations: [],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'job_123',
              status: 'succeeded',
              generations: [],
            }),
        });

      const result = await provider.callApi('Test');

      expect(result.error).toContain('No video generations returned');
    });
  });

  describe('callApi - caching', () => {
    it('should return cached video when available', async () => {
      const provider = new AzureVideoProvider('sora', {
        config: {
          apiBaseUrl: 'https://test.azure.com',
          apiKey: 'test-key',
        },
      });

      // Set up cache hit
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          videoKey: 'video/cached123.mp4',
          createdAt: '2024-01-01T00:00:00Z',
        }),
      );
      mockGetMediaStorage.mockReturnValue({
        exists: vi.fn().mockResolvedValue(true),
      });

      const result = await provider.callApi('Test prompt');

      expect(result.cached).toBe(true);
      expect(result.latencyMs).toBe(0);
      expect(result.cost).toBe(0);
      expect(result.video?.storageRef?.key).toBe('video/cached123.mp4');

      // Should not have made any fetch calls
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });
  });

  describe('generateVideoCacheKey for Azure', () => {
    it('should generate deterministic cache keys', () => {
      const key1 = generateVideoCacheKey({
        provider: 'azure',
        prompt: 'A cat playing piano',
        model: 'sora',
        size: '1280x720',
        seconds: 5,
      });

      const key2 = generateVideoCacheKey({
        provider: 'azure',
        prompt: 'A cat playing piano',
        model: 'sora',
        size: '1280x720',
        seconds: 5,
      });

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different prompts', () => {
      const key1 = generateVideoCacheKey({
        provider: 'azure',
        prompt: 'A cat',
        model: 'sora',
        size: '1280x720',
        seconds: 5,
      });

      const key2 = generateVideoCacheKey({
        provider: 'azure',
        prompt: 'A dog',
        model: 'sora',
        size: '1280x720',
        seconds: 5,
      });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for azure vs openai provider', () => {
      const azureKey = generateVideoCacheKey({
        provider: 'azure',
        prompt: 'Test',
        model: 'sora',
        size: '1280x720',
        seconds: 5,
      });

      const openaiKey = generateVideoCacheKey({
        provider: 'openai',
        prompt: 'Test',
        model: 'sora',
        size: '1280x720',
        seconds: 5,
      });

      expect(azureKey).not.toBe(openaiKey);
    });
  });

  describe('AZURE_VIDEO_DIMENSIONS', () => {
    it('should have all required dimensions', () => {
      expect(Object.keys(AZURE_VIDEO_DIMENSIONS)).toContain('480x480');
      expect(Object.keys(AZURE_VIDEO_DIMENSIONS)).toContain('854x480');
      expect(Object.keys(AZURE_VIDEO_DIMENSIONS)).toContain('720x720');
      expect(Object.keys(AZURE_VIDEO_DIMENSIONS)).toContain('1280x720');
      expect(Object.keys(AZURE_VIDEO_DIMENSIONS)).toContain('1080x1080');
      expect(Object.keys(AZURE_VIDEO_DIMENSIONS)).toContain('1920x1080');
    });

    it('should have correct width and height for each dimension', () => {
      expect(AZURE_VIDEO_DIMENSIONS['1280x720']).toEqual({ width: 1280, height: 720 });
      expect(AZURE_VIDEO_DIMENSIONS['1920x1080']).toEqual({ width: 1920, height: 1080 });
    });
  });

  describe('AZURE_VIDEO_DURATIONS', () => {
    it('should include valid durations', () => {
      expect(AZURE_VIDEO_DURATIONS).toContain(5);
      expect(AZURE_VIDEO_DURATIONS).toContain(10);
      expect(AZURE_VIDEO_DURATIONS).toContain(15);
      expect(AZURE_VIDEO_DURATIONS).toContain(20);
    });
  });
});
