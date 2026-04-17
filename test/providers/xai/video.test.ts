import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as videoUtils from '../../../src/providers/video/utils';
import {
  calculateVideoCost,
  createXAIVideoProvider,
  validateAspectRatio,
  validateDuration,
  validateResolution,
  XAIVideoProvider,
} from '../../../src/providers/xai/video';
import * as fetch from '../../../src/util/fetch';

vi.mock('../../../src/logger');
vi.mock('../../../src/util/fetch');

// Only mock specific functions from video utils, not the validators
vi.mock('../../../src/providers/video/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof videoUtils>();
  return {
    ...actual,
    checkVideoCache: vi.fn(),
    generateVideoCacheKey: vi.fn(),
    buildStorageRefUrl: vi.fn(),
    formatVideoOutput: vi.fn(),
    storeCacheMapping: vi.fn(),
    storeVideoContent: vi.fn(),
  };
});

vi.mock('../../../src/util/time', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

describe('XAI Video Provider', () => {
  const mockApiKey = 'test-xai-api-key';
  const mockPrompt = 'A red ball bouncing';
  const mockRequestId = 'test-request-id-123';
  const mockVideoUrl = 'https://vidgen.x.ai/test-video.mp4';
  const mockStorageKey = 'video/abc123.mp4';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.clearAllMocks();

    // Mock environment
    vi.stubEnv('XAI_API_KEY', mockApiKey);

    // Mock video utils
    vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(null);
    vi.mocked(videoUtils.generateVideoCacheKey).mockReturnValue('test-cache-key');
    vi.mocked(videoUtils.buildStorageRefUrl).mockReturnValue(`storageRef:${mockStorageKey}`);
    vi.mocked(videoUtils.formatVideoOutput).mockReturnValue(
      `[Video: ${mockPrompt}](storageRef:${mockStorageKey})`,
    );
    vi.mocked(videoUtils.storeCacheMapping).mockReturnValue(undefined);
    vi.mocked(videoUtils.storeVideoContent).mockResolvedValue({
      storageRef: {
        provider: 'filesystem',
        key: mockStorageKey,
        contentHash: 'test-hash',
        metadata: { contentType: 'video/mp4', mediaType: 'video', sizeBytes: 100000 },
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  describe('Validation', () => {
    describe('validateAspectRatio', () => {
      it('accepts valid aspect ratios', () => {
        expect(validateAspectRatio('16:9')).toEqual({ valid: true });
        expect(validateAspectRatio('4:3')).toEqual({ valid: true });
        expect(validateAspectRatio('1:1')).toEqual({ valid: true });
        expect(validateAspectRatio('9:16')).toEqual({ valid: true });
        expect(validateAspectRatio('3:4')).toEqual({ valid: true });
        expect(validateAspectRatio('3:2')).toEqual({ valid: true });
        expect(validateAspectRatio('2:3')).toEqual({ valid: true });
      });

      it('rejects invalid aspect ratios', () => {
        const result = validateAspectRatio('21:9' as any);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('Invalid aspect ratio');
      });
    });

    describe('validateResolution', () => {
      it('accepts valid resolutions', () => {
        expect(validateResolution('720p')).toEqual({ valid: true });
        expect(validateResolution('480p')).toEqual({ valid: true });
      });

      it('rejects invalid resolutions', () => {
        const result = validateResolution('1080p' as any);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('Invalid resolution');
      });
    });

    describe('validateDuration', () => {
      it('accepts valid durations (1-15)', () => {
        expect(validateDuration(1)).toEqual({ valid: true });
        expect(validateDuration(8)).toEqual({ valid: true });
        expect(validateDuration(15)).toEqual({ valid: true });
      });

      it('rejects duration below minimum', () => {
        const result = validateDuration(0);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('between 1 and 15');
      });

      it('rejects duration above maximum', () => {
        const result = validateDuration(16);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('between 1 and 15');
      });
    });

    describe('calculateVideoCost', () => {
      it('calculates cost based on duration', () => {
        expect(calculateVideoCost(3)).toBeCloseTo(0.15, 2); // 3 seconds * $0.05
        expect(calculateVideoCost(10)).toBeCloseTo(0.5, 2); // 10 seconds * $0.05
      });

      it('returns 0 for cached videos', () => {
        expect(calculateVideoCost(10, true)).toBe(0);
      });
    });
  });

  describe('Provider creation and configuration', () => {
    it('creates provider with default model', () => {
      const provider = createXAIVideoProvider('xai:video:');
      expect(provider).toBeInstanceOf(XAIVideoProvider);
      expect(provider.id()).toBe('xai:video:grok-imagine-video');
    });

    it('creates provider with specified model', () => {
      const provider = createXAIVideoProvider('xai:video:grok-imagine-video');
      expect(provider.id()).toBe('xai:video:grok-imagine-video');
    });

    it('creates provider with custom ID', () => {
      const provider = new XAIVideoProvider('grok-imagine-video', { id: 'my-custom-id' });
      expect(provider.id()).toBe('my-custom-id');
    });

    it('uses correct API URL', () => {
      const provider = new XAIVideoProvider('grok-imagine-video');
      expect(provider.getApiUrl()).toBe('https://api.x.ai/v1');
    });

    it('uses custom API URL from config', () => {
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { apiBaseUrl: 'https://custom.api.example.com' },
      });
      expect(provider.getApiUrl()).toBe('https://custom.api.example.com');
    });

    it('returns correct string representation', () => {
      const provider = new XAIVideoProvider('grok-imagine-video');
      expect(provider.toString()).toBe('[xAI Video Provider grok-imagine-video]');
    });
  });

  describe('API key handling', () => {
    it('uses API key from config', () => {
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { apiKey: 'custom-api-key' },
      });
      expect(provider.getApiKey()).toBe('custom-api-key');
    });

    it('uses API key from environment', () => {
      const provider = new XAIVideoProvider('grok-imagine-video');
      expect(provider.getApiKey()).toBe(mockApiKey);
    });

    it('returns error when API key is missing', async () => {
      // Explicitly set API key to empty to simulate missing key
      vi.stubEnv('XAI_API_KEY', '');
      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);
      expect(result.error).toContain('XAI_API_KEY');
    });
  });

  describe('Video generation flow', () => {
    it('generates video successfully', async () => {
      // Mock job creation
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };

      // Mock status poll - completed
      const pollResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 3 },
          model: 'grok-imagine-video',
        }),
      };

      // Mock video download
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any) // Create job
        .mockResolvedValueOnce(pollResponse as any) // Poll status
        .mockResolvedValueOnce(downloadResponse as any); // Download video

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Video:');
      expect(result.video?.model).toBe('grok-imagine-video');
      expect(result.cost).toBeCloseTo(0.15, 2); // 3 seconds * $0.05
      expect(result.cached).toBe(false);
    });

    it('handles pending status and polls until completed', async () => {
      // Mock job creation
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };

      // Mock pending status
      const pendingResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'pending' }),
      };

      // Mock completed status
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 5 },
          model: 'grok-imagine-video',
        }),
      };

      // Mock video download
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(pendingResponse as any) // First poll - pending
        .mockResolvedValueOnce(completedResponse as any) // Second poll - completed
        .mockResolvedValueOnce(downloadResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toBeUndefined();
      expect(result.video?.duration).toBe(5);
    });

    it('returns cached result when available', async () => {
      vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(mockStorageKey);

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.cached).toBe(true);
      expect(result.cost).toBe(0);
      expect(result.latencyMs).toBe(0);
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('handles job creation failure', async () => {
      const errorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({ error: { message: 'Invalid prompt' } }),
      };

      vi.mocked(fetch.fetchWithProxy).mockResolvedValue(errorResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('API error 400');
      expect(result.error).toContain('Invalid prompt');
    });

    it('handles polling timeout', async () => {
      // Mock job creation
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };

      // Mock pending status that never completes
      const pendingResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'pending' }),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValue(pendingResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { max_poll_time_ms: 100, poll_interval_ms: 10 },
      });
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('timed out');
    });

    it('handles failed video generation', async () => {
      // Mock job creation
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };

      // Mock failed status
      const failedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'failed', error: 'Content policy violation' }),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(failedResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Content policy violation');
    });

    it('handles video download failure', async () => {
      // Mock job creation
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };

      // Mock completed status
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 3 },
          model: 'grok-imagine-video',
        }),
      };

      // Mock download failure
      const downloadResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(completedResponse as any)
        .mockResolvedValueOnce(downloadResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Failed to download video');
    });

    it('handles invalid duration parameter', async () => {
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { duration: 20 }, // Invalid - max is 15
      });
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Invalid duration');
    });

    it('handles invalid aspect ratio parameter', async () => {
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { aspect_ratio: '21:9' as any },
      });
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Invalid aspect ratio');
    });

    it('handles invalid resolution parameter', async () => {
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { resolution: '4K' as any },
      });
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Invalid resolution');
    });
  });

  describe('Image-to-video generation', () => {
    it('includes image URL in request', async () => {
      const imageUrl = 'https://example.com/image.jpg';

      // Mock responses
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 3 },
          model: 'grok-imagine-video',
        }),
      };
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(completedResponse as any)
        .mockResolvedValueOnce(downloadResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { image: { url: imageUrl } },
      });
      await provider.callApi(mockPrompt);

      // Verify the request included the image
      const calls = vi.mocked(fetch.fetchWithProxy).mock.calls;
      const createCall = calls[0];
      const body = JSON.parse(createCall[1]?.body as string);
      expect(body.image).toEqual({ url: imageUrl });
    });
  });

  describe('Video editing', () => {
    it('uses edit endpoint when video URL is provided', async () => {
      const sourceVideoUrl = 'https://example.com/source.mp4';

      // Mock responses
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 3 },
          model: 'grok-imagine-video',
        }),
      };
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(completedResponse as any)
        .mockResolvedValueOnce(downloadResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { video: { url: sourceVideoUrl } },
      });
      await provider.callApi('Make the ball larger');

      // Verify the edit endpoint was used
      const calls = vi.mocked(fetch.fetchWithProxy).mock.calls;
      const createCall = calls[0];
      expect(createCall[0]).toContain('/videos/edits');

      // Verify video URL was included
      const body = JSON.parse(createCall[1]?.body as string);
      expect(body.video).toEqual({ url: sourceVideoUrl });
    });

    it('skips cache for video edits', async () => {
      const sourceVideoUrl = 'https://example.com/source.mp4';

      // Mock responses
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 3 },
          model: 'grok-imagine-video',
        }),
      };
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(completedResponse as any)
        .mockResolvedValueOnce(downloadResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { video: { url: sourceVideoUrl } },
      });
      const result = await provider.callApi('Make the ball larger');

      // storeCacheMapping should not be called for edits
      expect(videoUtils.storeCacheMapping).not.toHaveBeenCalled();
      expect(result.metadata?.isEdit).toBe(true);
    });

    it('does not validate duration/aspect_ratio for edits', async () => {
      const sourceVideoUrl = 'https://example.com/source.mp4';

      // Mock responses
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 3 },
          model: 'grok-imagine-video',
        }),
      };
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(completedResponse as any)
        .mockResolvedValueOnce(downloadResponse as any);

      // Even with invalid duration, edits should work
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { video: { url: sourceVideoUrl }, duration: 999 },
      });
      const result = await provider.callApi('Edit prompt');

      // Should not return validation error for edits
      expect(result.error).toBeUndefined();
    });
  });

  describe('Cache key generation', () => {
    it('generates cache key with correct parameters', async () => {
      // Mock responses for successful generation
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 5 },
          model: 'grok-imagine-video',
        }),
      };
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(completedResponse as any)
        .mockResolvedValueOnce(downloadResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { duration: 5, aspect_ratio: '9:16', resolution: '480p' },
      });
      await provider.callApi(mockPrompt);

      expect(videoUtils.generateVideoCacheKey).toHaveBeenCalledWith({
        provider: 'xai',
        prompt: mockPrompt,
        model: 'grok-imagine-video',
        size: '9:16:480p',
        seconds: 5,
        inputReference: null,
      });
    });

    it('includes image URL in cache key for image-to-video', async () => {
      const imageUrl = 'https://example.com/image.jpg';

      vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(mockStorageKey);

      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { image: { url: imageUrl } },
      });
      await provider.callApi(mockPrompt);

      expect(videoUtils.generateVideoCacheKey).toHaveBeenCalledWith(
        expect.objectContaining({
          inputReference: imageUrl,
        }),
      );
    });
  });

  describe('Additional error scenarios', () => {
    it('handles network exception during job creation', async () => {
      vi.mocked(fetch.fetchWithProxy).mockRejectedValueOnce(new Error('Network error'));

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Failed to create video job');
      expect(result.error).toContain('Network error');
    });

    it('handles network exception during polling', async () => {
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockRejectedValueOnce(new Error('Connection reset'));

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Polling error');
      expect(result.error).toContain('Connection reset');
    });

    it('handles HTTP error during status polling', async () => {
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };

      const errorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValue({ error: { message: 'Server overloaded' } }),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(errorResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Status check failed');
      expect(result.error).toContain('Server overloaded');
    });

    it('handles storeVideoContent error', async () => {
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 3 },
          model: 'grok-imagine-video',
        }),
      };
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(completedResponse as any)
        .mockResolvedValueOnce(downloadResponse as any);

      // Mock storage failure
      vi.mocked(videoUtils.storeVideoContent).mockResolvedValue({
        error: 'Storage quota exceeded',
      });

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Storage quota exceeded');
    });

    it('handles processing status before completion', async () => {
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };

      // Status goes: pending -> processing -> completed
      const pendingResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'pending' }),
      };
      const processingResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'processing' }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          video: { url: mockVideoUrl, duration: 3 },
          model: 'grok-imagine-video',
        }),
      };
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };

      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(pendingResponse as any)
        .mockResolvedValueOnce(processingResponse as any)
        .mockResolvedValueOnce(completedResponse as any)
        .mockResolvedValueOnce(downloadResponse as any);

      const provider = new XAIVideoProvider('grok-imagine-video');
      const result = await provider.callApi(mockPrompt);

      expect(result.error).toBeUndefined();
      expect(result.video?.duration).toBe(3);
    });
  });
});
