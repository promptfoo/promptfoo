import { describe, it, expect, beforeEach } from 'vitest';
import {
  AudioBuffer,
  pcm16ToWav,
  base64ToBuffer,
  bufferToBase64,
  calculateDuration,
  calculateBytes,
  createAudioChunk,
  mergeAudioBuffers,
  splitAudioBuffer,
} from '../../../src/providers/voice/audioBuffer';
import type { AudioChunk } from '../../../src/providers/voice/types';

describe('AudioBuffer', () => {
  let audioBuffer: AudioBuffer;

  beforeEach(() => {
    audioBuffer = new AudioBuffer('pcm16', 24000);
  });

  describe('constructor', () => {
    it('should create an empty buffer with default settings', () => {
      const buffer = new AudioBuffer();
      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.getFormat()).toBe('pcm16');
      expect(buffer.getSampleRate()).toBe(24000);
    });

    it('should create a buffer with custom settings', () => {
      const buffer = new AudioBuffer('g711_ulaw', 8000);
      expect(buffer.getFormat()).toBe('g711_ulaw');
      expect(buffer.getSampleRate()).toBe(8000);
    });
  });

  describe('append and getChunks', () => {
    it('should append chunks and retrieve them', () => {
      const chunk1: AudioChunk = {
        data: bufferToBase64(Buffer.from([0, 1, 2, 3])),
        timestamp: 0,
        format: 'pcm16',
        sampleRate: 24000,
      };
      const chunk2: AudioChunk = {
        data: bufferToBase64(Buffer.from([4, 5, 6, 7])),
        timestamp: 100,
        format: 'pcm16',
        sampleRate: 24000,
      };

      audioBuffer.append(chunk1);
      audioBuffer.append(chunk2);

      const chunks = audioBuffer.getChunks();
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual(chunk1);
      expect(chunks[1]).toEqual(chunk2);
    });

    it('should return a copy of chunks (immutable)', () => {
      const chunk: AudioChunk = {
        data: bufferToBase64(Buffer.from([0, 1])),
        timestamp: 0,
        format: 'pcm16',
        sampleRate: 24000,
      };

      audioBuffer.append(chunk);
      const chunks1 = audioBuffer.getChunks();
      const chunks2 = audioBuffer.getChunks();

      expect(chunks1).not.toBe(chunks2);
      expect(chunks1).toEqual(chunks2);
    });
  });

  describe('isEmpty and getChunkCount', () => {
    it('should report empty buffer correctly', () => {
      expect(audioBuffer.isEmpty()).toBe(true);
      expect(audioBuffer.getChunkCount()).toBe(0);
    });

    it('should report non-empty buffer correctly', () => {
      audioBuffer.append({
        data: bufferToBase64(Buffer.from([0, 1])),
        timestamp: 0,
        format: 'pcm16',
        sampleRate: 24000,
      });

      expect(audioBuffer.isEmpty()).toBe(false);
      expect(audioBuffer.getChunkCount()).toBe(1);
    });
  });

  describe('getDuration', () => {
    it('should return 0 for empty buffer', () => {
      expect(audioBuffer.getDuration()).toBe(0);
    });

    it('should calculate duration correctly for PCM16', () => {
      // 24000 samples/sec, 2 bytes/sample = 48000 bytes/sec
      // 4800 bytes = 100ms
      const data = Buffer.alloc(4800);
      audioBuffer.append({
        data: bufferToBase64(data),
        timestamp: 0,
        format: 'pcm16',
        sampleRate: 24000,
      });

      expect(audioBuffer.getDuration()).toBe(100);
    });
  });

  describe('toBuffer', () => {
    it('should return empty buffer when no chunks', () => {
      const result = audioBuffer.toBuffer();
      expect(result.length).toBe(0);
    });

    it('should concatenate all chunks', () => {
      const data1 = Buffer.from([0, 1, 2, 3]);
      const data2 = Buffer.from([4, 5, 6, 7]);

      audioBuffer.append({
        data: bufferToBase64(data1),
        timestamp: 0,
        format: 'pcm16',
        sampleRate: 24000,
      });
      audioBuffer.append({
        data: bufferToBase64(data2),
        timestamp: 100,
        format: 'pcm16',
        sampleRate: 24000,
      });

      const result = audioBuffer.toBuffer();
      expect(result).toEqual(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
    });
  });

  describe('toWav', () => {
    it('should create valid WAV header', () => {
      const pcmData = Buffer.alloc(100);
      audioBuffer.append({
        data: bufferToBase64(pcmData),
        timestamp: 0,
        format: 'pcm16',
        sampleRate: 24000,
      });

      const wav = audioBuffer.toWav();

      // Check WAV header
      expect(wav.slice(0, 4).toString()).toBe('RIFF');
      expect(wav.slice(8, 12).toString()).toBe('WAVE');
      expect(wav.slice(12, 16).toString()).toBe('fmt ');
      expect(wav.slice(36, 40).toString()).toBe('data');

      // Header is 44 bytes + data
      expect(wav.length).toBe(44 + pcmData.length);
    });
  });

  describe('getStartTime and getEndTime', () => {
    it('should return undefined for empty buffer', () => {
      expect(audioBuffer.getStartTime()).toBeUndefined();
      expect(audioBuffer.getEndTime()).toBeUndefined();
    });

    it('should return correct times', () => {
      audioBuffer.append({
        data: bufferToBase64(Buffer.from([0, 1])),
        timestamp: 100,
        duration: 50,
        format: 'pcm16',
        sampleRate: 24000,
      });
      audioBuffer.append({
        data: bufferToBase64(Buffer.from([2, 3])),
        timestamp: 200,
        duration: 50,
        format: 'pcm16',
        sampleRate: 24000,
      });

      expect(audioBuffer.getStartTime()).toBe(100);
      expect(audioBuffer.getEndTime()).toBe(250);
    });
  });

  describe('clear', () => {
    it('should clear all chunks', () => {
      audioBuffer.append({
        data: bufferToBase64(Buffer.from([0, 1])),
        timestamp: 0,
        format: 'pcm16',
        sampleRate: 24000,
      });

      expect(audioBuffer.isEmpty()).toBe(false);

      audioBuffer.clear();

      expect(audioBuffer.isEmpty()).toBe(true);
      expect(audioBuffer.getChunkCount()).toBe(0);
    });
  });
});

describe('pcm16ToWav', () => {
  it('should create valid WAV file structure', () => {
    const pcmData = Buffer.alloc(1000);
    const wav = pcm16ToWav(pcmData, 24000);

    // RIFF header
    expect(wav.slice(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(36 + pcmData.length); // file size
    expect(wav.slice(8, 12).toString()).toBe('WAVE');

    // fmt chunk
    expect(wav.slice(12, 16).toString()).toBe('fmt ');
    expect(wav.readUInt32LE(16)).toBe(16); // chunk size
    expect(wav.readUInt16LE(20)).toBe(1); // audio format (PCM)
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt32LE(24)).toBe(24000); // sample rate
    expect(wav.readUInt32LE(28)).toBe(48000); // byte rate
    expect(wav.readUInt16LE(32)).toBe(2); // block align
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample

    // data chunk
    expect(wav.slice(36, 40).toString()).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(pcmData.length);
  });

  it('should handle different sample rates', () => {
    const pcmData = Buffer.alloc(100);
    const wav = pcm16ToWav(pcmData, 48000);

    expect(wav.readUInt32LE(24)).toBe(48000); // sample rate
    expect(wav.readUInt32LE(28)).toBe(96000); // byte rate
  });
});

describe('base64ToBuffer and bufferToBase64', () => {
  it('should convert buffer to base64 and back', () => {
    const original = Buffer.from([0, 1, 2, 255, 128, 64]);
    const base64 = bufferToBase64(original);
    const restored = base64ToBuffer(base64);

    expect(restored).toEqual(original);
  });

  it('should handle empty buffer', () => {
    const original = Buffer.alloc(0);
    const base64 = bufferToBase64(original);
    const restored = base64ToBuffer(base64);

    expect(restored).toEqual(original);
  });
});

describe('calculateDuration', () => {
  it('should calculate duration for pcm16', () => {
    // 24000 Hz, 2 bytes/sample
    // 48000 bytes = 1 second = 1000ms
    expect(calculateDuration(48000, 24000, 'pcm16')).toBe(1000);
    expect(calculateDuration(4800, 24000, 'pcm16')).toBe(100);
  });

  it('should calculate duration for g711', () => {
    // 8000 Hz, 1 byte/sample
    // 8000 bytes = 1 second = 1000ms
    expect(calculateDuration(8000, 8000, 'g711_ulaw')).toBe(1000);
    expect(calculateDuration(800, 8000, 'g711_alaw')).toBe(100);
  });
});

describe('calculateBytes', () => {
  it('should calculate bytes for pcm16', () => {
    expect(calculateBytes(1000, 24000, 'pcm16')).toBe(48000);
    expect(calculateBytes(100, 24000, 'pcm16')).toBe(4800);
  });

  it('should calculate bytes for g711', () => {
    expect(calculateBytes(1000, 8000, 'g711_ulaw')).toBe(8000);
  });
});

describe('createAudioChunk', () => {
  it('should create chunk from buffer', () => {
    const data = Buffer.alloc(4800); // 100ms at 24kHz PCM16
    const chunk = createAudioChunk(data, 500);

    expect(chunk.data).toBe(bufferToBase64(data));
    expect(chunk.timestamp).toBe(500);
    expect(chunk.duration).toBe(100);
    expect(chunk.format).toBe('pcm16');
    expect(chunk.sampleRate).toBe(24000);
  });

  it('should create chunk from base64 string', () => {
    const data = Buffer.alloc(4800);
    const base64 = bufferToBase64(data);
    const chunk = createAudioChunk(base64, 500);

    expect(chunk.data).toBe(base64);
    expect(chunk.timestamp).toBe(500);
  });
});

describe('mergeAudioBuffers', () => {
  it('should return empty buffer for empty array', () => {
    const merged = mergeAudioBuffers([]);
    expect(merged.isEmpty()).toBe(true);
  });

  it('should merge multiple buffers', () => {
    const buffer1 = new AudioBuffer('pcm16', 24000);
    const buffer2 = new AudioBuffer('pcm16', 24000);

    buffer1.append({
      data: bufferToBase64(Buffer.from([0, 1])),
      timestamp: 0,
      format: 'pcm16',
      sampleRate: 24000,
    });
    buffer2.append({
      data: bufferToBase64(Buffer.from([2, 3])),
      timestamp: 100,
      format: 'pcm16',
      sampleRate: 24000,
    });

    const merged = mergeAudioBuffers([buffer1, buffer2]);
    expect(merged.getChunkCount()).toBe(2);
    expect(merged.toBuffer()).toEqual(Buffer.from([0, 1, 2, 3]));
  });
});

describe('splitAudioBuffer', () => {
  it('should split buffer at timestamp', () => {
    const buffer = new AudioBuffer('pcm16', 24000);

    buffer.append({
      data: bufferToBase64(Buffer.from([0, 1])),
      timestamp: 50,
      format: 'pcm16',
      sampleRate: 24000,
    });
    buffer.append({
      data: bufferToBase64(Buffer.from([2, 3])),
      timestamp: 150,
      format: 'pcm16',
      sampleRate: 24000,
    });
    buffer.append({
      data: bufferToBase64(Buffer.from([4, 5])),
      timestamp: 250,
      format: 'pcm16',
      sampleRate: 24000,
    });

    const [before, after] = splitAudioBuffer(buffer, 200);

    expect(before.getChunkCount()).toBe(2);
    expect(after.getChunkCount()).toBe(1);
  });
});
