import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStreamingConnection } from '../../../../src/providers/elevenlabs/tts/streaming';
import { ElevenLabsWebSocketClient } from '../../../../src/providers/elevenlabs/websocket-client';

vi.mock('../../../../src/providers/elevenlabs/websocket-client');

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.resetAllMocks());

it.each([undefined, 'pcm_16000', 'ulaw_8000'] as const)(
  'negotiates streaming output format %s in the WebSocket handshake',
  async (outputFormat) => {
    await createStreamingConnection('fixture-key', 'fixture-voice', {
      modelId: 'eleven_multilingual_v2',
      outputFormat,
    });
    const [endpoint, config] = vi.mocked(ElevenLabsWebSocketClient.prototype.connect).mock.calls[0];
    const url = new URL(endpoint, 'wss://example.test');
    expect(url.pathname).toBe('/v1/text-to-speech/fixture-voice/stream-input');
    expect(url.searchParams.get('model_id')).toBe('eleven_multilingual_v2');
    expect(url.searchParams.get('output_format')).toBe(outputFormat ?? null);
    expect(config).not.toHaveProperty('output_format');
  },
);

it.each([42, 0, undefined])('preserves optional seed %s in the WebSocket query', async (seed) => {
  await createStreamingConnection('fixture-key', 'fixture-voice', {
    modelId: 'eleven_multilingual_v2',
    outputFormat: 'pcm_16000',
    seed,
  });

  const [endpoint, config] = vi.mocked(ElevenLabsWebSocketClient.prototype.connect).mock.calls[0];
  const url = new URL(endpoint, 'wss://example.test');
  expect(url.searchParams.get('seed')).toBe(seed === undefined ? null : String(seed));
  expect(url.searchParams.get('model_id')).toBe('eleven_multilingual_v2');
  expect(url.searchParams.get('output_format')).toBe('pcm_16000');
  expect(config).not.toHaveProperty('seed');
});
