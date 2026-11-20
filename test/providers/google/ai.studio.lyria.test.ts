import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { loadApiProvider } from '../../../src/providers';
import { AIStudioChatProvider } from '../../../src/providers/google/ai.studio';
import { mockProcessEnv } from '../../util/utils';
import { createMockFetchResponse } from '../mockProviderResponses';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

const MP3_BASE64 = Buffer.from('ID3\u0003 fake mp3 frames').toString('base64');
const LYRICS = '[[A0]]\n[:] Curled up in a square of gold,\n[[B1]]\n[:] Oh, cat in the sun';

function lyriaResponse(
  parts: Array<Record<string, unknown>>,
  { cached = false, finishReason = 'STOP' } = {},
) {
  return createMockFetchResponse(
    {
      candidates: [{ content: { parts, role: 'model' }, finishReason, index: 0 }],
      usageMetadata: {
        promptTokenCount: 30,
        candidatesTokenCount: 1316,
        totalTokenCount: 1346,
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 30 }],
      },
      modelVersion: 'lyria-3.5',
    },
    { cached },
  );
}

const audioPart = { inlineData: { mimeType: 'audio/mpeg', data: MP3_BASE64 } };

function lastRequest() {
  const [url, init] = vi.mocked(fetchWithCache).mock.calls.at(-1) ?? [];
  return { url, body: JSON.parse((init as RequestInit).body as string) };
}

describe('Google Lyria music generation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    'google:lyria-3.5',
    'google:lyria-3-pro-preview',
    'google:lyria-3-clip-preview',
    'palm:lyria-3.5',
  ])('routes %s to generateContent on the Gemini API', async (id) => {
    vi.mocked(fetchWithCache).mockResolvedValue(lyriaResponse([{ text: LYRICS }, audioPart]));
    const provider = await loadApiProvider(id, { options: { config: { apiKey: 'test-key' } } });

    expect(provider).toBeInstanceOf(AIStudioChatProvider);
    const result = await provider.callApi('A folk song about a cat napping in the sun.');

    expect(result.error).toBeUndefined();
    const modelName = id.split(':')[1];
    expect(lastRequest().url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
    );
  });

  it('sends the prompt without speech or modality defaults', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(lyriaResponse([{ text: LYRICS }, audioPart]));
    const provider = new AIStudioChatProvider('lyria-3.5', { config: { apiKey: 'test-key' } });

    await provider.callApi('A folk song about a cat napping in the sun.');

    expect(lastRequest().body).toEqual({
      contents: [
        { parts: [{ text: 'A folk song about a cat napping in the sun.' }], role: 'user' },
      ],
      generationConfig: {},
    });
  });

  it('forwards image parts for image-to-music prompts', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(lyriaResponse([{ text: LYRICS }, audioPart]));
    const provider = new AIStudioChatProvider('lyria-3.5', { config: { apiKey: 'test-key' } });
    const prompt = JSON.stringify([
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg==' } },
          { text: 'An ambient track inspired by this image.' },
        ],
      },
    ]);

    await provider.callApi(prompt);

    expect(lastRequest().body.contents).toEqual([
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg==' } },
          { text: 'An ambient track inspired by this image.' },
        ],
      },
    ]);
  });

  it.each([
    { model: 'lyria-3.5', cost: 0.08 },
    { model: 'lyria-3-pro-preview', cost: 0.08 },
    { model: 'lyria-3-clip-preview', cost: 0.04 },
  ])('returns lyrics, MP3 audio, and the per-song price for $model', async ({ model, cost }) => {
    vi.mocked(fetchWithCache).mockResolvedValue(lyriaResponse([{ text: LYRICS }, audioPart]));
    const provider = new AIStudioChatProvider(model, { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('A folk song about a cat napping in the sun.');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe(LYRICS);
    expect(result.audio).toEqual({ data: MP3_BASE64, format: 'mpeg', transcript: LYRICS });
    expect(result.cost).toBe(cost);
    expect(result.cached).toBe(false);
    expect(result.tokenUsage).toEqual({
      prompt: 30,
      completion: 1316,
      total: 1346,
      numRequests: 1,
    });
  });

  it('returns the instrumental marker as output for instrumental tracks', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      lyriaResponse([{ text: '<instrumental>' }, audioPart]),
    );
    const provider = new AIStudioChatProvider('lyria-3-clip-preview', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('A chiptune loop. Instrumental only.');

    expect(result.output).toBe('<instrumental>');
    expect(result.audio).toMatchObject({ format: 'mpeg', transcript: '<instrumental>' });
    expect(result.cost).toBe(0.04);
  });

  it('joins separate text parts and concatenates audio parts', async () => {
    const secondAudio = Buffer.from(' more frames').toString('base64');
    vi.mocked(fetchWithCache).mockResolvedValue(
      lyriaResponse([
        { text: 'Verse lyrics' },
        audioPart,
        { text: 'Chorus lyrics' },
        { inlineData: { mimeType: 'audio/mpeg', data: secondAudio } },
      ]),
    );
    const provider = new AIStudioChatProvider('lyria-3.5', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('A song.');

    expect(result.output).toBe('Verse lyrics\nChorus lyrics');
    expect(Buffer.from(result.audio?.data ?? '', 'base64').toString()).toBe(
      'ID3\u0003 fake mp3 frames more frames',
    );
    expect(result.cost).toBe(0.08);
  });

  it('charges a song when audio arrives without lyrics', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(lyriaResponse([audioPart]));
    const provider = new AIStudioChatProvider('lyria-3.5', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('A song.');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('');
    expect(result.audio).toEqual({ data: MP3_BASE64, format: 'mpeg' });
    expect(result.cost).toBe(0.08);
  });

  it('does not charge a song when no audio is returned', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(lyriaResponse([{ text: 'No song generated.' }]));
    const provider = new AIStudioChatProvider('lyria-3.5', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('A song.');

    expect(result.output).toBe('No song generated.');
    expect(result.audio).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it('leaves cost unset for Lyria models without a known per-song price', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(lyriaResponse([{ text: LYRICS }, audioPart]));
    const provider = new AIStudioChatProvider('lyria-9.99-fakemodel', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('A song.');

    expect(lastRequest().url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/lyria-9.99-fakemodel:generateContent',
    );
    expect(result.output).toBe(LYRICS);
    expect(result.audio).toMatchObject({ data: MP3_BASE64, format: 'mpeg' });
    expect(result.cost).toBeUndefined();
  });

  it('marks cached songs so the evaluator records no incurred spend', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      lyriaResponse([{ text: LYRICS }, audioPart], { cached: true }),
    );
    const provider = new AIStudioChatProvider('lyria-3.5', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('A song.');

    expect(result.cached).toBe(true);
    // The logical price stays available to cost assertions; the evaluator derives
    // incurredCost: 0 from the cache marker.
    expect(result.cost).toBe(0.08);
    expect(result.tokenUsage).toMatchObject({
      cached: 1346,
      numRequests: 0,
      incurredTokenUsage: {},
    });
    expect(result.audio).toEqual({ data: MP3_BASE64, format: 'mpeg', transcript: LYRICS });
  });

  it('surfaces Gemini API errors', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse(
        {
          error: {
            code: 400,
            message: 'Request contains an invalid argument.',
            status: 'INVALID_ARGUMENT',
          },
        },
        { status: 400, statusText: 'Bad Request' },
      ),
    );
    const provider = new AIStudioChatProvider('lyria-3.5', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('A song.');

    expect(result.error).toContain('Request contains an invalid argument.');
    expect(result.output).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it('returns an error when the prompt is blocked', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      lyriaResponse([], { finishReason: 'PROHIBITED_CONTENT' }),
    );
    const provider = new AIStudioChatProvider('lyria-3.5', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('A song in the voice of a famous singer.');

    expect(result.error).toContain('Response was blocked with finish reason: PROHIBITED_CONTENT');
    expect(result.cost).toBeUndefined();
  });

  it('returns an error when the request fails', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('socket hang up'));
    const provider = new AIStudioChatProvider('lyria-3.5', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('A song.');

    expect(result.error).toBe('API call error: Error: socket hang up');
  });

  it('requires an API key', async () => {
    const restoreEnv = mockProcessEnv({
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      PALM_API_KEY: undefined,
    });
    try {
      const provider = new AIStudioChatProvider('lyria-3.5');
      await expect(provider.callApi('A song.')).rejects.toThrow('Google API key is not set');
      expect(fetchWithCache).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });
});
