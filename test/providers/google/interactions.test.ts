import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storeBlob } from '../../../src/blobs';
import { fetchWithCache } from '../../../src/cache';
import { GoogleInteractionsProvider } from '../../../src/providers/google/interactions';

vi.mock('../../../src/cache', () => ({ fetchWithCache: vi.fn() }));
vi.mock('../../../src/blobs', () => ({ storeBlob: vi.fn() }));

describe('GoogleInteractionsProvider', () => {
  const mockFetchWithCache = vi.mocked(fetchWithCache);
  const mockStoreBlob = vi.mocked(storeBlob);

  beforeEach(() => {
    vi.clearAllMocks();
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
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' }],
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
          background: false,
          stream: false,
        }),
      }),
      expect.any(Number),
      'json',
      false,
    );
    expect(mockFetchWithCache.mock.calls[0]?.[1]).not.toHaveProperty('_authHash');
    expect(mockStoreBlob).toHaveBeenCalledWith(
      Buffer.from('video'),
      'video/mp4',
      expect.objectContaining({ evalId: 'eval-1', kind: 'video' }),
    );
    expect(result.video).toMatchObject({
      id: 'interaction-1',
      url: 'blob://video/omni',
      format: 'mp4',
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
      false,
    );
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
      false,
    );
  });
});
