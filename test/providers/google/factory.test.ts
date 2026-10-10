import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import { loadApiProvider } from '../../../src/providers';
import { AIStudioChatProvider } from '../../../src/providers/google/ai.studio';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import * as googleUtil from '../../../src/providers/google/util';
import { VertexChatProvider } from '../../../src/providers/google/vertex';
import * as fetchUtil from '../../../src/util/fetch/index';
import { createMockFetchResponse } from '../mockProviderResponses';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
  isCacheEnabled: () => false,
}));

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../../src/providers/google/util', async (importOriginal) => ({
  ...(await importOriginal()),
  getGoogleClient: vi.fn(),
}));

describe('Google provider factories', () => {
  const data = {
    candidates: [{ content: { parts: [{ text: 'hello' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('VERTEX_REGION', '');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', '');
    vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(data));
    vi.mocked(fetchUtil.fetchWithProxy).mockResolvedValue(Response.json(data));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it.each(['google:gemini-2.5-flash', 'palm:gemini-2.5-flash'])(
    'evaluates %s through AI Studio',
    async (id) => {
      const provider = await loadApiProvider(id, { options: { config: { apiKey: 'test-key' } } });

      expect(provider).toBeInstanceOf(AIStudioChatProvider);
      expect(await provider.callApi('hello')).toMatchObject({
        output: 'hello',
        tokenUsage: { prompt: 10, completion: 5, total: 15 },
      });
      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }),
        }),
        expect.any(Number),
        'json',
        false,
      );
      expect(fetchUtil.fetchWithProxy).not.toHaveBeenCalled();
    },
  );

  it.each(['vertex:gemini-2.5-flash', 'vertex:chat:gemini-2.5-flash'])(
    'evaluates %s through Vertex Express with an API key',
    async (id) => {
      const provider = await loadApiProvider(id, { options: { config: { apiKey: 'test-key' } } });

      expect(provider).toBeInstanceOf(VertexChatProvider);
      expect(await provider.callApi('hello')).toMatchObject({
        output: 'hello',
        tokenUsage: { prompt: 10, completion: 5, total: 15 },
      });
      expect(fetchUtil.fetchWithProxy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/v1\/publishers\/google\/models\/gemini-2\.5-flash:generateContent$/,
        ),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }),
        }),
      );
      expect(googleUtil.getGoogleClient).not.toHaveBeenCalled();
    },
  );

  it('routes Nano Banana 2.1 to image generation and retains system instructions', async () => {
    const provider = await loadApiProvider('google:gemini-nano-banana-2.1', {
      options: {
        config: {
          apiKey: 'test-key',
          vertexai: false,
          systemInstruction: 'Use a blue background',
          imageSize: '2K',
        },
      },
    });
    vi.mocked(cache.fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] } },
        ],
      }),
    );
    const response = await provider.callApi('Draw a circle');
    expect(response.images).toHaveLength(1);
    expect(
      JSON.parse(vi.mocked(cache.fetchWithCache).mock.calls[0][1]?.body as string),
    ).toMatchObject({
      systemInstruction: { parts: [{ text: 'Use a blue background' }] },
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '2K' } },
    });
  });

  it.each([
    'google:gemini-3.8-flash-tts',
    'palm:gemini-3.8-flash-lite-tts',
    'vertex:gemini-3.8-flash-tts',
    'vertex:chat:gemini-3.8-flash-lite-tts',
  ])('preserves speech metadata, WAV bytes, and modern voice defaults through %s', async (id) => {
    const wav = Buffer.from('RIFF....WAVEfmt ....data....');
    const audioResponse = {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 25,
        totalTokenCount: 35,
        candidatesTokensDetails: [{ modality: 'AUDIO', tokenCount: 25 }],
      },
    };
    vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(audioResponse));
    vi.mocked(fetchUtil.fetchWithProxy).mockResolvedValue(Response.json(audioResponse));
    const provider = await loadApiProvider(id, { options: { config: { apiKey: 'test-key' } } });
    const parts = [{ text: 'Hello.', speechMetadata: { style: 'cheerful', speaker: 'Narrator' } }];
    const response = await provider.callApi(JSON.stringify([{ role: 'user', parts }]));
    expect(response.error).toBeUndefined();
    expect(response.audio).toEqual({ data: wav.toString('base64'), format: 'wav' });
    expect(response.cost).toBeGreaterThan(0);
    const request = id.startsWith('vertex:')
      ? vi.mocked(fetchUtil.fetchWithProxy).mock.calls[0]
      : vi.mocked(cache.fetchWithCache).mock.calls[0];
    expect(request[0]).toMatch(/:generateContent$/);
    if (id.startsWith('vertex:')) {
      expect(request[0]).toMatch(/^https:\/\/aiplatform.googleapis.com\//);
    }
    expect(JSON.parse(request[1]?.body as string)).toMatchObject({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { voice: 'Kore' } },
      },
    });
  });

  it('uses OAuth when Vertex Express is explicitly disabled', async () => {
    const request = vi.fn().mockResolvedValue({ data });
    vi.mocked(googleUtil.getGoogleClient).mockResolvedValue({
      client: { request } as unknown as Awaited<
        ReturnType<typeof googleUtil.getGoogleClient>
      >['client'],
      projectId: 'test-project',
    });
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
      client: { request } as unknown as Awaited<
        ReturnType<typeof googleUtil.getGoogleClient>
      >['client'],
      projectId: 'test-project',
    });
    const provider = await loadApiProvider('vertex:gemini-2.5-flash', {
      options: {
        config: {
          apiKey: 'test-key',
          projectId: 'test-project',
          region: 'global',
          expressMode: false,
        },
      },
    });

    expect(await provider.callApi('hello')).toMatchObject({ output: 'hello' });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/gemini-2.5-flash:generateContent',
        method: 'POST',
      }),
    );
    expect(fetchUtil.fetchWithProxy).not.toHaveBeenCalled();
  });

  it('returns Vertex Express API errors', async () => {
    vi.mocked(fetchUtil.fetchWithProxy).mockResolvedValue(
      Response.json(
        { error: { message: 'invalid request' } },
        { status: 400, statusText: 'Bad Request' },
      ),
    );
    const provider = await loadApiProvider('vertex:gemini-2.5-flash', {
      options: { config: { apiKey: 'test-key' } },
    });

    expect(await provider.callApi('hello')).toEqual({
      error: 'API call error: 400 Bad Request: {"error":{"message":"invalid request"}}',
    });
  });
});
