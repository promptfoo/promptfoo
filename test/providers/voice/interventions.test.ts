import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isCacheEnabled } from '../../../src/cache';
import { OpenAiTtsProvider } from '../../../src/providers/openai/tts';
import { prepareVoiceInterventions } from '../../../src/providers/voice/interventions';
import { fetchWithRetries } from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../../util/utils';

import type { ProviderResponse } from '../../../src/contracts/providers';
import type {
  VoiceInterventionConfig,
  VoiceParticipantOptions,
} from '../../../src/providers/voice/types';

vi.mock('../../../src/cache');
vi.mock('../../../src/util/fetch/index');

const mockedFetch = vi.mocked(fetchWithRetries);
const BYTES_PER_MS = 48;

function tone(durationMs = 100, value = 1000): Buffer {
  const audio = Buffer.alloc(durationMs * BYTES_PER_MS);
  for (let offset = 0; offset < audio.length; offset += 2) {
    audio.writeInt16LE(value, offset);
  }
  return audio;
}

function audioResponse(pcm = tone()): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => Uint8Array.from(pcm).buffer,
  } as Response;
}

function prepare(
  entries: VoiceInterventionConfig[] = [{ atMs: 100, text: 'Actually, please use decaf.' }],
  caller: VoiceParticipantOptions = { apiKey: 'caller-test-key' },
  durationMs = 2000,
  signal = new AbortController().signal,
  onResponse = vi.fn(),
) {
  return prepareVoiceInterventions(
    entries,
    caller,
    undefined,
    durationMs,
    undefined,
    signal,
    onResponse,
  );
}

describe('prepareVoiceInterventions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    mockedFetch.mockResolvedValue(audioResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses caller credentials and speech controls at the HTTP equivalent of the Live endpoint', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-must-not-be-used' });
    const controller = new AbortController();
    const onResponse = vi.fn();
    const prepared = await prepareVoiceInterventions(
      [{ atMs: 100, text: 'A different order.', instructions: 'Follow the revised order.' }],
      {
        apiBaseUrl: 'wss://caller.example.test/v1',
        apiKey: 'caller-owned-key',
        organization: 'caller-org',
        headers: { 'X-Caller-Project': 'caller-project' },
        maxRetries: 1,
        audio: { output: { voice: 'cedar' } },
      },
      { model: 'gpt-4o-mini-tts', voice: 'marin', instructions: 'Speak clearly.', speed: 1.1 },
      2000,
      { OPENAI_API_KEY: 'evaluation-ambient-must-not-be-used' },
      controller.signal,
      onResponse,
    );
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://caller.example.test/v1/audio/speech',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer caller-owned-key',
          'OpenAI-Organization': 'caller-org',
          'X-Caller-Project': 'caller-project',
        }),
        signal: controller.signal,
      }),
      expect.any(Number),
      1,
    );
    expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string)).toEqual({
      model: 'gpt-4o-mini-tts',
      input: 'A different order.',
      voice: 'marin',
      instructions: 'Speak clearly.',
      response_format: 'pcm',
      speed: 1.1,
    });
    expect(prepared[0]).toMatchObject({
      atMs: 100,
      text: 'A different order.',
      instructions: 'Follow the revised order.',
      trimmedLeadingSilenceMs: 0,
      audio: tone(),
    });
    expect(prepared[0].clipSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(onResponse).toHaveBeenCalledOnce();
    // This model's speech response does not report billable usage. Preserve unknown
    // cost instead of inventing zero or silently excluding preparation from totals.
    expect(onResponse.mock.calls[0][0]).toMatchObject({ cached: false });
    expect(onResponse.mock.calls[0][0].cost).toBeUndefined();
  });

  it.each([{ apiBaseUrl: 'wss://gateway.example.test/v1' }, { apiHost: 'gateway.example.test' }])(
    'does not forward an ambient key to an explicitly configured gateway: %j',
    async (endpoint) => {
      mockProcessEnv({ OPENAI_API_KEY: 'ambient-must-not-leak' });
      await prepare(undefined, { ...endpoint, apiKeyRequired: false });
      expect(mockedFetch).toHaveBeenCalledOnce();
      const headers = new Headers(mockedFetch.mock.calls[0][1]?.headers);
      expect(headers.has('authorization')).toBe(false);
    },
  );

  it.each(['OPENAI_API_BASE_URL', 'OPENAI_BASE_URL', 'OPENAI_API_HOST'] as const)(
    'applies gateway credential isolation when the endpoint comes from %s',
    async (key) => {
      await prepareVoiceInterventions(
        [{ atMs: 100, text: 'Caller interruption.' }],
        { apiKeyRequired: false },
        undefined,
        2000,
        {
          OPENAI_API_KEY: 'ambient-must-not-leak',
          [key]:
            key === 'OPENAI_API_HOST' ? 'gateway.example.test' : 'wss://gateway.example.test/v1',
        },
        new AbortController().signal,
        vi.fn(),
      );
      expect(mockedFetch.mock.calls[0][0]).toBe('https://gateway.example.test/v1/audio/speech');
      expect(new Headers(mockedFetch.mock.calls[0][1]?.headers).has('authorization')).toBe(false);
    },
  );

  it('uses a named caller credential instead of the ambient default key', async () => {
    mockProcessEnv({
      OPENAI_API_KEY: 'ambient-must-not-leak',
      CALLER_VOICE_KEY: 'named-caller-key',
    });
    await prepare(undefined, {
      apiBaseUrl: 'https://gateway.example.test/v1',
      apiKeyEnvar: 'CALLER_VOICE_KEY',
    });
    expect(new Headers(mockedFetch.mock.calls[0][1]?.headers).get('authorization')).toBe(
      'Bearer named-caller-key',
    );
  });

  it('keeps custom header authentication while excluding ambient credentials', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-must-not-leak' });
    await prepare(undefined, {
      apiBaseUrl: 'https://gateway.example.test/v1',
      headers: { 'x-api-key': 'gateway-owned-key' },
    });
    const headers = new Headers(mockedFetch.mock.calls[0][1]?.headers);
    expect(headers.get('x-api-key')).toBe('gateway-owned-key');
    expect(headers.has('authorization')).toBe(false);
  });

  it('converts caller URL userinfo to Basic authentication without leaving it in the request URL', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-must-not-leak' });
    await prepare(undefined, { apiBaseUrl: 'ws://user:pass%20word@gateway.example.test/v1' });
    expect(mockedFetch.mock.calls[0][0]).toBe('http://gateway.example.test/v1/audio/speech');
    expect(new Headers(mockedFetch.mock.calls[0][1]?.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('user:pass word').toString('base64')}`,
    );
  });

  it.each([
    'file:///tmp/voice',
    'https://gateway.example.test/v1?token=invalid',
    'https://gateway.example.test/v1#fragment',
  ])('rejects incompatible endpoint %s before making a speech request', async (apiBaseUrl) => {
    await expect(prepare(undefined, { apiBaseUrl })).rejects.toThrow(/URLs/);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('trims leading quiet blocks but preserves the final 20 ms and every remaining PCM byte', async () => {
    const original = Buffer.concat([tone(100, 0), tone(40), tone(30, 0)]);
    mockedFetch.mockResolvedValue(audioResponse(original));
    const [prepared] = await prepare();
    expect(prepared.trimmedLeadingSilenceMs).toBe(80);
    expect(prepared.audio).toEqual(original.subarray(80 * BYTES_PER_MS));
    expect(prepared.audio?.subarray(0, 20 * BYTES_PER_MS)).toEqual(tone(20, 0));
  });

  it('does not synthesize instruction-only steering or require TTS endpoint configuration for it', async () => {
    const entries = [{ atMs: 100, instructions: 'Ask one short follow-up.' }];
    expect(await prepare(entries, { apiBaseUrl: 'not-used-for-speech' })).toEqual(entries);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('does not begin preparing speech when already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Test cancelled before speech preparation.'));
    await expect(prepare(undefined, undefined, undefined, controller.signal)).rejects.toThrow(
      'Test cancelled before speech preparation.',
    );
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('propagates cancellation through the active synthesis request and stops later synthesis', async () => {
    const controller = new AbortController();
    mockedFetch.mockImplementation(async (_url, init) => {
      controller.abort();
      init?.signal?.throwIfAborted();
      return audioResponse();
    });
    await expect(
      prepare(
        [
          { atMs: 100, text: 'First.' },
          { atMs: 1000, text: 'Second.' },
        ],
        undefined,
        undefined,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockedFetch).toHaveBeenCalledOnce();
  });

  it('retains a completed response if cancellation arrives before preparation can use its audio', async () => {
    const controller = new AbortController();
    const onResponse = vi.fn(() => controller.abort());
    await expect(
      prepare(undefined, undefined, undefined, controller.signal, onResponse),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(onResponse).toHaveBeenCalledOnce();
  });

  it.each([
    { name: 'missing audio', response: {}, error: /no audio/ },
    {
      name: 'invalid base64',
      response: { audio: { format: 'pcm16', data: '%invalid' } },
      error: /valid base64/,
    },
    {
      name: 'odd PCM byte count',
      response: { audio: { format: 'pcm16', data: 'AA==' } },
      error: /raw pcm16/,
    },
    {
      name: 'unsupported encoding',
      response: { audio: { format: 'mp3', data: 'AAAA' } },
      error: /raw pcm16/,
    },
    { name: 'provider error', response: { error: 'Synthesis failed.' }, error: /Synthesis failed/ },
  ])('rejects $name while preserving its response for accounting', async ({ response, error }) => {
    vi.spyOn(OpenAiTtsProvider.prototype, 'callApi').mockResolvedValue(
      response as ProviderResponse,
    );
    const onResponse = vi.fn();
    await expect(prepare(undefined, undefined, undefined, undefined, onResponse)).rejects.toThrow(
      error,
    );
    expect(onResponse).toHaveBeenCalledExactlyOnceWith(response);
  });

  it('rejects silent synthesis while preserving the unknown-cost response', async () => {
    mockedFetch.mockResolvedValue(audioResponse(tone(100, 0)));
    const onResponse = vi.fn();
    await expect(prepare(undefined, undefined, undefined, undefined, onResponse)).rejects.toThrow(
      /no audible PCM/,
    );
    expect(onResponse).toHaveBeenCalledOnce();
    expect(onResponse.mock.calls[0][0].cost).toBeUndefined();
  });

  it.each([
    { entries: [{ atMs: 999, text: 'Too late.' }], duration: 1000 },
    {
      entries: [
        { atMs: 0, text: 'First.' },
        { atMs: 0, text: 'Second.' },
      ],
      duration: 2000,
    },
    {
      entries: [
        { atMs: 21, text: 'First.' },
        { atMs: 39, text: 'Second.' },
      ],
      duration: 2000,
    },
  ])('rejects an impossible schedule without paid synthesis: %j', async ({ entries, duration }) => {
    const onResponse = vi.fn();
    await expect(prepare(entries, undefined, duration, undefined, onResponse)).rejects.toThrow();
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(onResponse).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'longer than 30 seconds', clipMs: 30020, atMs: 0, captureMs: 40000 },
    { name: 'past capture end', clipMs: 120, atMs: 900, captureMs: 1000 },
    {
      name: 'past capture end after rounding its start to a frame',
      clipMs: 20,
      atMs: 981,
      captureMs: 1001,
      knownBeforeRendering: true,
    },
  ])('rejects speech $name', async ({ clipMs, atMs, captureMs, knownBeforeRendering }) => {
    mockedFetch.mockResolvedValue(audioResponse(tone(clipMs)));
    const onResponse = vi.fn();
    await expect(
      prepare([{ atMs, text: 'Scheduled speech.' }], undefined, captureMs, undefined, onResponse),
    ).rejects.toThrow(/30 seconds and the capture window/);
    expect(onResponse).toHaveBeenCalledTimes(knownBeforeRendering ? 0 : 1);
  });

  it('rejects a clip that overlaps the next intervention on the media clock', async () => {
    mockedFetch.mockResolvedValue(audioResponse(tone(100)));
    await expect(
      prepare([
        { atMs: 100, text: 'First.' },
        { atMs: 181, text: 'Second.' },
      ]),
    ).resolves.toHaveLength(2);
    await expect(
      prepare([
        { atMs: 100, text: 'First.' },
        { atMs: 179, text: 'Second.' },
      ]),
    ).rejects.toThrow(/finish before the next intervention/);
  });

  it('records prior successful and failed synthesis responses when a later request fails', async () => {
    mockedFetch.mockResolvedValueOnce(audioResponse()).mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      text: async () => JSON.stringify({ error: { message: 'Speech service unavailable.' } }),
    } as Response);
    const onResponse = vi.fn();
    await expect(
      prepare(
        [
          { atMs: 100, text: 'First.' },
          { atMs: 1000, text: 'Second.' },
        ],
        undefined,
        undefined,
        undefined,
        onResponse,
      ),
    ).rejects.toThrow(/Speech service unavailable/);
    expect(onResponse).toHaveBeenCalledTimes(2);
    expect(onResponse.mock.calls[0][0].audio.data).toBeTruthy();
    expect(onResponse.mock.calls[1][0].error).toMatch(/API error 503/);
    expect(onResponse.mock.calls[1][0].cost).toBeUndefined();
  });
});
