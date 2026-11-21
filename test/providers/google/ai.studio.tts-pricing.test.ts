import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { AIStudioChatProvider } from '../../../src/providers/google/ai.studio';
import { createMockFetchResponse } from '../mockProviderResponses';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

const beforeExpiry = new Date('2026-12-31T23:59:00Z');
const afterExpiry = new Date('2027-01-01T00:01:00Z');

function response(date: string | undefined, cached = false) {
  return {
    ...createMockFetchResponse(
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/wav',
                    data: 'UklGRiwAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQgAAAABAAIAAwAEAA==',
                  },
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 1000,
          candidatesTokenCount: 250,
          totalTokenCount: 1250,
          candidatesTokensDetails: [{ modality: 'AUDIO', tokenCount: 250 }],
        },
      },
      { cached },
    ),
    headers: date === undefined ? undefined : { date },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each([
  { model: 'gemini-3.8-flash-tts', introductory: 0.00275, standard: 0.0055 },
  { model: 'gemini-3.8-flash-lite-tts', introductory: 0.002, standard: 0.004 },
])('$model response-date pricing', ({ model, introductory, standard }) => {
  it('preserves a cached promotional estimate while fresh responses use the new rate', async () => {
    const provider = new AIStudioChatProvider(model, { config: { apiKey: 'test-key' } });
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response(beforeExpiry.toUTCString()))
      .mockResolvedValueOnce(response(beforeExpiry.toUTCString(), true))
      .mockResolvedValueOnce(response(afterExpiry.toUTCString()));

    vi.setSystemTime(beforeExpiry);
    const original = await provider.callApi('Hello');
    vi.setSystemTime(afterExpiry);
    const replay = await provider.callApi('Hello');
    const fresh = await provider.callApi('Hello', {
      prompt: { raw: 'Hello', label: 'Hello' },
      vars: {},
      bustCache: true,
    });

    expect(original.error).toBeUndefined();
    expect(original.cost).toBeCloseTo(introductory, 12);
    expect(replay.error).toBeUndefined();
    expect(replay.cached).toBe(true);
    expect(replay.cost).toBe(original.cost);
    expect(fresh.error).toBeUndefined();
    expect(fresh.cached).toBe(false);
    expect(fresh.cost).toBeCloseTo(standard, 12);
    expect(fresh.audio).toEqual(original.audio);
  });

  it.each([undefined, 'invalid response date'])(
    'uses current pricing when the response date is %s',
    async (date) => {
      vi.setSystemTime(afterExpiry);
      vi.mocked(fetchWithCache).mockResolvedValue(response(date, true));
      const provider = new AIStudioChatProvider(model, { config: { apiKey: 'test-key' } });
      const result = await provider.callApi('Hello');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeCloseTo(standard, 12);
    },
  );

  it('preserves explicit pricing overrides on a cached response', async () => {
    vi.setSystemTime(afterExpiry);
    vi.mocked(fetchWithCache).mockResolvedValue(response(beforeExpiry.toUTCString(), true));
    const provider = new AIStudioChatProvider(model, {
      config: { apiKey: 'test-key', inputCost: 3 / 1e6, audioOutputCost: 7 / 1e6 },
    });
    const result = await provider.callApi('Hello');
    expect(result.error).toBeUndefined();
    expect(result.cached).toBe(true);
    expect(result.cost).toBeCloseTo(0.00475, 12);
  });
});
