import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as videoUtils from '../../../src/providers/video/utils';
import {
  calculateVideoCost,
  createXAIVideoProvider,
  resolveVideoModel,
  validateAspectRatio,
  validateDuration,
  validateResolution,
  XAIVideoProvider,
} from '../../../src/providers/xai/video';
import * as fetch from '../../../src/util/fetch/index';
import { sleep } from '../../../src/util/time';

vi.mock('../../../src/logger');
vi.mock('../../../src/util/fetch/index');

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
  const video15Models = [
    'grok-imagine-video-1.5',
    'grok-imagine-video-1.5-preview',
    'grok-imagine-video-1.5-2026-05-30',
  ] as const;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.clearAllMocks();
    vi.mocked(sleep).mockResolvedValue(undefined);

    // Mock environment
    vi.stubEnv('XAI_API_KEY', mockApiKey);

    // Mock video utils
    vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(null);
    vi.mocked(videoUtils.generateVideoCacheKey).mockReturnValue('test-cache-key');
    vi.mocked(videoUtils.buildStorageRefUrl).mockReturnValue(`storageRef:${mockStorageKey}`);
    vi.mocked(videoUtils.formatVideoOutput).mockReturnValue(
      `[Video: ${mockPrompt}](storageRef:${mockStorageKey})`,
    );
    vi.mocked(videoUtils.storeCacheMapping).mockResolvedValue(undefined);
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
        expect(validateResolution('1080p', 'grok-imagine-video-1.5')).toEqual({ valid: true });
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
        expect(calculateVideoCost(3)).toBeCloseTo(0.21, 2); // 3 seconds * $0.07 at 720p
        expect(calculateVideoCost(10)).toBeCloseTo(0.7, 2); // 10 seconds * $0.07 at 720p
        expect(
          calculateVideoCost(10, false, {
            modelName: 'grok-imagine-video',
            resolution: '720p',
            hasImageInput: true,
          }),
        ).toBeCloseTo(0.702, 3);
        expect(
          calculateVideoCost(10, false, {
            modelName: 'grok-imagine-video-1.5',
            resolution: '480p',
            hasImageInput: true,
          }),
        ).toBeCloseTo(0.81, 2);
        expect(
          calculateVideoCost(10, false, {
            modelName: 'grok-imagine-video-1.5-preview',
            resolution: '720p',
          }),
        ).toBeCloseTo(1.4, 2);
        expect(
          calculateVideoCost(10, false, {
            modelName: 'grok-imagine-video-1.5-2026-05-30',
            resolution: '1080p',
          }),
        ).toBeCloseTo(2.5, 2);
      });

      it('returns 0 for cached videos', () => {
        expect(calculateVideoCost(10, true)).toBe(0);
      });

      it('bills grok-imagine-video-1.5 at its higher per-second rate', () => {
        // The default 720p output costs $0.14/sec for 1.5 and $0.07/sec for the base model.
        expect(calculateVideoCost(10, false, 'grok-imagine-video-1.5')).toBeCloseTo(1.4, 10);
        expect(calculateVideoCost(10, false, 'grok-imagine-video')).toBeCloseTo(0.7, 10);
      });

      it('bills grok-imagine-video-1.5 aliases at the 1.5 rate', () => {
        for (const alias of [
          'grok-imagine-video-1.5-preview',
          'grok-imagine-video-1.5-2026-05-30',
        ]) {
          expect(calculateVideoCost(5, false, alias)).toBeCloseTo(0.7, 10);
        }
      });

      it('falls back to the base rate for unknown slugs and returns 0 when cached', () => {
        expect(calculateVideoCost(4, false, 'grok-imagine-video-9.9-preview')).toBeCloseTo(
          0.28,
          10,
        );
        expect(calculateVideoCost(10, true, 'grok-imagine-video-1.5')).toBe(0);
      });
    });

    describe('resolveVideoModel', () => {
      it('canonicalizes 1.5 aliases and preserves unknown slugs', () => {
        expect(resolveVideoModel('grok-imagine-video-1.5-preview')).toBe('grok-imagine-video-1.5');
        expect(resolveVideoModel('grok-imagine-video-1.5-2026-05-30')).toBe(
          'grok-imagine-video-1.5',
        );
        expect(resolveVideoModel('grok-imagine-video')).toBe('grok-imagine-video');
        expect(resolveVideoModel('grok-imagine-video-future')).toBe('grok-imagine-video-future');
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

      const video15Provider = createXAIVideoProvider('xai:video:grok-imagine-video-1.5');
      expect(video15Provider.id()).toBe('xai:video:grok-imagine-video-1.5');
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

    it('uses a regional API URL when configured', () => {
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { region: 'eu-west-1' },
      });
      expect(provider.getApiUrl()).toBe('https://eu-west-1.api.x.ai/v1');
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
    it.each(video15Models)('generates a 1080p text-only video with %s', async (model) => {
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };
      const pendingResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'pending' }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          status: 'done',
          video: { url: mockVideoUrl, duration: 4 },
          model,
        }),
      };
      const downloadResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      };
      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce(createResponse as any)
        .mockResolvedValueOnce(pendingResponse as any)
        .mockResolvedValueOnce(completedResponse as any)
        .mockResolvedValueOnce(downloadResponse as any);

      const provider = new XAIVideoProvider(model, {
        config: { cacheNamespace: 'test-account', duration: 4, resolution: '1080p' },
      });

      const result = await provider.callApi(mockPrompt);

      const calls = vi.mocked(fetch.fetchWithProxy).mock.calls;
      expect(calls[0]).toEqual([
        'https://api.x.ai/v1/videos/generations',
        expect.objectContaining({ method: 'POST' }),
      ]);
      expect(JSON.parse(calls[0][1]?.body as string)).toEqual({
        model: 'grok-imagine-video-1.5',
        prompt: mockPrompt,
        duration: 4,
        aspect_ratio: '16:9',
        resolution: '1080p',
      });
      expect(calls[1]).toEqual([
        `https://api.x.ai/v1/videos/${mockRequestId}`,
        expect.objectContaining({ method: 'GET' }),
      ]);
      expect(calls[3]).toEqual([mockVideoUrl, expect.objectContaining({ method: 'GET' })]);
      expect(sleep).toHaveBeenCalledWith(10_000);
      expect(videoUtils.storeVideoContent).toHaveBeenCalledWith(
        expect.any(Buffer),
        {
          contentType: 'video/mp4',
          mediaType: 'video',
          evalId: undefined,
          contentHash: 'test-cache-key',
        },
        'xAI Video',
      );
      expect(videoUtils.storeCacheMapping).toHaveBeenCalledWith(
        'test-cache-key',
        mockStorageKey,
        undefined,
        undefined,
        'xAI Video',
      );
      expect(result.error).toBeUndefined();
      expect(result).toMatchObject({
        cached: false,
        cost: 1,
        video: {
          id: mockRequestId,
          storageRef: { key: mockStorageKey },
          model: 'grok-imagine-video-1.5',
          duration: 4,
          resolution: '1080p',
        },
        metadata: { hasReferenceImages: false, resolution: '1080p' },
      });
    });

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
          status: 'done',
          video: { url: mockVideoUrl, duration: 3 },
          model: 'grok-imagine-video',
          usage: { cost_in_usd_ticks: 123000000 },
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
      expect(result.cost).toBe(0.0123);
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

      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: { cacheNamespace: 'test-account' },
      });
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
      vi.useFakeTimers();
      try {
        // Route the mocked sleep through the real implementation so fake
        // timers can advance the polling loop deterministically.
        const realTime =
          await vi.importActual<typeof import('../../../src/util/time')>('../../../src/util/time');
        vi.mocked(sleep).mockImplementation(realTime.sleep);

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
        const resultPromise = provider.callApi(mockPrompt);
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.error).toContain('timed out');
      } finally {
        vi.useRealTimers();
      }
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
        config: { image: { url: imageUrl }, reference_images: [] },
      });
      const result = await provider.callApi(mockPrompt);

      // Verify the request included the image
      const calls = vi.mocked(fetch.fetchWithProxy).mock.calls;
      const createCall = calls[0];
      const body = JSON.parse(createCall[1]?.body as string);
      expect(body.image).toEqual({ url: imageUrl });
      expect(result.cost).toBeCloseTo(0.212, 3);
    });
  });

  describe('Reference-to-video generation', () => {
    it('sends preset reference voices for Grok Imagine Video 1.5', async () => {
      const referenceAudios = [{ voice_id: 'eve' }, { voice_id: 'leo' }];
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          status: 'done',
          video: { url: mockVideoUrl, duration: 15 },
          model: 'grok-imagine-video-1.5',
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

      const provider = new XAIVideoProvider('grok-imagine-video-1.5', {
        config: {
          reference_audios: referenceAudios,
          duration: 15,
          resolution: '720p',
        },
      });

      const result = await provider.callApi(
        'The speaker uses <AUDIO_0>, then the narrator uses <AUDIO_1>.',
      );

      const createCall = vi.mocked(fetch.fetchWithProxy).mock.calls[0];
      expect(JSON.parse(createCall[1]?.body as string)).toMatchObject({
        model: 'grok-imagine-video-1.5',
        duration: 15,
        resolution: '720p',
        reference_audios: referenceAudios,
      });
      expect(result.error).toBeUndefined();
      expect(result.metadata?.hasReferenceAudios).toBe(true);
    });

    it('generates a Grok Imagine Video 1.5 video from reference images', async () => {
      const referenceImages = [
        { url: 'https://example.com/person.jpg' },
        { url: 'https://example.com/shirt.jpg' },
      ];
      const createResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
      };
      const completedResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          status: 'done',
          video: { url: mockVideoUrl, duration: 4 },
          model: 'grok-imagine-video-1.5',
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

      const provider = new XAIVideoProvider('grok-imagine-video-1.5', {
        config: {
          cacheNamespace: 'test-account',
          reference_images: referenceImages,
          duration: 10,
          resolution: '720p',
        },
      });

      const result = await provider.callApi(mockPrompt);

      const createCall = vi.mocked(fetch.fetchWithProxy).mock.calls[0];
      expect(createCall[0]).toBe('https://api.x.ai/v1/videos/generations');
      expect(JSON.parse(createCall[1]?.body as string)).toEqual({
        model: 'grok-imagine-video-1.5',
        prompt: mockPrompt,
        duration: 10,
        aspect_ratio: '16:9',
        resolution: '720p',
        reference_images: referenceImages,
      });
      expect(videoUtils.storeVideoContent).toHaveBeenCalledOnce();
      expect(videoUtils.storeCacheMapping).toHaveBeenCalledOnce();
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeCloseTo(0.58, 5);
      expect(result.video).toMatchObject({
        storageRef: { key: mockStorageKey },
        model: 'grok-imagine-video-1.5',
        duration: 4,
        resolution: '720p',
      });
      expect(result.metadata?.hasReferenceImages).toBe(true);
    });

    it('includes reference images in the request', async () => {
      const referenceImages = [
        { url: 'https://example.com/person.jpg' },
        { url: 'https://example.com/shirt.jpg' },
      ];
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
        config: { reference_images: referenceImages, duration: 10 },
      });
      const result = await provider.callApi(mockPrompt);

      const createCall = vi.mocked(fetch.fetchWithProxy).mock.calls[0];
      const body = JSON.parse(createCall[1]?.body as string);
      expect(body.reference_images).toEqual(referenceImages);
      expect(result.metadata?.hasReferenceImages).toBe(true);
      expect(result.cost).toBeCloseTo(0.214, 3);
    });

    it('rejects reference images combined with image-to-video', async () => {
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: {
          image: { url: 'https://example.com/frame.jpg' },
          reference_images: [{ url: 'https://example.com/reference.jpg' }],
        },
      });

      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('reference_images cannot be combined with image input');
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

    it.each([undefined, { url: 'https://example.com/frame.jpg' }])(
      'rejects reference voices on the legacy video model with image %j',
      async (image) => {
        const provider = new XAIVideoProvider('grok-imagine-video', {
          config: { image, reference_audios: [{ voice_id: 'eve' }] },
        });

        const result = await provider.callApi('Use <AUDIO_0> for the speaker.');

        expect(result.error).toContain('only supported by Grok Imagine Video 1.5');
        expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
      },
    );

    it('rejects more than three reference voices', async () => {
      const provider = new XAIVideoProvider('grok-imagine-video-1.5', {
        config: {
          reference_audios: ['eve', 'leo', 'ara', 'rex'].map((voice_id) => ({ voice_id })),
        },
      });

      const result = await provider.callApi('Use the preset voices.');

      expect(result.error).toContain('Must be between 1 and 3');
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

    it.each([
      ['missing voice_id', {}],
      ['null entry', null],
      ['non-string voice_id', { voice_id: 42 }],
      ['blank voice_id', { voice_id: '  ' }],
    ])('rejects a malformed reference voice entry with %s', async (_label, entry) => {
      const provider = new XAIVideoProvider('grok-imagine-video-1.5', {
        config: { reference_audios: [entry as any] },
      });

      const result = await provider.callApi('Use the preset voice.');

      expect(result.error).toContain('non-empty voice_id');
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

    it.each(video15Models)('sends a starting image and normalized voices for %s', async (model) => {
      vi.mocked(fetch.fetchWithProxy)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ request_id: mockRequestId }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ video: { url: mockVideoUrl, duration: 15 }, model }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(1000),
        } as Response);
      const image = { url: 'https://example.com/frame.jpg' };
      const provider = new XAIVideoProvider(model, {
        config: {
          cacheNamespace: 'test-account',
          image,
          reference_audios: [{ voice_id: ' Eve ' }, { voice_id: 'LEO' }],
          duration: 15,
          resolution: '720p',
        },
      });

      const result = await provider.callApi('Use <AUDIO_0> and <AUDIO_1> for the speakers.');

      expect(result.error).toBeUndefined();
      expect(fetch.fetchWithProxy).toHaveBeenCalledTimes(3);
      const [url, init] = vi.mocked(fetch.fetchWithProxy).mock.calls[0];
      expect(url).toBe('https://api.x.ai/v1/videos/generations');
      expect(JSON.parse(init?.body as string)).toMatchObject({
        model: 'grok-imagine-video-1.5',
        image,
        reference_audios: [{ voice_id: 'eve' }, { voice_id: 'leo' }],
        duration: 15,
        resolution: '720p',
      });
      expect(result.metadata?.hasReferenceAudios).toBe(true);
      expect(result.cost).toBeCloseTo(2.11, 5);
      expect(videoUtils.storeCacheMapping).toHaveBeenCalledOnce();
    });

    it.each(video15Models)(
      'accepts visual reference modes with optional prompts for %s',
      async (model) => {
        vi.mocked(fetch.fetchWithProxy).mockImplementation(async (url) => {
          if (url === 'https://api.x.ai/v1/videos/generations') {
            return { ok: true, json: async () => ({ request_id: mockRequestId }) } as Response;
          }
          if (url === `https://api.x.ai/v1/videos/${mockRequestId}`) {
            return {
              ok: true,
              json: async () => ({ video: { url: mockVideoUrl, duration: 15 } }),
            } as Response;
          }
          if (url === mockVideoUrl) {
            return { ok: true, arrayBuffer: async () => new ArrayBuffer(1000) } as Response;
          }
          throw new Error(`Unexpected URL: ${url}`);
        });
        const image = { url: 'https://example.com/frame.jpg' };
        const reference_images = [{ url: 'https://example.com/reference.jpg' }];
        const reference_audios = [{ voice_id: ' Eve ' }];
        const configurations = [
          { image },
          { reference_images },
          { image, reference_images },
          { image, reference_audios },
          { reference_images, reference_audios },
          { image, reference_images, reference_audios },
        ];
        for (const config of configurations) {
          for (const prompt of ['', mockPrompt]) {
            const provider = new XAIVideoProvider(model, {
              config: {
                ...config,
                cacheNamespace: 'test-account',
                duration: 15,
                resolution: '720p',
              },
            });
            const result = await provider.callApi(prompt);
            expect(result.error).toBeUndefined();
            const createCall = vi.mocked(fetch.fetchWithProxy).mock.calls.at(-3)!;
            expect(JSON.parse(createCall[1]?.body as string)).toEqual({
              model: 'grok-imagine-video-1.5',
              ...(prompt ? { prompt } : {}),
              duration: 15,
              aspect_ratio: '16:9',
              resolution: '720p',
              ...config,
              ...(config.reference_audios ? { reference_audios: [{ voice_id: 'eve' }] } : {}),
            });
            const imageCount = (config.image ? 1 : 0) + (config.reference_images?.length ?? 0);
            expect(result.cost).toBeCloseTo(2.1 + imageCount * 0.01, 5);
          }
        }
        expect(videoUtils.storeCacheMapping).toHaveBeenCalledTimes(12);
      },
    );

    it.each([
      { model: 'grok-imagine-video-1.5', config: {} },
      { model: 'grok-imagine-video-1.5-preview', config: {} },
      { model: 'grok-imagine-video-1.5-2026-05-30', config: {} },
      { model: 'grok-imagine-video-1.5', config: { reference_audios: [{ voice_id: 'eve' }] } },
      {
        model: 'grok-imagine-video',
        config: { reference_images: [{ url: 'https://example.com/reference.jpg' }] },
      },
    ])('requires a prompt for %j', async ({ model, config }) => {
      const provider = new XAIVideoProvider(model, { config });
      const result = await provider.callApi('  ');
      expect(result.error).toContain('non-empty prompt');
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
      expect(videoUtils.checkVideoCache).not.toHaveBeenCalled();
    });

    it.each([
      [{ resolution: '1080p' }, 'capped at 720p'],
      [{ duration: 16 }, 'Must be between 1 and 15'],
      [
        {
          reference_images: Array.from({ length: 8 }, () => ({
            url: 'https://example.com/reference.jpg',
          })),
        },
        'Must be between 1 and 7',
      ],
    ])('validates mixed visual inputs without a prompt for %j', async (overrides, error) => {
      const provider = new XAIVideoProvider('grok-imagine-video-1.5', {
        config: {
          image: { url: 'https://example.com/frame.jpg' },
          reference_images: [{ url: 'https://example.com/reference.jpg' }],
          reference_audios: [{ voice_id: 'eve' }],
          ...overrides,
        } as any,
      });
      const result = await provider.callApi('');
      expect(result.error).toContain(error);
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

    it.each([
      [
        { reference_audios: ['eve', 'leo', 'ara', 'rex'].map((voice_id) => ({ voice_id })) },
        'Must be between 1 and 3',
      ],
      [{ reference_audios: { voice_id: 'eve' } }, 'must be an array'],
      [{ reference_audios: [null] }, 'non-empty voice_id'],
      [{ reference_audios: [{}] }, 'non-empty voice_id'],
      [{ reference_audios: [{ voice_id: 42 }] }, 'non-empty voice_id'],
      [{ reference_audios: [{ voice_id: '  ' }] }, 'non-empty voice_id'],
      [{ resolution: '1080p' }, 'capped at 720p'],
      [{ duration: 16 }, 'Must be between 1 and 15'],
    ])('preserves image-plus-voice validation for %j', async (overrides, error) => {
      const provider = new XAIVideoProvider('grok-imagine-video-1.5', {
        config: {
          image: { url: 'https://example.com/frame.jpg' },
          reference_audios: [{ voice_id: 'eve' }],
          ...overrides,
        } as any,
      });

      const result = await provider.callApi('Use <AUDIO_0> for the speaker.');

      expect(result.error).toContain(error);
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
      expect(videoUtils.checkVideoCache).not.toHaveBeenCalled();
    });

    it('rejects 1080p reference-to-video requests', async () => {
      const provider = new XAIVideoProvider('grok-imagine-video-1.5', {
        config: {
          reference_images: [{ url: 'https://example.com/reference.jpg' }],
          resolution: '1080p',
        },
      });

      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('capped at 720p');
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

    it('rejects more than seven reference images', async () => {
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: {
          reference_images: Array.from({ length: 8 }, (_, index) => ({
            url: `https://example.com/reference-${index}.jpg`,
          })),
        },
      });

      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('Must be between 1 and 7');
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

    it('rejects reference image requests longer than ten seconds', async () => {
      const provider = new XAIVideoProvider('grok-imagine-video', {
        config: {
          reference_images: [{ url: 'https://example.com/reference.jpg' }],
          duration: 11,
        },
      });

      const result = await provider.callApi(mockPrompt);

      expect(result.error).toContain('for reference-to-video');
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });
  });

  describe('Video editing', () => {
    it('rejects video editing for Grok Imagine Video 1.5', async () => {
      const provider = new XAIVideoProvider('grok-imagine-video-1.5', {
        config: { video: { url: 'https://example.com/source.mp4' } },
      });

      const result = await provider.callApi('Edit prompt');

      expect(result.error).toContain('does not support video editing');
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

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

    it('does not estimate edit cost from the ignored resolution config', async () => {
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
        config: {
          video: { url: 'https://example.com/source.mp4' },
          resolution: '480p',
        },
      });
      const result = await provider.callApi('Make the ball larger');

      expect(result.cost).toBeUndefined();
      expect(result.video?.resolution).toBeUndefined();
      expect(result.metadata?.resolution).toBeUndefined();
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
    it.each(['grok-imagine-video', 'grok-imagine-video-1.5'])(
      'isolates %s cache entries by endpoint and explicit account namespace',
      async (model) => {
        const actualVideoUtils = await vi.importActual<typeof videoUtils>(
          '../../../src/providers/video/utils',
        );
        vi.mocked(videoUtils.generateVideoCacheKey).mockImplementation(
          actualVideoUtils.generateVideoCacheKey,
        );
        const cache = new Map<string, string>();
        vi.mocked(videoUtils.checkVideoCache).mockImplementation(
          async (key) => cache.get(key) ?? null,
        );
        vi.mocked(videoUtils.storeCacheMapping).mockImplementation(async (key, value) => {
          cache.set(key, value);
        });
        vi.mocked(fetch.fetchWithProxy).mockImplementation(async (url) => {
          if (String(url).endsWith('/videos/generations')) {
            return { ok: true, json: async () => ({ request_id: mockRequestId }) } as Response;
          }
          if (String(url).endsWith(`/videos/${mockRequestId}`)) {
            return {
              ok: true,
              json: async () => ({ video: { url: mockVideoUrl, duration: 8 } }),
            } as Response;
          }
          if (url === mockVideoUrl) {
            return { ok: true, arrayBuffer: async () => new ArrayBuffer(1000) } as Response;
          }
          throw new Error(`Unexpected URL: ${url}`);
        });
        const configurations = [
          {
            apiBaseUrl: 'https://one.example.com/v1',
            cacheNamespace: 'account-a',
            apiKey: 'key-account-a',
          },
          {
            apiBaseUrl: 'https://two.example.com/v1',
            cacheNamespace: 'account-a',
            apiKey: 'key-account-a',
          },
          {
            apiBaseUrl: 'https://two.example.com/v1',
            cacheNamespace: 'account-b',
            apiKey: 'key-account-b',
          },
          {
            apiBaseUrl: 'https://one.example.com/v1',
            cacheNamespace: 'account-a',
            apiKey: 'rotated-key-account-a',
          },
        ];
        const results = [];
        for (const config of configurations) {
          const result = await new XAIVideoProvider(model, { config }).callApi(mockPrompt);
          expect(result.error).toBeUndefined();
          results.push(result);
        }
        expect(results.map(({ cached }) => cached)).toEqual([false, false, false, true]);
        expect(cache.size).toBe(3);
        expect(
          vi
            .mocked(fetch.fetchWithProxy)
            .mock.calls.filter(([url]) => String(url).endsWith('/videos/generations')),
        ).toHaveLength(3);
        const scopes = vi
          .mocked(videoUtils.generateVideoCacheKey)
          .mock.calls.map(([params]) => params.cacheScope);
        expect(scopes).toEqual(
          configurations.map(({ apiBaseUrl, cacheNamespace }) => ({
            'api-base-url': apiBaseUrl,
            'account-namespace': cacheNamespace,
          })),
        );
        expect(JSON.stringify(scopes)).not.toContain('key-account');
        expect(results[3].cost).toBe(0);
      },
    );

    it.each([
      { apiKey: 'account-a-key' },
      { apiKey: 'account-b-key' },
      { headers: { Authorization: 'Bearer custom-key' } },
      { cacheNamespace: '' },
      { cacheNamespace: 'test-xai-api-key' },
      { cacheNamespace: 'account-a', apiBaseUrl: 'https://user:password@example.com/v1' },
      { cacheNamespace: 'account-a', apiBaseUrl: 'https://example.com/v1?api_key=opaque-key' },
      { cacheNamespace: 'account-a', apiBaseUrl: 'https://example.com/v1#access_token=opaque-key' },
      { cacheNamespace: 'account-a', apiBaseUrl: 'https://example.com/token/opaque-key/v1' },
      {
        cacheNamespace: 'account-a',
        apiBaseUrl: 'https://example.com/token-credential-123456789/v1',
      },
    ])(
      'bypasses persistent caching when account or endpoint identity is unsafe: %j',
      async (config) => {
        vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(mockStorageKey);
        vi.mocked(fetch.fetchWithProxy)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ request_id: mockRequestId }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ video: { url: mockVideoUrl, duration: 8 } }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(1000),
          } as Response);
        const result = await new XAIVideoProvider('grok-imagine-video-1.5', { config }).callApi(
          mockPrompt,
        );
        expect(result.error).toBeUndefined();
        expect(result.cached).toBe(false);
        expect(result.cost).toBeCloseTo(1.12);
        expect(videoUtils.generateVideoCacheKey).not.toHaveBeenCalled();
        expect(videoUtils.checkVideoCache).not.toHaveBeenCalled();
        expect(videoUtils.storeCacheMapping).not.toHaveBeenCalled();
        expect(videoUtils.storeVideoContent).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.not.objectContaining({ contentHash: expect.anything() }),
          'xAI Video',
        );
      },
    );

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
        config: {
          cacheNamespace: 'test-account',
          duration: 5,
          aspect_ratio: '9:16',
          resolution: '480p',
        },
      });
      await provider.callApi(mockPrompt);

      expect(videoUtils.generateVideoCacheKey).toHaveBeenCalledWith({
        provider: 'xai',
        prompt: mockPrompt,
        model: 'grok-imagine-video',
        size: '9:16:480p',
        seconds: 5,
        inputReference: null,
        cacheScope: { 'api-base-url': 'https://api.x.ai/v1', 'account-namespace': 'test-account' },
      });
    });

    it.each(['grok-imagine-video', ...video15Models])(
      'preserves the image-only cache reference for %s',
      async (model) => {
        const imageUrl = 'https://example.com/image.jpg';

        vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(mockStorageKey);

        const provider = new XAIVideoProvider(model, {
          config: {
            cacheNamespace: 'test-account',
            image: { url: imageUrl },
            reference_audios: [],
          },
        });
        await provider.callApi(mockPrompt);

        expect(videoUtils.generateVideoCacheKey).toHaveBeenCalledWith(
          expect.objectContaining({
            inputReference: `image:${imageUrl}`,
          }),
        );
      },
    );

    it.each([{ reference_audios: [] }, { reference_audios: [{ voice_id: 'eve' }] }])(
      'bypasses persistent caching for Video 1.5 signed image URLs with voices %j',
      async ({ reference_audios }) => {
        vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(null);
        vi.mocked(fetch.fetchWithProxy).mockImplementation(async (url) => {
          if (url === 'https://api.x.ai/v1/videos/generations') {
            return {
              ok: true,
              json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
            } as any;
          }
          if (url === `https://api.x.ai/v1/videos/${mockRequestId}`) {
            return {
              ok: true,
              json: vi.fn().mockResolvedValue({
                video: { url: mockVideoUrl, duration: 5 },
                model: 'grok-imagine-video-1.5',
              }),
            } as any;
          }
          if (url === mockVideoUrl) {
            return {
              ok: true,
              arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
            } as any;
          }
          throw new Error(`Unexpected URL: ${url}`);
        });

        const firstSignedUrl =
          'https://bucket.s3.amazonaws.com/source.png?version=1&X-Amz-Credential=credential-one&X-Amz-Date=20260803T000000Z&X-Amz-Expires=900&X-Amz-Signature=signature-one';
        const rotatedSignedUrl =
          'https://bucket.s3.amazonaws.com/source.png?version=1&X-Amz-Credential=credential-two&X-Amz-Date=20260803T010000Z&X-Amz-Expires=900&X-Amz-Signature=signature-two';
        const differentResourceUrl =
          'https://bucket.s3.amazonaws.com/other.png?version=1&X-Amz-Credential=credential-three&X-Amz-Date=20260803T020000Z&X-Amz-Expires=900&X-Amz-Signature=signature-three';

        for (const url of [firstSignedUrl, rotatedSignedUrl, differentResourceUrl]) {
          const result = await new XAIVideoProvider('grok-imagine-video-1.5', {
            config: { cacheNamespace: 'test-account', image: { url }, reference_audios },
          }).callApi(mockPrompt);
          expect(result.error).toBeUndefined();
        }

        expect(videoUtils.generateVideoCacheKey).not.toHaveBeenCalled();
        expect(videoUtils.checkVideoCache).not.toHaveBeenCalled();
        expect(videoUtils.storeCacheMapping).not.toHaveBeenCalled();

        const submittedImageUrls = vi
          .mocked(fetch.fetchWithProxy)
          .mock.calls.filter(([url]) => url === 'https://api.x.ai/v1/videos/generations')
          .map(([, init]) => JSON.parse(init?.body as string).image.url);
        expect(submittedImageUrls).toEqual([
          firstSignedUrl,
          rotatedSignedUrl,
          differentResourceUrl,
        ]);
      },
    );

    it('bypasses persistent caching for colliding Video 1.5 access_token image URLs', async () => {
      vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(mockStorageKey);
      vi.mocked(fetch.fetchWithProxy).mockImplementation(async (url) => {
        if (url === 'https://api.x.ai/v1/videos/generations') {
          return {
            ok: true,
            json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
          } as any;
        }
        if (url === `https://api.x.ai/v1/videos/${mockRequestId}`) {
          return {
            ok: true,
            json: vi.fn().mockResolvedValue({
              video: { url: mockVideoUrl, duration: 5 },
              model: 'grok-imagine-video-1.5',
            }),
          } as any;
        }
        if (url === mockVideoUrl) {
          return {
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
          } as any;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });
      const firstUrl = 'https://media.example.com/source.png?version=1&access_token=secret-one';
      const secondUrl = 'https://media.example.com/source.png?version=1&access_token=secret-two';

      for (const url of [firstUrl, secondUrl]) {
        await new XAIVideoProvider('grok-imagine-video-1.5', {
          config: { cacheNamespace: 'test-account', image: { url } },
        }).callApi(mockPrompt);
      }

      expect(videoUtils.generateVideoCacheKey).not.toHaveBeenCalled();
      expect(videoUtils.checkVideoCache).not.toHaveBeenCalled();
      expect(videoUtils.storeCacheMapping).not.toHaveBeenCalled();
      const submittedImageUrls = vi
        .mocked(fetch.fetchWithProxy)
        .mock.calls.filter(([url]) => url === 'https://api.x.ai/v1/videos/generations')
        .map(([, init]) => JSON.parse(init?.body as string).image.url);
      expect(submittedImageUrls).toEqual([firstUrl, secondUrl]);
    });

    it('preserves the legacy reference-image identity within an account cache scope', async () => {
      const actualVideoUtils = await vi.importActual<typeof videoUtils>(
        '../../../src/providers/video/utils',
      );
      const referenceImages = [
        { url: 'https://example.com/first.jpg' },
        { url: 'https://example.com/second.jpg' },
      ];
      const legacyInputReference = `reference_images:${referenceImages
        .map(({ url }) => url)
        .join('|')}`;
      const parameters = {
        provider: 'xai',
        prompt: mockPrompt,
        model: 'grok-imagine-video',
        size: '16:9:720p',
        seconds: 8,
        inputReference: legacyInputReference,
      };
      const oldUnscopedKey = actualVideoUtils.generateVideoCacheKey(parameters);
      const scopedKey = actualVideoUtils.generateVideoCacheKey({
        ...parameters,
        cacheScope: { 'api-base-url': 'https://api.x.ai/v1', 'account-namespace': 'test-account' },
      });
      vi.mocked(videoUtils.generateVideoCacheKey).mockImplementation(
        actualVideoUtils.generateVideoCacheKey,
      );
      vi.mocked(videoUtils.checkVideoCache).mockImplementation(async (cacheKey) =>
        cacheKey === scopedKey ? mockStorageKey : null,
      );

      const result = await new XAIVideoProvider('grok-imagine-video', {
        config: { cacheNamespace: 'test-account', reference_images: referenceImages },
      }).callApi(mockPrompt);

      expect(scopedKey).not.toBe(oldUnscopedKey);
      expect(videoUtils.checkVideoCache).toHaveBeenCalledWith(scopedKey, 'xAI Video');
      expect(result.cached).toBe(true);
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      'bypasses persistent caching for signed Video 1.5 reference-image URLs with mixed inputs %s',
      async (mixedInputs) => {
        vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(mockStorageKey);
        vi.mocked(fetch.fetchWithProxy).mockImplementation(async (url) => {
          if (url === 'https://api.x.ai/v1/videos/generations') {
            return {
              ok: true,
              json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
            } as any;
          }
          if (url === `https://api.x.ai/v1/videos/${mockRequestId}`) {
            return {
              ok: true,
              json: vi.fn().mockResolvedValue({
                video: { url: mockVideoUrl, duration: 12 },
                model: 'grok-imagine-video-1.5',
              }),
            } as any;
          }
          if (url === mockVideoUrl) {
            return {
              ok: true,
              arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
            } as any;
          }
          throw new Error(`Unexpected URL: ${url}`);
        });
        const firstSignedUrl =
          'https://bucket.s3.amazonaws.com/reference.png?version=1&X-Amz-Credential=credential-one&X-Amz-Date=20260803T000000Z&X-Amz-Expires=900&X-Amz-Signature=signature-one';
        const rotatedSignedUrl =
          'https://bucket.s3.amazonaws.com/reference.png?version=1&X-Amz-Credential=credential-two&X-Amz-Date=20260803T010000Z&X-Amz-Expires=900&X-Amz-Signature=signature-two';

        for (const url of [firstSignedUrl, rotatedSignedUrl]) {
          const result = await new XAIVideoProvider('grok-imagine-video-1.5', {
            config: {
              cacheNamespace: 'test-account',
              duration: 12,
              reference_images: [{ url }],
              ...(mixedInputs
                ? {
                    image: { url: 'https://example.com/frame.jpg' },
                    reference_audios: [{ voice_id: 'eve' }],
                  }
                : {}),
            },
          }).callApi(mockPrompt);
          expect(result.error).toBeUndefined();
        }

        expect(videoUtils.generateVideoCacheKey).not.toHaveBeenCalled();
        expect(videoUtils.checkVideoCache).not.toHaveBeenCalled();
        expect(videoUtils.storeCacheMapping).not.toHaveBeenCalled();
        const submittedReferenceUrls = vi
          .mocked(fetch.fetchWithProxy)
          .mock.calls.filter(([url]) => url === 'https://api.x.ai/v1/videos/generations')
          .map(([, init]) => JSON.parse(init?.body as string).reference_images[0].url);
        expect(submittedReferenceUrls).toEqual([firstSignedUrl, rotatedSignedUrl]);
      },
    );

    it('bypasses persistent caching for colliding credential path reference-image URLs', async () => {
      vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(mockStorageKey);
      vi.mocked(fetch.fetchWithProxy).mockImplementation(async (url) => {
        if (url === 'https://api.x.ai/v1/videos/generations') {
          return {
            ok: true,
            json: vi.fn().mockResolvedValue({ request_id: mockRequestId }),
          } as any;
        }
        if (url === `https://api.x.ai/v1/videos/${mockRequestId}`) {
          return {
            ok: true,
            json: vi.fn().mockResolvedValue({
              video: { url: mockVideoUrl, duration: 12 },
              model: 'grok-imagine-video-1.5',
            }),
          } as any;
        }
        if (url === mockVideoUrl) {
          return {
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
          } as any;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });
      const firstCredentialUrl =
        'https://media.example.com/token-credential-one-123456789/reference.png?version=1';
      const rotatedCredentialUrl =
        'https://media.example.com/token-credential-two-987654321/reference.png?version=1';

      for (const url of [firstCredentialUrl, rotatedCredentialUrl]) {
        await new XAIVideoProvider('grok-imagine-video-1.5', {
          config: { cacheNamespace: 'test-account', duration: 12, reference_images: [{ url }] },
        }).callApi(mockPrompt);
      }

      expect(videoUtils.generateVideoCacheKey).not.toHaveBeenCalled();
      expect(videoUtils.checkVideoCache).not.toHaveBeenCalled();
      expect(videoUtils.storeCacheMapping).not.toHaveBeenCalled();
      const submittedReferenceUrls = vi
        .mocked(fetch.fetchWithProxy)
        .mock.calls.filter(([url]) => url === 'https://api.x.ai/v1/videos/generations')
        .map(([, init]) => JSON.parse(init?.body as string).reference_images[0].url);
      expect(submittedReferenceUrls).toEqual([firstCredentialUrl, rotatedCredentialUrl]);
    });

    it('preserves benign UUID resource identity in Video 1.5 reference-image cache keys', async () => {
      const actualVideoUtils = await vi.importActual<typeof videoUtils>(
        '../../../src/providers/video/utils',
      );
      vi.mocked(videoUtils.generateVideoCacheKey).mockImplementation(
        actualVideoUtils.generateVideoCacheKey,
      );
      vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(mockStorageKey);
      const firstResourceUrl =
        'https://media.example.com/123e4567-e89b-12d3-a456-426614174000/reference.png';
      const secondResourceUrl =
        'https://media.example.com/123e4567-e89b-12d3-a456-426614174001/reference.png';

      for (const url of [firstResourceUrl, secondResourceUrl]) {
        await new XAIVideoProvider('grok-imagine-video-1.5', {
          config: { cacheNamespace: 'test-account', duration: 12, reference_images: [{ url }] },
        }).callApi(mockPrompt);
      }

      const cacheKeys = vi
        .mocked(videoUtils.checkVideoCache)
        .mock.calls.map(([cacheKey]) => cacheKey);
      const inputReferences = vi
        .mocked(videoUtils.generateVideoCacheKey)
        .mock.calls.map(([params]) => params.inputReference as string);
      expect(cacheKeys[0]).not.toBe(cacheKeys[1]);
      expect(inputReferences).toEqual([
        expect.stringContaining('123e4567-e89b-12d3-a456-426614174000'),
        expect.stringContaining('123e4567-e89b-12d3-a456-426614174001'),
      ]);
      expect(videoUtils.checkVideoCache).toHaveBeenCalledTimes(2);
      expect(videoUtils.storeCacheMapping).not.toHaveBeenCalled();
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

    it('uses distinct cache references for image and reference-image modes', async () => {
      const sharedUrl = 'https://example.com/shared.jpg';

      vi.mocked(videoUtils.checkVideoCache).mockResolvedValue('cached-video-key');

      await new XAIVideoProvider('grok-imagine-video', {
        config: { cacheNamespace: 'test-account', image: { url: sharedUrl } },
      }).callApi(mockPrompt);
      await new XAIVideoProvider('grok-imagine-video', {
        config: { cacheNamespace: 'test-account', reference_images: [{ url: sharedUrl }] },
      }).callApi(mockPrompt);

      expect(videoUtils.generateVideoCacheKey).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          inputReference: `image:${sharedUrl}`,
        }),
      );
      expect(videoUtils.generateVideoCacheKey).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          inputReference: `reference_images:${sharedUrl}`,
        }),
      );
    });

    it('partitions all visual reference cache entries and reuses normalized requests', async () => {
      const actualVideoUtils = await vi.importActual<typeof videoUtils>(
        '../../../src/providers/video/utils',
      );
      vi.mocked(videoUtils.generateVideoCacheKey).mockImplementation(
        actualVideoUtils.generateVideoCacheKey,
      );
      const cache = new Map<string, string>();
      vi.mocked(videoUtils.checkVideoCache).mockImplementation(
        async (key) => cache.get(key) ?? null,
      );
      vi.mocked(videoUtils.storeCacheMapping).mockImplementation(async (key, storageKey) => {
        cache.set(key, storageKey);
      });
      vi.mocked(videoUtils.storeVideoContent).mockImplementation(async (_buffer, metadata) => ({
        storageRef: {
          provider: 'filesystem',
          key: `video/${metadata.contentHash}.mp4`,
          contentHash: metadata.contentHash ?? 'test-hash',
          metadata,
        },
      }));
      vi.mocked(fetch.fetchWithProxy).mockImplementation(async (url) => {
        if (url === 'https://api.x.ai/v1/videos/generations') {
          return { ok: true, json: async () => ({ request_id: mockRequestId }) } as Response;
        }
        if (url === `https://api.x.ai/v1/videos/${mockRequestId}`) {
          return {
            ok: true,
            json: async () => ({ video: { url: mockVideoUrl, duration: 8 } }),
          } as Response;
        }
        if (url === mockVideoUrl) {
          return { ok: true, arrayBuffer: async () => new ArrayBuffer(1000) } as Response;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });
      const imageUrl = 'https://example.com/frame.jpg?b=2&a=1';
      const canonicalImageUrl = 'https://example.com/frame.jpg?a=1&b=2';
      const provider = new XAIVideoProvider('grok-imagine-video-1.5', {
        config: { cacheNamespace: 'test-account', image: { url: imageUrl } },
      });
      const referenceImage = { url: 'https://example.com/reference.jpg?b=2&a=1' };
      const otherReferenceImage = { url: 'https://example.com/other-reference.jpg' };
      const configurations = [
        {},
        { reference_audios: [{ voice_id: 'eve' }] },
        { reference_audios: [{ voice_id: 'leo' }] },
        { image: { url: canonicalImageUrl }, reference_audios: [{ voice_id: ' EVE ' }] },
        {
          image: { url: 'https://example.com/other.jpg' },
          reference_audios: [{ voice_id: 'eve' }],
        },
        { reference_images: [referenceImage], reference_audios: [{ voice_id: 'eve' }] },
        { reference_images: [otherReferenceImage], reference_audios: [{ voice_id: 'eve' }] },
        { reference_images: [referenceImage] },
        {
          reference_images: [referenceImage, otherReferenceImage],
          reference_audios: [{ voice_id: 'eve' }],
        },
        {
          reference_images: [otherReferenceImage, referenceImage],
          reference_audios: [{ voice_id: 'eve' }],
        },
        {
          image: { url: canonicalImageUrl },
          reference_images: [{ url: 'https://example.com/reference.jpg?a=1&b=2' }],
          reference_audios: [{ voice_id: ' EVE ' }],
        },
      ];
      const results = [];
      for (const config of configurations) {
        const result = await provider.callApi(mockPrompt, {
          prompt: { raw: mockPrompt, label: mockPrompt, config },
          vars: {},
        });
        expect(result.error).toBeUndefined();
        results.push(result);
      }

      expect(results.map(({ cached }) => cached)).toEqual([
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
      ]);
      const storageKeys = results.map(({ video }) => video?.storageRef?.key);
      expect(new Set(storageKeys).size).toBe(9);
      expect(storageKeys[3]).toBe(storageKeys[1]);
      expect(storageKeys[10]).toBe(storageKeys[5]);
      expect(cache.size).toBe(9);
      expect(videoUtils.storeCacheMapping).toHaveBeenCalledTimes(9);
      const inputReferences = vi
        .mocked(videoUtils.generateVideoCacheKey)
        .mock.calls.map(([params]) => params.inputReference);
      expect(inputReferences[0]).toBe(`image:${canonicalImageUrl}`);
      expect(inputReferences[1]).toBe(inputReferences[3]);
      expect(inputReferences[1]).toContain(canonicalImageUrl);
      expect(inputReferences[5]).toBe(inputReferences[10]);
      expect(inputReferences[5]).toContain('https://example.com/reference.jpg?a=1&b=2');
      const submittedBodies = vi
        .mocked(fetch.fetchWithProxy)
        .mock.calls.filter(([url]) => url === 'https://api.x.ai/v1/videos/generations')
        .map(([, init]) => JSON.parse(init?.body as string));
      expect(submittedBodies).toHaveLength(9);
      expect(submittedBodies.map(({ reference_audios }) => reference_audios)).toEqual([
        undefined,
        [{ voice_id: 'eve' }],
        [{ voice_id: 'leo' }],
        [{ voice_id: 'eve' }],
        [{ voice_id: 'eve' }],
        [{ voice_id: 'eve' }],
        undefined,
        [{ voice_id: 'eve' }],
        [{ voice_id: 'eve' }],
      ]);
      expect(submittedBodies[1].image.url).toBe(imageUrl);
      expect(submittedBodies[4].reference_images).toEqual([referenceImage]);
    });

    it('keeps modes, delimiters, and media order unambiguous in visual cache identities', async () => {
      const actualVideoUtils = await vi.importActual<typeof videoUtils>(
        '../../../src/providers/video/utils',
      );
      vi.mocked(videoUtils.generateVideoCacheKey).mockImplementation(
        actualVideoUtils.generateVideoCacheKey,
      );
      vi.mocked(videoUtils.checkVideoCache).mockResolvedValue(mockStorageKey);
      const imageUrl = 'https://example.com/frame.jpg';
      const configurations = [
        { image: { url: `${imageUrl};reference_audios:eve` } },
        { image: { url: imageUrl }, reference_audios: [{ voice_id: 'eve' }] },
        { image: { url: imageUrl }, reference_audios: [{ voice_id: 'eve|leo' }] },
        { image: { url: imageUrl }, reference_audios: [{ voice_id: 'eve' }, { voice_id: 'leo' }] },
        { image: { url: imageUrl }, reference_audios: [{ voice_id: 'leo' }, { voice_id: 'eve' }] },
        { reference_images: [{ url: imageUrl }], reference_audios: [{ voice_id: 'eve' }] },
        { image: { url: imageUrl }, reference_images: [{ url: `${imageUrl}|${imageUrl}` }] },
        { image: { url: imageUrl }, reference_images: [{ url: imageUrl }, { url: imageUrl }] },
      ];
      for (const config of configurations) {
        const result = await new XAIVideoProvider('grok-imagine-video-1.5', {
          config: { ...config, cacheNamespace: 'test-account' },
        }).callApi(mockPrompt);
        expect(result.error).toBeUndefined();
        expect(result.cached).toBe(true);
      }

      const keys = vi.mocked(videoUtils.checkVideoCache).mock.calls.map(([key]) => key);
      expect(new Set(keys).size).toBe(configurations.length);
      expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
    });

    it('includes reference voice IDs in the cache key', async () => {
      vi.mocked(videoUtils.checkVideoCache).mockResolvedValue('cached-video-key');

      await new XAIVideoProvider('grok-imagine-video-1.5', {
        config: {
          cacheNamespace: 'test-account',
          reference_audios: [{ voice_id: 'Eve' }, { voice_id: ' leo ' }],
        },
      }).callApi('Use both preset voices.');

      expect(videoUtils.generateVideoCacheKey).toHaveBeenCalledWith(
        expect.objectContaining({
          inputReference: JSON.stringify({
            type: 'xai-reference-media',
            reference_images: [],
            reference_audios: ['eve', 'leo'],
          }),
        }),
      );
    });

    it('uses unambiguous cache identities for mixed reference media', async () => {
      vi.mocked(videoUtils.checkVideoCache).mockResolvedValue('cached-video-key');
      const baseUrl = 'https://img.example/p.jpg';

      await new XAIVideoProvider('grok-imagine-video-1.5', {
        config: {
          cacheNamespace: 'test-account',
          reference_images: [{ url: `${baseUrl};reference_audios:eve` }],
        },
      }).callApi(mockPrompt);
      await new XAIVideoProvider('grok-imagine-video-1.5', {
        config: {
          cacheNamespace: 'test-account',
          reference_images: [{ url: baseUrl }],
          reference_audios: [{ voice_id: 'eve' }],
        },
      }).callApi(mockPrompt);

      const firstReference = vi.mocked(videoUtils.generateVideoCacheKey).mock.calls[0][0]
        .inputReference;
      const secondReference = vi.mocked(videoUtils.generateVideoCacheKey).mock.calls[1][0]
        .inputReference;
      expect(firstReference).toBe(
        JSON.stringify({
          type: 'xai-reference-media',
          reference_images: [`${baseUrl};reference_audios:eve`],
          reference_audios: [],
        }),
      );
      expect(secondReference).toBe(
        JSON.stringify({
          type: 'xai-reference-media',
          reference_images: [baseUrl],
          reference_audios: ['eve'],
        }),
      );
      expect(firstReference).not.toBe(secondReference);
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
