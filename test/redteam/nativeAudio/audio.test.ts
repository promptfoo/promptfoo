import { describe, expect, it } from 'vitest';
import {
  concatenateWav,
  describeWav,
  ensureWav,
  stripWavHeaderToPcm16,
} from '../../../src/redteam/nativeAudio/audio';

describe('audio utilities', () => {
  describe('ensureWav', () => {
    it('should add WAV header to raw PCM data', () => {
      const pcmData = Buffer.alloc(1000, 0);
      const wav = ensureWav(pcmData, 24000);

      // Check RIFF header
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      // Check WAVE marker
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
      // Check fmt chunk
      expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
      // Check data chunk
      expect(wav.toString('ascii', 36, 40)).toBe('data');
      // Total size should be header (44) + data (1000)
      expect(wav.length).toBe(1044);
    });

    it('should not modify data that already has WAV header', () => {
      const existingWav = Buffer.alloc(1044);
      existingWav.write('RIFF', 0);
      existingWav.write('WAVE', 8);

      const result = ensureWav(existingWav);
      expect(result).toBe(existingWav);
      expect(result.length).toBe(1044);
    });

    it('should use custom sample rate', () => {
      const pcmData = Buffer.alloc(100, 0);
      const wav = ensureWav(pcmData, 16000);

      // Read sample rate from WAV header (offset 24)
      const sampleRate = wav.readUInt32LE(24);
      expect(sampleRate).toBe(16000);
    });

    it('should create valid WAV header with correct chunk sizes', () => {
      const pcmData = Buffer.alloc(500, 0);
      const wav = ensureWav(pcmData, 24000);

      // RIFF chunk size should be 36 + data size
      const riffSize = wav.readUInt32LE(4);
      expect(riffSize).toBe(536); // 36 + 500

      // Data chunk size should be the PCM data size
      const dataSize = wav.readUInt32LE(40);
      expect(dataSize).toBe(500);
    });
  });

  describe('stripWavHeaderToPcm16', () => {
    it('should strip WAV header and return PCM data', () => {
      const pcmData = Buffer.alloc(1000, 42); // Fill with value 42 for testing
      const wav = ensureWav(pcmData, 24000);

      const stripped = stripWavHeaderToPcm16(wav);

      expect(stripped.length).toBe(1000);
      // Verify the data is the same
      expect(stripped[0]).toBe(42);
      expect(stripped[999]).toBe(42);
    });

    it('should return data as-is if no WAV header present', () => {
      const rawData = Buffer.alloc(100, 99);
      const result = stripWavHeaderToPcm16(rawData);

      expect(result).toBe(rawData);
      expect(result.length).toBe(100);
    });

    it('should handle WAV files with multiple chunks', () => {
      // Create a WAV with an extra chunk before the data chunk
      const pcmData = Buffer.alloc(500, 55);
      const header = Buffer.alloc(60); // Extended header with extra chunk

      header.write('RIFF', 0);
      header.writeUInt32LE(52 + 500, 4); // Total size
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(24000, 24);
      header.writeUInt32LE(48000, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      // Extra chunk
      header.write('list', 36);
      header.writeUInt32LE(8, 40);
      header.writeUInt32LE(0, 44);
      header.writeUInt32LE(0, 48);
      // Data chunk
      header.write('data', 52);
      header.writeUInt32LE(500, 56);

      const wav = Buffer.concat([header, pcmData]);
      const stripped = stripWavHeaderToPcm16(wav);

      expect(stripped.length).toBe(500);
      expect(stripped[0]).toBe(55);
    });
  });

  describe('describeWav', () => {
    it('should return correct metadata for valid WAV', () => {
      const pcmData = Buffer.alloc(48000, 0); // 1 second of audio at 24kHz, 16-bit
      const wav = ensureWav(pcmData, 24000);

      const description = describeWav(wav);

      expect(description.hasHeader).toBe(true);
      expect(description.sampleRate).toBe(24000);
      expect(description.frames).toBe(24000);
      expect(description.durationSec).toBeCloseTo(1.0, 1);
    });

    it('should return null values for non-WAV data', () => {
      const rawData = Buffer.alloc(100, 0);
      const description = describeWav(rawData);

      expect(description.hasHeader).toBe(false);
      expect(description.frames).toBeNull();
      expect(description.sampleRate).toBeNull();
      expect(description.durationSec).toBeNull();
    });

    it('should calculate duration correctly for different sample rates', () => {
      const pcmData = Buffer.alloc(32000, 0); // 1 second at 16kHz, 16-bit
      const wav = ensureWav(pcmData, 16000);

      const description = describeWav(wav);

      expect(description.sampleRate).toBe(16000);
      expect(description.durationSec).toBeCloseTo(1.0, 1);
    });
  });

  describe('concatenateWav', () => {
    it('should concatenate multiple WAV buffers into single WAV', () => {
      const pcm1 = Buffer.alloc(1000, 1);
      const pcm2 = Buffer.alloc(2000, 2);
      const pcm3 = Buffer.alloc(1500, 3);

      const wav1 = ensureWav(pcm1, 24000);
      const wav2 = ensureWav(pcm2, 24000);
      const wav3 = ensureWav(pcm3, 24000);

      const concatenated = concatenateWav([wav1, wav2, wav3], 24000);

      // Should have WAV header
      expect(concatenated.toString('ascii', 0, 4)).toBe('RIFF');
      expect(concatenated.toString('ascii', 8, 12)).toBe('WAVE');

      // Should have combined PCM data size (1000 + 2000 + 1500 = 4500)
      const dataSize = concatenated.readUInt32LE(40);
      expect(dataSize).toBe(4500);

      // Total length should be header + combined data
      expect(concatenated.length).toBe(44 + 4500);
    });

    it('should preserve PCM data order when concatenating', () => {
      const pcm1 = Buffer.alloc(100, 11);
      const pcm2 = Buffer.alloc(100, 22);
      const pcm3 = Buffer.alloc(100, 33);

      const wav1 = ensureWav(pcm1, 24000);
      const wav2 = ensureWav(pcm2, 24000);
      const wav3 = ensureWav(pcm3, 24000);

      const concatenated = concatenateWav([wav1, wav2, wav3], 24000);
      const stripped = stripWavHeaderToPcm16(concatenated);

      // Check that data is in correct order
      expect(stripped[0]).toBe(11); // First chunk
      expect(stripped[99]).toBe(11);
      expect(stripped[100]).toBe(22); // Second chunk
      expect(stripped[199]).toBe(22);
      expect(stripped[200]).toBe(33); // Third chunk
      expect(stripped[299]).toBe(33);
    });

    it('should handle empty array by returning empty WAV', () => {
      const result = concatenateWav([], 24000);

      expect(result.toString('ascii', 0, 4)).toBe('RIFF');
      expect(result.length).toBe(44); // Just header, no data
    });

    it('should handle single buffer by returning it with header', () => {
      const pcm = Buffer.alloc(500, 99);
      const wav = ensureWav(pcm, 24000);

      const result = concatenateWav([wav], 24000);

      expect(result.toString('ascii', 0, 4)).toBe('RIFF');
      const dataSize = result.readUInt32LE(40);
      expect(dataSize).toBe(500);
    });

    it('should create valid audio that matches sum of input durations', () => {
      // Create 3 buffers representing 1 second each at 24kHz
      const oneSecondPcm = 24000 * 2; // 24000 samples/sec * 2 bytes per sample (16-bit)
      const pcm1 = Buffer.alloc(oneSecondPcm, 0);
      const pcm2 = Buffer.alloc(oneSecondPcm, 0);
      const pcm3 = Buffer.alloc(oneSecondPcm, 0);

      const wav1 = ensureWav(pcm1, 24000);
      const wav2 = ensureWav(pcm2, 24000);
      const wav3 = ensureWav(pcm3, 24000);

      const concatenated = concatenateWav([wav1, wav2, wav3], 24000);
      const description = describeWav(concatenated);

      expect(description.sampleRate).toBe(24000);
      expect(description.durationSec).toBeCloseTo(3.0, 1); // 3 * 1.0 seconds
    });

    it('should handle concatenation without gaps or overlaps', () => {
      // Create distinct patterns to verify no gaps/overlaps
      const pcm1 = Buffer.alloc(100);
      const pcm2 = Buffer.alloc(100);

      // Fill with distinct patterns
      for (let i = 0; i < 100; i++) {
        pcm1[i] = i % 256;
        pcm2[i] = (i + 100) % 256;
      }

      const wav1 = ensureWav(pcm1, 24000);
      const wav2 = ensureWav(pcm2, 24000);

      const concatenated = concatenateWav([wav1, wav2], 24000);
      const stripped = stripWavHeaderToPcm16(concatenated);

      // Verify no gap: last byte of first chunk followed immediately by first byte of second chunk
      expect(stripped[99]).toBe(99 % 256); // Last of first chunk
      expect(stripped[100]).toBe((0 + 100) % 256); // First of second chunk

      // Verify total length
      expect(stripped.length).toBe(200);
    });

    it('should use provided sample rate in header', () => {
      const pcm = Buffer.alloc(100, 0);
      const wav = ensureWav(pcm, 16000);

      const concatenated = concatenateWav([wav], 16000);

      const sampleRate = concatenated.readUInt32LE(24);
      expect(sampleRate).toBe(16000);
    });
  });

  describe('integration: full audio processing pipeline', () => {
    it('should handle create -> strip -> concatenate -> describe cycle', () => {
      // Simulate turn-by-turn audio processing
      const turn1Pcm = Buffer.alloc(24000, 1); // 0.5s at 24kHz
      const turn2Pcm = Buffer.alloc(24000, 2);
      const turn3Pcm = Buffer.alloc(24000, 3);

      // Create WAV files for each turn
      const turn1Wav = ensureWav(turn1Pcm, 24000);
      const turn2Wav = ensureWav(turn2Pcm, 24000);
      const turn3Wav = ensureWav(turn3Pcm, 24000);

      // Strip headers (simulate reading back from files)
      const turn1Stripped = stripWavHeaderToPcm16(turn1Wav);
      const turn2Stripped = stripWavHeaderToPcm16(turn2Wav);
      const turn3Stripped = stripWavHeaderToPcm16(turn3Wav);

      // Verify stripping worked
      expect(turn1Stripped.length).toBe(24000);
      expect(turn2Stripped.length).toBe(24000);
      expect(turn3Stripped.length).toBe(24000);

      // Re-create WAVs and concatenate
      const reWav1 = ensureWav(turn1Stripped, 24000);
      const reWav2 = ensureWav(turn2Stripped, 24000);
      const reWav3 = ensureWav(turn3Stripped, 24000);

      const conversationWav = concatenateWav([reWav1, reWav2, reWav3], 24000);

      // Describe final result
      const description = describeWav(conversationWav);

      expect(description.hasHeader).toBe(true);
      expect(description.sampleRate).toBe(24000);
      expect(description.durationSec).toBeCloseTo(1.5, 1); // 3 * 0.5s
      expect(description.frames).toBe(36000); // 3 * 12000 samples
    });
  });
});
