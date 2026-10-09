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
    vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(data));
    vi.mocked(fetchUtil.fetchWithProxy).mockResolvedValue(Response.json(data));
  });

  afterEach(() => {
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
