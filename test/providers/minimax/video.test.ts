import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniMaxVideoProvider } from '../../../src/providers/minimax/video';
import * as videoUtils from '../../../src/providers/video/utils';
import * as fetch from '../../../src/util/fetch/index';

vi.mock('../../../src/logger');
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

describe('MiniMax H3 video provider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('MINIMAX_API_KEY', 'test-key');
  });

  it('sends H3 content and polls task content URL', async () => {
    vi.mocked(fetch.fetchWithProxy)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task_id: 'task-1', base_resp: { status_code: 0 } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task: { status: 'Success', content: { url: 'https://cdn.example/video.mp4' } },
            base_resp: { status_code: 0 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(Buffer.from('video'), { status: 200 }));
    const provider = new MiniMaxVideoProvider('MiniMax-H3');
    const result = await provider.callApi('A cinematic city', {
      prompt: {
        config: {
          duration: 8,
          resolution: '2K',
          content: [{ type: 'text', text: 'A cinematic city' }],
        },
      },
    } as any);
    expect(result.error).toBeUndefined();
    expect(result.video?.id).toBe('task-1');
    expect(vi.mocked(fetch.fetchWithProxy).mock.calls[0]?.[0]).toBe(
      'https://api.minimax.io/v2/video_generation',
    );
    const body = JSON.parse(String(vi.mocked(fetch.fetchWithProxy).mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ model: 'MiniMax-H3', resolution: '2K', duration: 8 });
    expect(body.content).toEqual([{ type: 'text', text: 'A cinematic city' }]);
  });
});
