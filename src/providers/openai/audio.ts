/** Decode G.711 telephony samples to signed PCM16 for browser playback. */
export function convertG711ToPcm16(audio: Buffer, type: 'audio/pcmu' | 'audio/pcma'): Buffer {
  const pcm = Buffer.alloc(audio.length * 2);
  for (let i = 0; i < audio.length; i++) {
    const sample = type === 'audio/pcmu' ? ~audio[i] & 0xff : audio[i] ^ 0x55;
    const exponent = (sample & 0x70) >> 4;
    let magnitude: number;
    if (type === 'audio/pcmu') {
      magnitude = ((((sample & 0x0f) << 3) + 0x84) << exponent) - 0x84;
      pcm.writeInt16LE(sample & 0x80 ? -magnitude : magnitude, i * 2);
    } else {
      magnitude = ((sample & 0x0f) << 4) + (exponent === 0 ? 8 : 0x108);
      if (exponent > 1) {
        magnitude <<= exponent - 1;
      }
      pcm.writeInt16LE(sample & 0x80 ? magnitude : -magnitude, i * 2);
    }
  }
  return pcm;
}

/** Wrap mono signed PCM16 in a WAV container for playback. */
export function convertPcm16ToWav(pcmData: Buffer, sampleRate = 24_000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}
