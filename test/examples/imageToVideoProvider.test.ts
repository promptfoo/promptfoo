import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error - provider.js is a plain JavaScript example module without type definitions
import ImageToVideoAiProvider from '../../examples/provider-image-to-video-ai/provider.js';

describe('ImageToVideoAiProvider', () => {
  beforeEach(() => {
    vi.stubEnv('IMAGE_TO_VIDEO_AI_API_KEY', undefined);
    vi.stubEnv('IMAGE_TO_VIDEO_AI_BASE_URL', undefined);
    vi.stubEnv('MOCK_IMAGE_TO_VIDEO', undefined);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('initializes with default values', () => {
    const provider = new ImageToVideoAiProvider();
    expect(provider.id()).toBe('provider-image-to-video-ai');
    expect(provider.pollIntervalMs).toBe(500);
    expect(provider.maxPollAttempts).toBe(30);
    expect(provider.defaultDuration).toBe(5);
    expect(provider.defaultFps).toBe(24);
    expect(provider.defaultResolution).toBe('1280x720');
  });

  it('initializes with custom config options', () => {
    const provider = new ImageToVideoAiProvider({
      id: 'custom-video-id',
      config: {
        apiKey: 'test-api-key',
        baseUrl: 'https://custom.api.test/v1',
        pollIntervalMs: 100,
        maxPollAttempts: 10,
        defaultDuration: 10,
        defaultFps: 30,
        defaultResolution: '1920x1080',
      },
    });

    expect(provider.id()).toBe('custom-video-id');
    expect(provider.apiKey).toBe('test-api-key');
    expect(provider.baseUrl).toBe('https://custom.api.test/v1');
    expect(provider.pollIntervalMs).toBe(100);
    expect(provider.maxPollAttempts).toBe(10);
    expect(provider.defaultDuration).toBe(10);
    expect(provider.defaultFps).toBe(30);
    expect(provider.defaultResolution).toBe('1920x1080');
  });

  describe('Simulated / Mock mode (no API key or mock flag)', () => {
    it('runs deterministic simulation when no API key is set', async () => {
      const provider = new ImageToVideoAiProvider();
      const result = await provider.callApi('Misty mountains at sunrise', {
        vars: {
          imageUrl: 'https://example.com/mountain.jpg',
          motion: 'pan-left',
          duration: 6,
          fps: 30,
          resolution: '1920x1080',
        },
      });

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('[Video Result](https://storage.imagetovideoai.pro/renders/');
      expect(result.output).toContain('.mp4');
      expect(result.output).toContain('Status: completed');
      expect(result.output).toContain('Duration: 6s');

      expect(result.metadata).toMatchObject({
        status: 'completed',
        duration: 6,
        fps: 30,
        resolution: '1920x1080',
        motion: 'pan-left',
        sourceImageUrl: 'https://example.com/mountain.jpg',
        simulated: true,
      });
      expect(result.metadata.jobId).toMatch(/^job-sim-/);
      expect(result.metadata.videoUrl).toMatch(/\.mp4$/);
    });

    it('falls back to default duration, fps, resolution, and imageUrl if omitted in vars', async () => {
      const provider = new ImageToVideoAiProvider();
      const result = await provider.callApi('Subtle portrait motion');

      expect(result.metadata).toMatchObject({
        status: 'completed',
        duration: 5,
        fps: 24,
        resolution: '1280x720',
        motion: 'cinematic-pan',
        simulated: true,
      });
      expect(result.metadata.sourceImageUrl).toBeDefined();
    });
  });

  describe('Live API mode (with mocked fetch)', () => {
    it('submits job and polls until completion', async () => {
      const mockFetch = vi.fn();

      // First call: submit job
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ task_id: 'task-12345', status: 'queued' }),
      });

      // Second call: poll 1 (processing)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ task_id: 'task-12345', status: 'processing' }),
      });

      // Third call: poll 2 (completed)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          task_id: 'task-12345',
          status: 'completed',
          video_url: 'https://storage.example.com/output.mp4',
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new ImageToVideoAiProvider({
        config: {
          apiKey: 'test-secret-key',
          pollIntervalMs: 1, // fast poll in test
          maxPollAttempts: 5,
        },
      });

      const result = await provider.callApi('Sunset timelapse', {
        vars: {
          imageUrl: 'https://example.com/sunset.jpg',
          motion: 'timelapse',
          duration: 4,
        },
      });

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('[Video Result](https://storage.example.com/output.mp4)');
      expect(result.output).toContain('Status: completed');
      expect(result.output).toContain('Duration: 4s');
      expect(result.metadata).toMatchObject({
        jobId: 'task-12345',
        status: 'completed',
        videoUrl: 'https://storage.example.com/output.mp4',
        duration: 4,
        pollAttempts: 2,
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Verify submit endpoint
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.imagetovideoai.pro/v1/generate',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-secret-key',
          },
        }),
      );
      // Verify poll endpoint
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.imagetovideoai.pro/v1/tasks/task-12345',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-secret-key',
          },
        }),
      );
    });

    it('returns structured error when job submission fails', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid image format',
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new ImageToVideoAiProvider({
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('Invalid prompt');
      expect(result.error).toContain(
        'Image to Video API submission failed (HTTP 400): Invalid image format',
      );
      expect(result.output).toBeUndefined();
    });

    it('returns structured error when task status polling fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ task_id: 'task-999', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          text: async () => 'Bad Gateway',
        });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new ImageToVideoAiProvider({
        config: { apiKey: 'test-key', pollIntervalMs: 1 },
      });

      const result = await provider.callApi('Some prompt');
      expect(result.error).toContain('Task status polling failed (HTTP 502): Bad Gateway');
    });

    it('returns structured error when task status becomes failed', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ task_id: 'task-fail', status: 'queued' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            task_id: 'task-fail',
            status: 'failed',
            error: 'Content policy violation',
          }),
        });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new ImageToVideoAiProvider({
        config: { apiKey: 'test-key', pollIntervalMs: 1 },
      });

      const result = await provider.callApi('Disallowed prompt');
      expect(result.error).toContain(
        'Video generation task task-fail failed: Content policy violation',
      );
      expect(result.metadata).toMatchObject({
        jobId: 'task-fail',
        status: 'failed',
      });
    });

    it('returns timeout error when polling exceeds maxPollAttempts', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ task_id: 'task-slow', status: 'processing' }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = new ImageToVideoAiProvider({
        config: {
          apiKey: 'test-key',
          pollIntervalMs: 1,
          maxPollAttempts: 2,
        },
      });

      const result = await provider.callApi('Slow render');
      expect(result.error).toContain('timed out after 2 polling attempts');
      expect(result.metadata).toMatchObject({
        jobId: 'task-slow',
        status: 'processing',
        attempts: 2,
      });
    });

    it('handles unexpected fetch exceptions gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('DNS resolution failed'));
      vi.stubGlobal('fetch', mockFetch);

      const provider = new ImageToVideoAiProvider({
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('Test network failure');
      expect(result.error).toContain(
        'Unexpected error during image-to-video generation: DNS resolution failed',
      );
    });
  });
});
