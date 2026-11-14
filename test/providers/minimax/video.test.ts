import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMiniMaxVideoProvider,
  MiniMaxVideoProvider,
} from '../../../src/providers/minimax/video';
import * as videoUtils from '../../../src/providers/video/utils';
import * as fetch from '../../../src/util/fetch/index';

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof fetch>()),
  fetchWithProxy: vi.fn(),
}));
vi.mock('../../../src/providers/video/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof videoUtils>();
  return {
    ...actual,
    buildStorageRefUrl: vi.fn(() => 'storageRef:video/test.mp4'),
    formatVideoOutput: vi.fn(() => '[Video](storageRef:video/test.mp4)'),
    storeVideoContent: vi.fn(async () => ({ storageRef: { key: 'video/test.mp4' } })),
  };
});

const createResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const mockSuccessfulRequest = (downloadStatus = 200) => {
  vi.mocked(fetch.fetchWithProxy)
    .mockResolvedValueOnce(createResponse({ task_id: 'task-1', base_resp: { status_code: 0 } }))
    .mockResolvedValueOnce(
      createResponse({
        task: { status: 'succeeded', content: { url: 'https://cdn.hailuoai.com/video.mp4' } },
        base_resp: { status_code: 0 },
      }),
    )
    .mockResolvedValueOnce(new Response(Buffer.from('video'), { status: downloadStatus }));
};

describe('MiniMax H3 video provider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('MINIMAX_API_KEY', 'test-key');
    vi.mocked(videoUtils.buildStorageRefUrl).mockReturnValue('storageRef:video/test.mp4');
    vi.mocked(videoUtils.formatVideoOutput).mockReturnValue('[Video](storageRef:video/test.mp4)');
    vi.mocked(videoUtils.storeVideoContent).mockResolvedValue({
      storageRef: {
        provider: 'filesystem',
        key: 'video/test.mp4',
        contentHash: 'test-hash',
        metadata: { contentType: 'video/mp4', mediaType: 'video', sizeBytes: 5 },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates providers with default and custom identifiers', () => {
    expect(createMiniMaxVideoProvider('minimax:video:').id()).toBe('minimax:video:MiniMax-H3');
    const provider = new MiniMaxVideoProvider('MiniMax-H3', { id: 'custom-video' });
    expect(provider.id()).toBe('custom-video');
    expect(provider.toString()).toBe('[MiniMax Video Provider MiniMax-H3]');
  });

  it('sends H3 content and polls the task content URL', async () => {
    mockSuccessfulRequest();
    const provider = new MiniMaxVideoProvider('MiniMax-H3');
    const result = await provider.callApi('A cinematic city', {
      prompt: {
        config: {
          duration: 8,
          resolution: '2K',
          content: [{ type: 'text', text: 'A cinematic city' }],
          aigc_watermark: true,
        },
      },
      evaluationId: 'eval-1',
    });

    expect(result.error).toBeUndefined();
    expect(result.video).toMatchObject({
      id: 'task-1',
      duration: 8,
      model: 'MiniMax-H3',
      resolution: '2K',
    });
    expect(result.metadata).toMatchObject({ taskId: 'task-1', status: 'succeeded' });
    expect(vi.mocked(fetch.fetchWithProxy).mock.calls[0]?.[0]).toBe(
      'https://api.minimax.io/v2/video_generation',
    );
    expect(vi.mocked(fetch.fetchWithProxy).mock.calls[1]?.[0]).toBe(
      'https://api.minimax.io/v2/query/video_generation/task-1',
    );
    const body = JSON.parse(String(vi.mocked(fetch.fetchWithProxy).mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      model: 'MiniMax-H3',
      content: [{ type: 'text', text: 'A cinematic city' }],
      resolution: '2K',
      duration: 8,
      ratio: '16:9',
      aigc_watermark: true,
    });
    expect(videoUtils.storeVideoContent).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ evalId: 'eval-1' }),
      'MiniMax Video',
    );
  });

  it('uses configured authentication, endpoint, headers, and default content', async () => {
    mockSuccessfulRequest();
    const provider = new MiniMaxVideoProvider('', {
      config: {
        apiKey: 'configured-key',
        apiBaseUrl: 'https://api.example.cn/v2/video_generation/',
        headers: { 'X-Test': 'yes', 'X-Promptfoo-Silent': 'false' },
      },
    });
    await provider.callApi('A mountain lake');

    const [url, options] = vi.mocked(fetch.fetchWithProxy).mock.calls[0]!;
    expect(url).toBe('https://api.example.cn/v2/video_generation');
    const headers = new Headers(options?.headers);
    expect(headers.get('authorization')).toBe('Bearer configured-key');
    expect(headers.get('x-test')).toBe('yes');
    expect(headers.get('x-promptfoo-silent')).toBe('true');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      model: 'MiniMax-H3',
      content: [{ type: 'text', text: 'A mountain lake' }],
      resolution: '2K',
      duration: 6,
    });
  });

  it('uses the scoped video endpoint ahead of the process environment', async () => {
    vi.stubEnv('MINIMAX_VIDEO_API_BASE_URL', 'https://global.example/v2/video_generation');
    mockSuccessfulRequest();
    const provider = new MiniMaxVideoProvider('MiniMax-H3', {
      env: { MINIMAX_VIDEO_API_BASE_URL: 'https://regional.example/v2/video_generation' },
    });

    expect((await provider.callApi('regional clip')).error).toBeUndefined();
    expect(
      vi
        .mocked(fetch.fetchWithProxy)
        .mock.calls.slice(0, 2)
        .map(([url]) => url),
    ).toEqual([
      'https://regional.example/v2/video_generation',
      'https://regional.example/v2/query/video_generation/task-1',
    ]);
  });

  it('serializes URL media as objects and defaults to adaptive framing', async () => {
    mockSuccessfulRequest();
    const provider = new MiniMaxVideoProvider('MiniMax-H3', {
      config: {
        content: [
          { type: 'image_url', image_url: 'https://example.test/frame.jpg', role: 'first_frame' },
        ],
      },
    });
    expect((await provider.callApi('image')).error).toBeUndefined();
    const request = vi.mocked(fetch.fetchWithProxy).mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      ratio: 'adaptive',
      content: [
        { type: 'text', text: 'image' },
        {
          type: 'image_url',
          image_url: { url: 'https://example.test/frame.jpg' },
          role: 'first_frame',
        },
      ],
    });
  });

  it('rejects adaptive aspect ratio for text-only requests', async () => {
    const provider = new MiniMaxVideoProvider('MiniMax-H3', { config: { ratio: 'adaptive' } });
    expect((await provider.callApi('text')).error).toContain('concrete aspect ratio');
    expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
  });

  it('stops polling on a cancelled task', async () => {
    vi.mocked(fetch.fetchWithProxy)
      .mockResolvedValueOnce(createResponse({ task_id: 'task-5' }))
      .mockResolvedValueOnce(createResponse({ task: { status: 'cancelled' } }));
    expect((await new MiniMaxVideoProvider().callApi('text')).error).toContain('status=cancelled');
    expect(fetch.fetchWithProxy).toHaveBeenCalledTimes(2);
  });

  it('polls pending tasks until a nested task succeeds', async () => {
    vi.mocked(fetch.fetchWithProxy)
      .mockResolvedValueOnce(createResponse({ task_id: 'task-2' }))
      .mockResolvedValueOnce(createResponse({ data: { status: 'processing' } }))
      .mockResolvedValueOnce(
        createResponse({
          data: { task: { status: '2', video_url: 'https://cdn.hailuoai.com/v.mp4' } },
        }),
      )
      .mockResolvedValueOnce(new Response(Buffer.from('video'), { status: 200 }));
    const provider = new MiniMaxVideoProvider('MiniMax-H3', {
      config: { poll_interval_ms: 0, max_poll_time_ms: 1000 },
    });

    const result = await provider.callApi('A city at night');

    expect(result.error).toBeUndefined();
    expect(fetch.fetchWithProxy).toHaveBeenCalledTimes(4);
  });

  it('returns an authentication error when no API key is configured', async () => {
    vi.stubEnv('MINIMAX_API_KEY', '');
    const result = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(result.error).toContain('MINIMAX_API_KEY');
    expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
  });

  it.each([3, 16, 4.5])('rejects invalid duration %s', async (duration) => {
    const provider = new MiniMaxVideoProvider('MiniMax-H3', { config: { duration } });
    expect((await provider.callApi('prompt')).error).toContain('between 4 and 15');
  });

  it('rejects unsupported resolution', async () => {
    const provider = new MiniMaxVideoProvider('MiniMax-H3', {
      config: { resolution: '1080p' as '2K' },
    });
    expect((await provider.callApi('prompt')).error).toContain('resolution must be 768P or 2K');
  });

  it.each([
    { type: 'unsupported' },
    { type: 'text', text: ' ' },
    { type: 'image_url' },
    { type: 'video_url' },
    { type: 'audio_url' },
    { type: 'text', text: 'prompt', role: 'unsupported' },
    { type: 'image_url', image_url: 'https://example.test/file', role: 'reference_audio' },
  ])('rejects invalid content %#', async (item) => {
    const provider = new MiniMaxVideoProvider('MiniMax-H3', {
      config: { content: [item] as any },
    });
    expect((await provider.callApi('prompt')).error).toBeTruthy();
    expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
  });

  it('returns the create API error', async () => {
    vi.mocked(fetch.fetchWithProxy).mockResolvedValueOnce(
      createResponse({ base_resp: { status_code: 1001, status_msg: 'invalid request' } }),
    );
    const result = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(result.error).toBe('MiniMax video API error: invalid request');
  });

  it('requires a task identifier from the create response', async () => {
    vi.mocked(fetch.fetchWithProxy).mockResolvedValueOnce(createResponse({}));
    const result = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(result.error).toContain('did not include task_id');
  });

  it('returns status and generation failures', async () => {
    vi.mocked(fetch.fetchWithProxy)
      .mockResolvedValueOnce(createResponse({ task_id: 'task-3' }))
      .mockResolvedValueOnce(
        createResponse({ base_resp: { status_code: 1001, status_msg: 'query failed' } }),
      );
    const statusError = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(statusError.error).toBe('MiniMax video status error: query failed');

    vi.mocked(fetch.fetchWithProxy)
      .mockResolvedValueOnce(createResponse({ task_id: 'task-4' }))
      .mockResolvedValueOnce(createResponse({ task: { status: 'Failed' } }));
    const generationError = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(generationError.error).toContain('status=Failed');
  });

  it('times out when polling cannot begin before the deadline', async () => {
    vi.mocked(fetch.fetchWithProxy).mockResolvedValueOnce(createResponse({ task_id: 'task-5' }));
    const provider = new MiniMaxVideoProvider('MiniMax-H3', {
      config: { max_poll_time_ms: 0 },
    });
    expect((await provider.callApi('prompt')).error).toContain('timed out');
  });

  it.each(['MiniMax-H3-Lite', 'MiniMax-H3-Max', 'MiniMax-H3-Highspeed'])(
    'uses the supported default resolution for %s',
    async (model) => {
      mockSuccessfulRequest();
      expect((await new MiniMaxVideoProvider(model).callApi('clip')).video?.resolution).toBe(
        '768P',
      );
    },
  );

  it('rejects an invalid polling duration before submitting a paid job', async () => {
    const provider = new MiniMaxVideoProvider('', { config: { max_poll_time_ms: 'invalid' } });
    expect((await provider.callApi('clip')).error).toContain('milliseconds');
    expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
  });

  it('does not submit a cancelled request', async () => {
    const signal = AbortSignal.abort();
    await expect(
      new MiniMaxVideoProvider().callApi('clip', undefined, { abortSignal: signal }),
    ).rejects.toThrow();
    expect(fetch.fetchWithProxy).not.toHaveBeenCalled();
  });

  it('treats a templated zero timeout as zero milliseconds', async () => {
    vi.mocked(fetch.fetchWithProxy).mockResolvedValueOnce(createResponse({ task_id: 'existing' }));
    const provider = new MiniMaxVideoProvider('', { config: { max_poll_time_ms: '0' } });
    expect((await provider.callApi('clip')).error).toContain('timed out');
    expect(fetch.fetchWithProxy).toHaveBeenCalledTimes(1);
  });

  it('reuses the submitted job when a status request is throttled', async () => {
    const endpoint = 'https://cdn.hailuoai.com/clip.mp4';
    vi.mocked(fetch.fetchWithProxy)
      .mockResolvedValueOnce(createResponse({ task_id: 'paid' }))
      .mockResolvedValueOnce(
        createResponse({ base_resp: { status_code: 1002, status_msg: 'rate limit' } }),
      )
      .mockResolvedValueOnce(
        createResponse({ task: { status: 'succeeded', content: { url: endpoint } } }),
      )
      .mockResolvedValueOnce(new Response('video'));
    const provider = new MiniMaxVideoProvider('', { config: { poll_interval_ms: 1 } });
    expect(provider.handlesOwnRetries).toBe(true);
    expect((await provider.callApi('clip')).video?.id).toBe('paid');
    const calls = vi.mocked(fetch.fetchWithProxy).mock.calls;
    expect(calls.map(([, options]) => options?.method)).toEqual(['POST', 'GET', 'GET', 'GET']);
    expect(calls[1]?.[0]).toBe(calls[2]?.[0]);
  });

  it('returns download and storage failures', async () => {
    mockSuccessfulRequest(502);
    const downloadError = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(downloadError.error).toBe('MiniMax video download failed: 502');

    mockSuccessfulRequest();
    vi.mocked(videoUtils.storeVideoContent).mockResolvedValueOnce({ error: 'storage unavailable' });
    const storageError = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(storageError.error).toBe('storage unavailable');
  });

  it.each([
    'http://127.0.0.1/internal',
    'https://cdn.hailuoai.com.evil.test/video.mp4',
    'https://cdn.hailuoai.com:444/video.mp4',
    'https://user:password@cdn.hailuoai.com/video.mp4',
    'file:///tmp/video.mp4',
  ])('rejects an unsafe download destination %s without fetching it', async (url) => {
    vi.mocked(fetch.fetchWithProxy)
      .mockResolvedValueOnce(createResponse({ task_id: 'task-1' }))
      .mockResolvedValueOnce(createResponse({ task: { status: 'succeeded', content: { url } } }));
    const result = await new MiniMaxVideoProvider().callApi('prompt');
    expect(result.error).toContain('allowed origin');
    expect(fetch.fetchWithProxy).toHaveBeenCalledTimes(2);
    expect(videoUtils.storeVideoContent).not.toHaveBeenCalled();
  });

  it('does not forward the API key or follow redirects when downloading', async () => {
    mockSuccessfulRequest(302);
    const result = await new MiniMaxVideoProvider().callApi('prompt');
    expect(result.error).toContain('302');
    expect(fetch.fetchWithProxy).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('https://cdn.hailuoai.com/'),
      expect.objectContaining({
        redirect: 'error',
        skipCloudAuthInjection: true,
        signal: expect.any(AbortSignal),
        headers: { 'x-promptfoo-silent': 'true' },
      }),
    );
  });

  it.each([true, false])('rejects oversized content (declared length: %s)', async (declared) => {
    const cancel = vi.fn();
    const limit = 128 * 1024 * 1024;
    // Cross the stream limit on the second read without copying a full clip during the test.
    const oversized = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1));
          controller.enqueue(new Uint8Array(limit));
        },
        cancel,
      }),
      { headers: declared ? { 'content-length': String(limit + 1) } : {} },
    );
    vi.mocked(fetch.fetchWithProxy)
      .mockResolvedValueOnce(createResponse({ task_id: 'task-1' }))
      .mockResolvedValueOnce(
        createResponse({
          task: { status: 'succeeded', content: { url: 'https://cdn.hailuoai.com/video.mp4' } },
        }),
      )
      .mockResolvedValueOnce(oversized);
    const result = await new MiniMaxVideoProvider().callApi('prompt');
    expect(result.error).toContain('128 MiB');
    expect(cancel).toHaveBeenCalled();
    expect(videoUtils.storeVideoContent).not.toHaveBeenCalled();
  });

  it('converts thrown request errors to provider errors', async () => {
    vi.mocked(fetch.fetchWithProxy).mockRejectedValueOnce(new Error('network unavailable'));
    const result = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(result.error).toContain('network unavailable');
  });
});
