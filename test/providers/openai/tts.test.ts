import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiTtsProvider } from '../../../src/providers/openai/tts';
import { fetchWithProxy } from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/util/fetch/index.ts');

const mockedFetch = vi.mocked(fetchWithProxy);

function audioResponse(bytes = new Uint8Array([1, 2, 3, 4])) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => bytes.buffer,
  } as Response;
}

describe('OpenAiTtsProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    'gpt-4o-mini-tts',
    'gpt-4o-mini-tts-2025-12-15',
    'gpt-4o-mini-tts-2025-03-20',
    'tts-1',
    'tts-1-1106',
    'tts-1-hd',
    'tts-1-hd-1106',
  ])('sends model %s to /v1/audio/speech and returns playable audio', async (model) => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider(model, { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('Hello from promptfoo');

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        body: JSON.stringify({ model, input: 'Hello from promptfoo', voice: 'alloy' }),
      }),
    );
    expect(result).toMatchObject({
      output: 'Generated 20 characters of speech',
      audio: { data: 'AQIDBA==', format: 'mp3' },
      cached: false,
    });
  });

  it('passes supported speech controls through to the API', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: {
        apiKey: 'test-key',
        voice: 'coral',
        instructions: 'Speak warmly and clearly.',
        response_format: 'wav',
        speed: 1.25,
      },
    });

    const result = await provider.callApi('Welcome');

    expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string)).toEqual({
      model: 'gpt-4o-mini-tts',
      input: 'Welcome',
      voice: 'coral',
      instructions: 'Speak warmly and clearly.',
      response_format: 'wav',
      speed: 1.25,
    });
    expect(result.audio?.format).toBe('wav');
  });

  it('passes an uploaded custom voice ID through to the speech API', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'test-key', voice: { id: 'voice_123' } },
    });

    await provider.callApi('Welcome');

    expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string)).toMatchObject({
      voice: { id: 'voice_123' },
    });
  });

  it.each([
    ['tts-1', 15],
    ['tts-1-1106', 15],
    ['tts-1-hd', 30],
    ['tts-1-hd-1106', 30],
  ])('reports the documented per-character cost for %s', async (model, dollarsPerMillion) => {
    mockedFetch.mockResolvedValue(audioResponse());
    const prompt = 'a'.repeat(1000);
    const provider = new OpenAiTtsProvider(model, { config: { apiKey: 'test-key' } });

    const result = await provider.callApi(prompt);

    expect(result.cost).toBeCloseTo((1000 * dollarsPerMillion) / 1e6, 10);
  });

  it('does not invent a GPT-4o mini TTS cost when the binary speech response has no usage', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('Hello');

    expect(result.cost).toBeUndefined();
  });

  const invalidCases: Array<
    [string, { model?: string; input?: string; config?: Record<string, unknown> }, string]
  > = [
    ['an overlong input', { input: 'a'.repeat(4097) }, '4096 characters'],
    ['an invalid format', { config: { response_format: 'ogg' } }, 'response_format'],
    ['a speed below range', { config: { speed: 0.2 } }, '0.25 and 4'],
    ['a speed above range', { config: { speed: 4.1 } }, '0.25 and 4'],
    ['a non-finite speed', { config: { speed: Number.NaN } }, '0.25 and 4'],
    [
      'legacy instructions',
      { model: 'tts-1', config: { instructions: 'Be cheerful.' } },
      'instructions are only supported',
    ],
  ];

  it.each(
    invalidCases,
  )('rejects %s before calling the API', async (_label, testCase, expectedError) => {
    const provider = new OpenAiTtsProvider(testCase.model ?? 'gpt-4o-mini-tts', {
      config: { apiKey: 'test-key', ...testCase.config } as any,
    });

    const result = await provider.callApi(testCase.input ?? 'Hello');

    expect(result.error).toContain(expectedError);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('returns an actionable API error without attempting to parse binary audio', async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: { message: 'Unsupported voice' } }),
    } as Response);
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', { config: { apiKey: 'test-key' } });

    await expect(provider.callApi('Hello')).resolves.toMatchObject({
      error: 'API error 400: Unsupported voice',
    });
  });

  it('requires an OpenAI API key', async () => {
    const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });
    try {
      const provider = new OpenAiTtsProvider('gpt-4o-mini-tts');
      await expect(provider.callApi('Hello')).rejects.toThrow('OPENAI_API_KEY');
    } finally {
      restoreEnv();
    }
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
