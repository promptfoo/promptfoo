import crypto from 'crypto';
import fs from 'fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCost } from '../../../../src/assertions/cost';
import { getCache, isCacheEnabled } from '../../../../src/cache';
import { ElevenLabsClient } from '../../../../src/providers/elevenlabs/client';
import { ElevenLabsSTTProvider } from '../../../../src/providers/elevenlabs/stt';

import type {
  ElevenLabsSTTConfig,
  STTResponse,
} from '../../../../src/providers/elevenlabs/stt/types';
import type { AssertionParams, ProviderResponse } from '../../../../src/types';

vi.mock('../../../../src/providers/elevenlabs/client');
vi.mock('../../../../src/cache', () => ({
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

const audioPath = '/fixture.wav';
const mtime = new Date(1_700_000_000_000);
const audio = Buffer.from('unchanged fixture audio');
const transcription: STTResponse = {
  text: 'hello world',
  language_code: 'eng',
  language_probability: 0.98,
  words: [
    { text: 'hello', type: 'word', start: 0, end: 0.5 },
    { text: ' ', type: 'spacing' },
    { text: 'world', type: 'word', start: 0.6, end: 1 },
  ],
};
const entries = new Map<string, ProviderResponse>();
const cache = {
  get: vi.fn<(key: string) => Promise<ProviderResponse | undefined>>(),
  set: vi.fn<(key: string, value: ProviderResponse) => Promise<void>>(),
};

function createProvider(config: Partial<ElevenLabsSTTConfig> = {}) {
  return new ElevenLabsSTTProvider('elevenlabs:stt', {
    config: { apiKey: 'fixture-key', language: 'en', ...config },
  });
}

function checkZeroCost(response: ProviderResponse) {
  return handleCost({
    assertion: { type: 'cost', threshold: 0 },
    cost: response.cost,
    inverse: false,
  } as AssertionParams);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(mtime);
  entries.clear();
  cache.get.mockImplementation(async (key) => entries.get(key));
  cache.set.mockImplementation(async (key, value) => {
    entries.set(key, value);
  });
  vi.mocked(getCache).mockReturnValue(cache as unknown as ReturnType<typeof getCache>);
  vi.mocked(isCacheEnabled).mockReturnValue(true);
  vi.spyOn(fs, 'stat').mockResolvedValue({ mtime } as Awaited<ReturnType<typeof fs.stat>>);
  vi.spyOn(fs, 'readFile').mockResolvedValue(audio);
  vi.mocked(ElevenLabsClient.prototype.upload).mockResolvedValue(transcription);
});

afterEach(() => {
  entries.clear();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ElevenLabs STT full-response caching', () => {
  it.each(['', '   ', '...'])(
    'bypasses cached pre-fix silence scores for %j',
    async (referenceText) => {
      const shortHash = (value: string) =>
        crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
      const legacyConfig = {
        requestVersion: 3,
        modelId: 'scribe_v2',
        language: 'en',
        diarization: false,
        calculateWER: true,
        referenceText,
      };
      const legacyKey = `elevenlabs:stt:${shortHash(JSON.stringify(legacyConfig))}:${shortHash(`${audioPath}:${mtime.getTime()}`)}`;
      entries.set(legacyKey, {
        output: 'hello world',
        metadata: { wer: referenceText ? { wer: 0 } : undefined },
      });
      const provider = createProvider({ referenceText, calculateWER: true });
      const response = await provider.callApi(audioPath);
      expect(response).toMatchObject({
        cached: false,
        metadata: { wer: { wer: 2, insertions: 2, totalWords: 0 } },
      });
      expect(cache.get).not.toHaveBeenCalledWith(legacyKey);
      expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledTimes(1);
      expect(await provider.callApi(audioPath)).toMatchObject({
        cached: true,
        metadata: { wer: { wer: 2 } },
      });
      expect(entries.has(legacyKey)).toBe(true);
    },
  );

  it.each(['', '   ', '...'])(
    'scores unexpected speech against silent reference %j and replays the score',
    async (referenceText) => {
      const provider = createProvider({ referenceText, calculateWER: true });
      const response = await provider.callApi(audioPath);
      expect(response.error).toBeUndefined();
      expect(response.metadata?.wer).toMatchObject({ wer: 2, insertions: 2, totalWords: 0 });
      const cached = await provider.callApi(audioPath);
      expect(cached.cached).toBe(true);
      expect(cached.metadata?.wer).toEqual(response.metadata?.wer);
      expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledTimes(1);
    },
  );

  it('omits WER when no reference is supplied', async () => {
    const response = await createProvider({ calculateWER: true }).callApi(audioPath);
    expect(response.error).toBeUndefined();
    expect(response.metadata?.wer).toBeUndefined();
  });

  it('calculates WER when enabled after the same audio was cached without it', async () => {
    const withoutWER = createProvider({ referenceText: 'hello world', calculateWER: false });
    const withWER = createProvider({ referenceText: 'hello world', calculateWER: true });

    const first = await withoutWER.callApi(audioPath);
    expect(first.error).toBeUndefined();
    expect(first.metadata?.wer).toBeUndefined();

    const second = await withWER.callApi(audioPath);
    expect(second.error).toBeUndefined();
    expect(second.metadata?.wer).toMatchObject({ wer: 0, correct: 2, totalWords: 2 });
    expect(second.cached).toBe(false);
    expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledTimes(2);
  });

  it('uses the current reference after the same audio was cached with a matching reference', async () => {
    const matching = createProvider({ referenceText: 'hello world', calculateWER: true });
    const mismatching = createProvider({ referenceText: 'goodbye world', calculateWER: true });

    expect((await matching.callApi(audioPath)).metadata?.wer).toMatchObject({ wer: 0 });

    const response = await mismatching.callApi(audioPath);
    expect(response.error).toBeUndefined();
    expect(response.metadata?.wer).toMatchObject({
      wer: 0.5,
      substitutions: 1,
      details: { reference: 'goodbye world', hypothesis: 'hello world' },
    });
    expect(response.cached).toBe(false);
    expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledTimes(2);
  });

  it('reuses a full response for the same audio and WER settings', async () => {
    const config = { referenceText: 'hello world', calculateWER: true };
    const first = await createProvider(config).callApi(audioPath);
    const second = await createProvider(config).callApi(audioPath);

    expect(first.error).toBeUndefined();
    expect(first.cached).toBe(false);
    expect(second).toEqual({ ...first, cached: true });
    expect(second.metadata?.wer).toMatchObject({ wer: 0 });
    expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledTimes(1);
    expect(fs.readFile).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('bypasses a request-version-2 entry with stale WER and a fabricated zero cost', async () => {
    const shortHash = (value: string) =>
      crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
    const legacyConfig = {
      requestVersion: 2,
      modelId: 'scribe_v2',
      language: 'en',
      diarization: false,
    };
    const legacyKey = `elevenlabs:stt:${shortHash(JSON.stringify(legacyConfig))}:${shortHash(`${audioPath}:${mtime.getTime()}`)}`;
    const legacyResponse = {
      output: transcription.text,
      metadata: { transcription, wer: { wer: 0 } },
      cost: 0,
      cached: false,
    };
    entries.set(legacyKey, legacyResponse);
    const provider = createProvider({ referenceText: 'goodbye world', calculateWER: true });

    const response = await provider.callApi(audioPath);

    expect(response.error).toBeUndefined();
    expect(response.cached).toBe(false);
    expect(response.metadata?.wer).toMatchObject({ wer: 0.5 });
    expect(response).not.toHaveProperty('cost');
    expect(cache.get).not.toHaveBeenCalledWith(legacyKey);
    expect(entries.get(legacyKey)).toEqual(legacyResponse);
    expect(await provider.callApi(audioPath)).toEqual({ ...response, cached: true });
    expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledTimes(1);
  });
});

describe('ElevenLabs STT duration-based cost estimates', () => {
  it('cannot pass a cost assertion when a native response has no audio duration', async () => {
    const response = await createProvider().callApi(audioPath);

    expect(response.error).toBeUndefined();
    expect(response.output).toBe(transcription.text);
    expect(response.metadata?.transcription).toEqual(transcription);
    expect(() => checkZeroCost(response)).toThrow(
      'Cost assertion does not support providers that do not return cost',
    );
    expect(response).not.toHaveProperty('cost');
    expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledWith(
      '/speech-to-text',
      audio,
      'fixture.wav',
      { model_id: 'scribe_v2', language_code: 'en' },
    );
  });

  it('retains a nonzero estimate for a compatible response with a known positive duration', async () => {
    const legacyTranscription = { text: 'hello world', language: 'en', duration_ms: 60_000 };
    vi.mocked(ElevenLabsClient.prototype.upload).mockResolvedValue(legacyTranscription);

    const response = await createProvider().callApi(audioPath);

    expect(response.error).toBeUndefined();
    expect(response.metadata?.transcription).toEqual(legacyTranscription);
    expect(response.cost).toBeCloseTo(0.1);
    expect(checkZeroCost(response)).toMatchObject({ pass: false, score: 0 });
  });
});
