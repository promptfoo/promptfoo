import { describe, expect, it } from 'vitest';
import { convertG711ToPcm16 } from '../../../src/providers/openai/audio';

describe('G.711 decoding', () => {
  // Reference samples decoded independently with FFmpeg's pcm_mulaw/pcm_alaw codecs.
  it.each([
    ['audio/pcmu', [0, 16, 127, 128, 255], [-32124, -15996, 0, 32124, 0]],
    ['audio/pcma', [0, 42, 85, 128, 170, 213], [-5504, -32256, -8, 5504, 32256, 8]],
  ] as const)('decodes %s sign, amplitude, and silence', (type, encoded, expected) => {
    const pcm = convertG711ToPcm16(Buffer.from(encoded), type);
    expect(pcm.length).toBe(encoded.length * 2);
    expect(Array.from({ length: encoded.length }, (_, i) => pcm.readInt16LE(i * 2))).toEqual(
      expected,
    );
  });
});
