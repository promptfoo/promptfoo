import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storeBlob } from '../../../src/blobs';
import { fetchWithCache } from '../../../src/cache';
import { GoogleInteractionsProvider } from '../../../src/providers/google/interactions';
import { fetchWithTimeout } from '../../../src/util/fetch/index';

vi.mock('../../../src/cache', () => ({ fetchWithCache: vi.fn() }));
vi.mock('../../../src/blobs', () => ({ storeBlob: vi.fn() }));
vi.mock('../../../src/util/fetch/index', () => ({ fetchWithTimeout: vi.fn() }));

describe('GoogleInteractionsProvider', () => {
  const mockFetchWithCache = vi.mocked(fetchWithCache);
  const mockStoreBlob = vi.mocked(storeBlob);
  const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithTimeout.mockReset();
    mockStoreBlob.mockResolvedValue({
      ref: { uri: 'blob://video/omni', hash: 'omni', mimeType: 'video/mp4', sizeBytes: 5 },
      deduplicated: false,
    } as any);
  });

  it('routes Omni Flash through the Interactions API and prices video output tokens', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-1',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'b2xk' }],
          },
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/webm', data: 'dmlkZW8=' }],
          },
        ],
        usage: {
          total_input_tokens: 100,
          total_output_tokens: 600,
          total_reasoning_tokens: 20,
          total_tokens: 720,
          output_tokens_by_modality: [
            { modality: 'text', tokens: 100 },
            { modality: 'video', tokens: 500 },
          ],
        },
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        apiKey: 'test-key',
        aspectRatio: '9:16',
        previousInteractionId: 'interaction-0',
        store: true,
        service_tier: 'priority',
        maxOutputTokens: 2_048,
        generationConfig: {
          thinking_level: 'low',
          video_config: { task: 'text_to_video' },
          temperature: 0.2,
          topP: 0.8,
          top_p: 0.8,
          stopSequences: ['stop'],
          stop_sequences: ['stop'],
          negative_prompt: 'do not include text',
          system_instruction: 'unsupported',
        } as any,
        passthrough: {
          generation_config: {
            seed: 42,
            temperature: 0.4,
            negative_prompt: 'unsupported passthrough prompt',
          },
          generationConfig: { temperature: 0.6 },
          system_instruction: { parts: [{ text: 'unsupported passthrough instruction' }] },
          temperature: 0.8,
          service_tier: 'priority',
          serviceTier: 'priority',
        },
      },
    });

    const result = await provider.callApi('A city at dusk', { evaluationId: 'eval-1' } as any);

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Api-Revision': '2026-05-20',
          'x-goog-api-key': 'test-key',
        }),
        body: JSON.stringify({
          model: 'gemini-omni-flash-preview',
          input: 'A city at dusk',
          response_format: { type: 'video', aspect_ratio: '9:16' },
          previous_interaction_id: 'interaction-0',
          store: true,
          generation_config: {
            max_output_tokens: 2_048,
            thinking_level: 'low',
            video_config: { task: 'text_to_video' },
            seed: 42,
          },
          background: false,
          stream: false,
        }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    expect(mockFetchWithCache.mock.calls[0]?.[1]).not.toHaveProperty('_authHash');
    expect(mockStoreBlob).toHaveBeenCalledWith(
      Buffer.from('video'),
      'video/webm',
      expect.objectContaining({ evalId: 'eval-1', kind: 'video' }),
    );
    expect(result.video).toMatchObject({
      id: 'interaction-1',
      url: 'blob://video/omni',
      format: 'webm',
      model: 'gemini-omni-flash-preview',
      aspectRatio: '9:16',
    });
    expect(result.tokenUsage).toEqual({
      prompt: 100,
      completion: 600,
      total: 720,
      cached: 0,
      numRequests: 1,
      completionDetails: { reasoning: 20 },
    });
    expect(result.cost).toBeCloseTo((100 * 1.5 + 120 * 9 + 500 * 17.5) / 1e6, 12);
  });

  it('returns a useful error when the Interactions API does not return video', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [{ type: 'model_output', content: [] }] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('A city at dusk')).resolves.toMatchObject({
      error: 'Gemini interaction did not return video output',
    });
  });

  it('normalizes Promptfoo chat roles for the Omni Interactions API', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/chat' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi(
      JSON.stringify([
        { role: 'system', content: 'Keep the scene family friendly.' },
        { role: 'developer', content: 'Use a cinematic style.' },
        { role: 'user', content: 'Create a city at dusk.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Use this reference.' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aW1hZ2U=' } },
            { type: 'input_image', image_url: 'https://image.example/reference.png' },
          ],
        },
        { role: 'assistant', content: 'I will create that scene.' },
        { role: 'user', content: 'Add rain.' },
      ]),
    );

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).input).toEqual([
      { role: 'user', content: 'Keep the scene family friendly.' },
      { role: 'user', content: 'Use a cinematic style.' },
      { role: 'user', content: 'Create a city at dusk.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Use this reference.' },
          { type: 'image', mime_type: 'image/jpeg', data: 'aW1hZ2U=' },
          { type: 'image', uri: 'https://image.example/reference.png' },
        ],
      },
      { role: 'model', content: 'I will create that scene.' },
      { role: 'user', content: 'Add rain.' },
    ]);
  });

  it('returns only the latest Omni turn and stores authenticated URI-delivered video', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-latest',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              { type: 'text', text: 'old response' },
              { type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/old' },
            ],
          },
          { type: 'user_input', content: [{ type: 'text', text: 'make it rainy' }] },
          {
            type: 'model_output',
            content: [
              { type: 'text', text: 'new response' },
              {
                type: 'video',
                mime_type: 'video/webm',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-1:download?alt=media',
              },
            ],
          },
        ],
      },
      cached: false,
    } as any);
    mockFetchWithTimeout.mockResolvedValue(new Response(Buffer.from('latest video')) as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key', previousInteractionId: 'interaction-old' },
    });

    const result = await provider.callApi('make it rainy');

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/files/video-1:download?alt=media',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }),
      }),
      expect.any(Number),
    );
    expect(mockStoreBlob).toHaveBeenCalledWith(
      Buffer.from('latest video'),
      'video/webm',
      expect.objectContaining({ kind: 'video' }),
    );
    expect(result.output).toBe('new response');
    expect(result.video).toMatchObject({ url: 'blob://video/omni', format: 'webm' });
  });

  it('does not forward Gemini credentials across a video-download redirect', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'video',
                mime_type: 'video/mp4',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-2:download?alt=media',
              },
            ],
          },
        ],
      },
      cached: false,
    } as any);
    mockFetchWithTimeout
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://storage.googleapis.com/signed-video' },
        }) as any,
      )
      .mockResolvedValueOnce(new Response(Buffer.from('redirected video')) as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi('a city at dusk');

    expect(mockFetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      'https://generativelanguage.googleapis.com/v1beta/files/video-2:download?alt=media',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }),
        redirect: 'manual',
      }),
      expect.any(Number),
    );
    expect(mockFetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://storage.googleapis.com/signed-video',
      { method: 'GET', redirect: 'manual' },
      expect.any(Number),
    );
    expect(mockStoreBlob).toHaveBeenCalledWith(
      Buffer.from('redirected video'),
      'video/mp4',
      expect.any(Object),
    );
  });

  it('refuses an untrusted video-download redirect before making a second request', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'video',
                mime_type: 'video/mp4',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-3:download?alt=media',
              },
            ],
          },
        ],
      },
      cached: false,
    } as any);
    mockFetchWithTimeout.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      }) as any,
    );
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('a city at dusk');

    expect(result.error).toBe(
      'Refusing untrusted Gemini interaction video redirect: http://169.254.169.254',
    );
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(mockStoreBlob).not.toHaveBeenCalled();
  });

  it('does not reuse an Omni video from a previous interaction turn', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/old' }],
          },
          { type: 'user_input', content: [{ type: 'text', text: 'make it rainy' }] },
          { type: 'model_output', content: [{ type: 'text', text: 'no video generated' }] },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('make it rainy')).resolves.toMatchObject({
      error: 'Gemini interaction did not return video output',
    });
  });

  it('forwards native multimodal input and prompt-level interaction overrides', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-2',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/2' }],
          },
        ],
        usage: { total_input_tokens: 10, total_output_tokens: 20, total_tokens: 30 },
      },
      cached: true,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'base-key', apiBaseUrl: 'https://proxy.example/google' },
    });
    const input = [
      { type: 'image', mime_type: 'image/jpeg', data: 'aW1hZ2U=' },
      { type: 'text', text: 'Animate this image' },
    ];

    const result = await provider.callApi(JSON.stringify(input), {
      bustCache: true,
      prompt: { config: { aspectRatio: '16:9', previousInteractionId: 'interaction-1' } },
    } as any);

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://proxy.example/google/v1beta/interactions',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'gemini-omni-flash-preview',
          input,
          response_format: { type: 'video', aspect_ratio: '16:9' },
          previous_interaction_id: 'interaction-1',
          background: false,
          stream: false,
        }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    expect(mockStoreBlob).not.toHaveBeenCalled();
    expect(result.video?.url).toBe('https://video.example/2');
    expect(result.cost).toBeUndefined();
  });

  it('preserves a single native multimodal interaction input object', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/1' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });
    const input = { type: 'image', mime_type: 'image/jpeg', data: 'aW1hZ2U=' };

    await provider.callApi(JSON.stringify(input));

    const body = JSON.parse(mockFetchWithCache.mock.calls[0]?.[1]?.body as string);
    expect(body.input).toEqual(input);
  });

  it('requires a Gemini API key', async () => {
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {},
      env: { GOOGLE_API_KEY: undefined, GEMINI_API_KEY: undefined },
    });

    await expect(provider.callApi('A city at dusk')).resolves.toMatchObject({
      error: expect.stringContaining('Gemini Interactions API requires an API key'),
    });
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('preserves a configured provider id and supports the legacy PALM API key', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/palm' }],
          },
        ],
      },
      cached: true,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      id: 'omni-vertical',
      env: { PALM_API_KEY: 'legacy-palm-key' },
    });

    await provider.callApi('A city at dusk');

    expect(provider.id()).toBe('omni-vertical');
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'legacy-palm-key' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('renders a configured Gemini API-key template before authentication', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'rendered-google-key');
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/5' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: '{{ env.GOOGLE_API_KEY }}' },
    });

    await provider.callApi('A city at dusk');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'rendered-google-key' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    vi.unstubAllEnvs();
  });

  it.each([
    [{ GOOGLE_API_HOST: 'proxy-host.example' }, 'https://proxy-host.example/v1beta/interactions'],
    [
      { GOOGLE_API_BASE_URL: 'https://proxy.example/google' },
      'https://proxy.example/google/v1beta/interactions',
    ],
  ])('honors documented Google endpoint environment overrides', async (env, endpoint) => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/3' }],
          },
        ],
      },
      cached: true,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
      env: env as any,
    });

    await provider.callApi('A city at dusk');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      endpoint,
      expect.any(Object),
      expect.any(Number),
      'json',
      true,
    );
  });

  it.each([
    [
      { apiHost: 'http://127.0.0.1:15500/proxy' },
      { GOOGLE_API_HOST: 'wrong.example' },
      'http://127.0.0.1:15500/proxy/v1beta/interactions',
    ],
    [
      { apiBaseUrl: 'http://127.0.0.1:15500/proxy' },
      { GOOGLE_API_HOST: 'wrong.example' },
      'http://127.0.0.1:15500/proxy/v1beta/interactions',
    ],
  ])('prefers explicit interaction endpoints and preserves HTTP schemes', async (config, env, endpoint) => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/4' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { ...config, apiKey: 'test-key' },
      env,
    });

    await provider.callApi('A city at dusk');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      endpoint,
      expect.any(Object),
      expect.any(Number),
      'json',
      true,
    );
  });
});
