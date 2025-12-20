/**
 * Audio Buffer Management
 *
 * Handles accumulation of audio chunks, format conversion,
 * and WAV encoding for voice conversations.
 */

import type { AudioChunk, AudioFormat } from './types';
import { BYTES_PER_SAMPLE, SAMPLE_RATES } from './types';

/**
 * Manages audio chunks for a conversation turn.
 * Provides methods for accumulation, concatenation, and format conversion.
 */
export class AudioBuffer {
  private chunks: AudioChunk[] = [];
  private readonly format: AudioFormat;
  private readonly sampleRate: number;

  constructor(format: AudioFormat = 'pcm16', sampleRate: number = SAMPLE_RATES.OPENAI_REALTIME) {
    this.format = format;
    this.sampleRate = sampleRate;
  }

  /**
   * Append an audio chunk to the buffer.
   */
  append(chunk: AudioChunk): void {
    this.chunks.push(chunk);
  }

  /**
   * Get all chunks in the buffer.
   */
  getChunks(): AudioChunk[] {
    return [...this.chunks];
  }

  /**
   * Get the number of chunks in the buffer.
   */
  getChunkCount(): number {
    return this.chunks.length;
  }

  /**
   * Check if the buffer is empty.
   */
  isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  /**
   * Get total duration in milliseconds.
   */
  getDuration(): number {
    const totalBytes = this.chunks.reduce((sum, chunk) => {
      return sum + base64ToBuffer(chunk.data).length;
    }, 0);

    return calculateDuration(totalBytes, this.sampleRate, this.format);
  }

  /**
   * Get concatenated audio as a Buffer.
   */
  toBuffer(): Buffer {
    if (this.chunks.length === 0) {
      return Buffer.alloc(0);
    }

    const buffers = this.chunks.map((chunk) => base64ToBuffer(chunk.data));
    return Buffer.concat(buffers);
  }

  /**
   * Convert the audio to WAV format.
   */
  toWav(): Buffer {
    const pcmData = this.toBuffer();
    return pcm16ToWav(pcmData, this.sampleRate);
  }

  /**
   * Get the first timestamp in the buffer.
   */
  getStartTime(): number | undefined {
    return this.chunks[0]?.timestamp;
  }

  /**
   * Get the last timestamp in the buffer.
   */
  getEndTime(): number | undefined {
    if (this.chunks.length === 0) {
      return undefined;
    }
    const lastChunk = this.chunks[this.chunks.length - 1];
    return lastChunk.timestamp + (lastChunk.duration || 0);
  }

  /**
   * Get total size in bytes.
   */
  getSize(): number {
    return this.chunks.reduce((sum, chunk) => {
      return sum + base64ToBuffer(chunk.data).length;
    }, 0);
  }

  /**
   * Clear the buffer.
   */
  clear(): void {
    this.chunks = [];
  }

  /**
   * Get the audio format.
   */
  getFormat(): AudioFormat {
    return this.format;
  }

  /**
   * Get the sample rate.
   */
  getSampleRate(): number {
    return this.sampleRate;
  }
}

/**
 * Convert PCM16 audio data to WAV format.
 *
 * @param pcmData Raw PCM16 audio data
 * @param sampleRate Sample rate in Hz (default 24000)
 * @param numChannels Number of channels (default 1 for mono)
 * @returns WAV format buffer with header
 */
export function pcm16ToWav(
  pcmData: Buffer,
  sampleRate: number = SAMPLE_RATES.OPENAI_REALTIME,
  numChannels: number = 1,
): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const fileSize = 36 + dataSize;

  // Create WAV header (44 bytes)
  const header = Buffer.alloc(44);
  let offset = 0;

  // RIFF header
  header.write('RIFF', offset);
  offset += 4;
  header.writeUInt32LE(fileSize, offset);
  offset += 4;
  header.write('WAVE', offset);
  offset += 4;

  // fmt chunk
  header.write('fmt ', offset);
  offset += 4;
  header.writeUInt32LE(16, offset); // chunk size
  offset += 4;
  header.writeUInt16LE(1, offset); // audio format (PCM)
  offset += 2;
  header.writeUInt16LE(numChannels, offset);
  offset += 2;
  header.writeUInt32LE(sampleRate, offset);
  offset += 4;
  header.writeUInt32LE(byteRate, offset);
  offset += 4;
  header.writeUInt16LE(blockAlign, offset);
  offset += 2;
  header.writeUInt16LE(bitsPerSample, offset);
  offset += 2;

  // data chunk
  header.write('data', offset);
  offset += 4;
  header.writeUInt32LE(dataSize, offset);

  return Buffer.concat([header, pcmData]);
}

/**
 * Convert base64 encoded audio to a Buffer.
 */
export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * Convert a Buffer to base64 encoded string.
 */
export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Calculate duration in milliseconds from byte count.
 *
 * @param bytes Number of bytes
 * @param sampleRate Sample rate in Hz
 * @param format Audio format
 * @returns Duration in milliseconds
 */
export function calculateDuration(bytes: number, sampleRate: number, format: AudioFormat): number {
  const bytesPerSample = BYTES_PER_SAMPLE[format];
  const samples = bytes / bytesPerSample;
  const seconds = samples / sampleRate;
  return Math.round(seconds * 1000);
}

/**
 * Calculate byte count from duration.
 *
 * @param durationMs Duration in milliseconds
 * @param sampleRate Sample rate in Hz
 * @param format Audio format
 * @returns Number of bytes
 */
export function calculateBytes(durationMs: number, sampleRate: number, format: AudioFormat): number {
  const bytesPerSample = BYTES_PER_SAMPLE[format];
  const seconds = durationMs / 1000;
  const samples = seconds * sampleRate;
  return Math.round(samples * bytesPerSample);
}

/**
 * Create an AudioChunk from raw audio data.
 *
 * @param data Audio data as Buffer or base64 string
 * @param timestamp Timestamp in ms since conversation start
 * @param format Audio format
 * @param sampleRate Sample rate in Hz
 * @returns AudioChunk
 */
export function createAudioChunk(
  data: Buffer | string,
  timestamp: number,
  format: AudioFormat = 'pcm16',
  sampleRate: number = SAMPLE_RATES.OPENAI_REALTIME,
): AudioChunk {
  const base64Data = typeof data === 'string' ? data : bufferToBase64(data);
  const buffer = typeof data === 'string' ? base64ToBuffer(data) : data;
  const duration = calculateDuration(buffer.length, sampleRate, format);

  return {
    data: base64Data,
    timestamp,
    duration,
    format,
    sampleRate,
  };
}

/**
 * Merge multiple AudioBuffers into one.
 */
export function mergeAudioBuffers(buffers: AudioBuffer[]): AudioBuffer {
  if (buffers.length === 0) {
    return new AudioBuffer();
  }

  const first = buffers[0];
  const merged = new AudioBuffer(first.getFormat(), first.getSampleRate());

  for (const buffer of buffers) {
    for (const chunk of buffer.getChunks()) {
      merged.append(chunk);
    }
  }

  return merged;
}

/**
 * Split audio buffer at a specific timestamp.
 *
 * @param buffer The buffer to split
 * @param timestampMs The timestamp to split at
 * @returns Tuple of [before, after] buffers
 */
export function splitAudioBuffer(
  buffer: AudioBuffer,
  timestampMs: number,
): [AudioBuffer, AudioBuffer] {
  const before = new AudioBuffer(buffer.getFormat(), buffer.getSampleRate());
  const after = new AudioBuffer(buffer.getFormat(), buffer.getSampleRate());

  for (const chunk of buffer.getChunks()) {
    if (chunk.timestamp < timestampMs) {
      before.append(chunk);
    } else {
      after.append(chunk);
    }
  }

  return [before, after];
}
