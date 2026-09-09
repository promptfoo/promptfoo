import crypto from 'crypto';
import { promises as fs, readFileSync } from 'fs';

import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../../src/cache';
import { ElevenLabsClient } from '../../../src/providers/elevenlabs/client';
import { ElevenLabsSTTProvider } from '../../../src/providers/elevenlabs/stt';
import { ElevenLabsTTSProvider } from '../../../src/providers/elevenlabs/tts';

import type { ElevenLabsSTTConfig, STTResponse } from '../../../src/providers/elevenlabs/stt/types';

const transcriptionExample = load(
  readFileSync('examples/provider-elevenlabs/stt/promptfooconfig.yaml', 'utf8'),
) as { providers: Array<{ id: string; config: Partial<ElevenLabsSTTConfig> }> };

vi.mock('../../../src/providers/elevenlabs/client');
vi.mock('../../../src/providers/elevenlabs/cost-tracker');
vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  isCacheEnabled: vi.fn(() => false),
  getCache: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('ElevenLabs documented request contracts', () => {
  it('sends TTS format and latency settings as query parameters, preserving binary audio', async () => {
    vi.mocked(ElevenLabsClient.prototype.post).mockResolvedValue(Buffer.from('fixture audio'));
    const provider = new ElevenLabsTTSProvider('elevenlabs:tts:fixture-voice', {
      config: {
        apiKey: 'fixture-key',
        cache: false,
        outputFormat: 'pcm_16000',
        optimizeStreamingLatency: 0,
        seed: 42,
      },
    });
    expect(await provider.callApi('Hello')).toMatchObject({
      audio: { data: Buffer.from('fixture audio').toString('base64'), format: 'pcm' },
      cached: false,
    });
    const [endpoint, body] = vi.mocked(ElevenLabsClient.prototype.post).mock.calls[0];
    const url = new URL(endpoint, 'https://example.test');
    expect(url.pathname).toBe('/text-to-speech/fixture-voice');
    expect(url.searchParams.get('output_format')).toBe('pcm_16000');
    expect(url.searchParams.get('optimize_streaming_latency')).toBe('0');
    expect(body).toMatchObject({ text: 'Hello', model_id: 'eleven_multilingual_v2', seed: 42 });
    expect(body).not.toHaveProperty('output_format');
    expect(body).not.toHaveProperty('optimize_streaming_latency');
  });

  it.each(transcriptionExample.providers)(
    'transcribes the runnable $id example with Scribe v2',
    async ({ id, config }) => {
      vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('fixture audio'));
      vi.mocked(ElevenLabsClient.prototype.upload).mockResolvedValue({
        text: 'The quick brown fox jumps over the lazy dog',
      });
      const provider = new ElevenLabsSTTProvider(id, {
        config: { ...config, apiKey: 'fixture-key' },
      });

      const response = await provider.callApi('/fixture.wav');

      expect(response.output).toBe('The quick brown fox jumps over the lazy dog');
      expect(response.error).toBeUndefined();
      expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledWith(
        '/speech-to-text',
        expect.any(Buffer),
        'fixture.wav',
        expect.objectContaining({ model_id: 'scribe_v2', language_code: 'en' }),
      );
      if (config.diarization) {
        expect(vi.mocked(ElevenLabsClient.prototype.upload).mock.calls[0][3]).toMatchObject({
          diarize: true,
          num_speakers: 3,
        });
      }
      if (config.calculateWER) {
        expect(response.metadata?.wer).toMatchObject({ wer: 0 });
      }
    },
  );

  it.each<{ name: string; transcription: STTResponse }>([
    {
      name: 'Scribe v2 words',
      transcription: {
        text: 'Hello (laughter)',
        language_code: 'eng',
        language_probability: 0.98,
        words: [
          {
            text: 'Hello',
            type: 'word',
            start: 0,
            end: 0.5,
            speaker_id: 'speaker_0',
            logprob: -0.1,
          },
          { text: ' ', type: 'spacing' },
          { text: '(laughter)', type: 'audio_event', start: null, end: null, speaker_id: null },
        ],
      },
    },
    {
      name: 'legacy compatible endpoint fields',
      transcription: {
        text: 'Hello',
        language: 'en',
        confidence: 0.95,
        duration_ms: 500,
        diarization: [
          { speaker_id: 'speaker_0', text: 'Hello', start_time_ms: 0, end_time_ms: 500 },
        ],
      },
    },
  ])('preserves $name in transcription metadata', async ({ transcription }) => {
    vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('fixture audio'));
    vi.mocked(ElevenLabsClient.prototype.upload).mockResolvedValue(transcription);
    const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
      config: { apiKey: 'fixture-key', diarization: true },
    });

    const response = await provider.callApi('/fixture.wav');

    expect(response.error).toBeUndefined();
    expect(response.output).toBe(transcription.text);
    expect(response.metadata?.transcription).toEqual(transcription);
    expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledWith(
      '/speech-to-text',
      expect.any(Buffer),
      'fixture.wav',
      { model_id: 'scribe_v2', diarize: true },
    );
  });

  it.each([1, 2])(
    'does not replay TTS request version %i and separates latency settings',
    async (version) => {
      const legacyParams = {
        ...(version === 2 && { requestVersion: 2 }),
        text: 'Hello',
        voiceId: 'fixture-voice',
        modelId: 'eleven_multilingual_v2',
        voiceSettings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          speed: 1,
        },
        outputFormat: 'ulaw_8000',
        ...(version === 2 && { optimizeStreamingLatency: 0 }),
        seed: 42,
      };
      const oldKey = `elevenlabs:tts:${crypto.createHash('sha256').update(JSON.stringify(legacyParams)).digest('hex')}`;
      const entries = new Map<string, unknown>([
        [
          oldKey,
          {
            audio: { data: Buffer.alloc(8000, 0xff).toString('base64'), format: 'wav' },
            voiceId: 'fixture-voice',
            modelId: 'eleven_multilingual_v2',
          },
        ],
      ]);
      const cache = {
        get: vi.fn(async (key: string) => entries.get(key)),
        set: vi.fn(async (key: string, value: unknown) => entries.set(key, value)),
      };
      vi.mocked(getCache).mockReturnValue(cache as unknown as ReturnType<typeof getCache>);
      vi.mocked(ElevenLabsClient.prototype.post).mockResolvedValue(Buffer.alloc(8000, 0xff));
      const options = {
        config: { apiKey: 'fixture-key', outputFormat: 'ulaw_8000' as const, seed: 42 },
      };
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts:fixture-voice', options);
      expect(await provider.callApi('Hello')).toMatchObject({
        cached: false,
        audio: { format: 'basic' },
      });
      expect(cache.get).not.toHaveBeenCalledWith(oldKey);
      expect(await provider.callApi('Hello')).toMatchObject({
        cached: true,
        audio: { format: 'basic' },
      });
      expect(ElevenLabsClient.prototype.post).toHaveBeenCalledTimes(1);
      const optimized = new ElevenLabsTTSProvider('elevenlabs:tts:fixture-voice', {
        config: { ...options.config, optimizeStreamingLatency: 3 },
      });
      expect(await optimized.callApi('Hello')).toMatchObject({ cached: false });
      expect(ElevenLabsClient.prototype.post).toHaveBeenCalledTimes(2);
    },
  );

  it('does not reuse STT responses cached before the request field correction', async () => {
    const audioPath = '/fixture.wav';
    const mtime = new Date(1_700_000_000_000);
    const config = { modelId: 'scribe_v1', language: 'en', diarization: true, maxSpeakers: 2 };
    const shortHash = (value: string) =>
      crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
    const oldKey = `elevenlabs:stt:${shortHash(JSON.stringify(config))}:${shortHash(`${audioPath}:${mtime.getTime()}`)}`;
    const entries = new Map([[oldKey, { output: 'Old transcript without requested diarization' }]]);
    const cache = {
      get: vi.fn(async (key: string) => entries.get(key)),
      set: vi.fn(async (key: string, value: { output: string }) => entries.set(key, value)),
    };
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockResolvedValue(cache as unknown as Awaited<ReturnType<typeof getCache>>);
    vi.spyOn(fs, 'stat').mockResolvedValue({ mtime } as Awaited<ReturnType<typeof fs.stat>>);
    vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('fixture audio'));
    vi.mocked(ElevenLabsClient.prototype.upload).mockResolvedValue({ text: 'Correct transcript' });
    const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
      config: { apiKey: 'fixture-key', ...config },
    });

    expect(await provider.callApi(audioPath)).toMatchObject({
      output: 'Correct transcript',
      cached: false,
    });
    expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledWith(
      '/speech-to-text',
      expect.any(Buffer),
      'fixture.wav',
      { model_id: 'scribe_v1', language_code: 'en', diarize: true, num_speakers: 2 },
    );
    expect(cache.get).not.toHaveBeenCalledWith(oldKey);
    expect(await provider.callApi(audioPath)).toMatchObject({
      output: 'Correct transcript',
      cached: true,
    });
    expect(ElevenLabsClient.prototype.upload).toHaveBeenCalledTimes(1);
  });
});
