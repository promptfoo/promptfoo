import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMiniMaxVideoProvider,
  MiniMaxVideoProvider,
} from '../../../src/providers/minimax/video';
import * as videoUtils from '../../../src/providers/video/utils';
import * as fetch from '../../../src/util/fetch/index';

vi.mock('../../../src/util/fetch/index');
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
        task: { status: 'Success', content: { url: 'https://cdn.example/video.mp4' } },
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
    expect(result.metadata).toMatchObject({ taskId: 'task-1', status: 'Success' });
    expect(vi.mocked(fetch.fetchWithProxy).mock.calls[0]?.[0]).toBe(
      'https://api.minimax.io/v2/video_generation',
    );
    expect(vi.mocked(fetch.fetchWithProxy).mock.calls[1]?.[0]).toBe(
      'https://api.minimax.io/v2/query/video_generation?task_id=task-1',
    );
    const body = JSON.parse(String(vi.mocked(fetch.fetchWithProxy).mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      model: 'MiniMax-H3',
      content: [{ type: 'text', text: 'A cinematic city' }],
      resolution: '2K',
      duration: 8,
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
        headers: { 'X-Test': 'yes' },
      },
    });
    await provider.callApi('A mountain lake');

    const [url, options] = vi.mocked(fetch.fetchWithProxy).mock.calls[0]!;
    expect(url).toBe('https://api.example.cn/v2/video_generation');
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer configured-key',
      'X-Test': 'yes',
    });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      model: 'MiniMax-H3',
      content: [{ type: 'text', text: 'A mountain lake' }],
      resolution: '2K',
      duration: 6,
    });
  });

  it('polls pending tasks until a nested task succeeds', async () => {
    vi.mocked(fetch.fetchWithProxy)
      .mockResolvedValueOnce(createResponse({ task_id: 'task-2' }))
      .mockResolvedValueOnce(createResponse({ data: { status: 'processing' } }))
      .mockResolvedValueOnce(
        createResponse({ data: { task: { status: '2', video_url: 'https://cdn.example/v.mp4' } } }),
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
    expect((await provider.callApi('prompt')).error).toContain('resolution must be 2K');
  });

  it.each([
    { type: 'unsupported' },
    { type: 'text', text: ' ' },
    { type: 'image_url' },
    { type: 'video_url' },
    { type: 'audio_url' },
    { type: 'text', text: 'prompt', role: 'unsupported' },
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
        createResponse({ base_resp: { status_code: 1002, status_msg: 'query failed' } }),
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

  it('returns download and storage failures', async () => {
    mockSuccessfulRequest(502);
    const downloadError = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(downloadError.error).toBe('MiniMax video download failed: 502');

    mockSuccessfulRequest();
    vi.mocked(videoUtils.storeVideoContent).mockResolvedValueOnce({ error: 'storage unavailable' });
    const storageError = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(storageError.error).toBe('storage unavailable');
  });

  it('converts thrown request errors to provider errors', async () => {
    vi.mocked(fetch.fetchWithProxy).mockRejectedValueOnce(new Error('network unavailable'));
    const result = await new MiniMaxVideoProvider('MiniMax-H3').callApi('prompt');
    expect(result.error).toContain('network unavailable');
  });
});
