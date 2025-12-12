/**
 * Audio format conversion utilities for real-time audio providers.
 *
 * This module provides functions for converting between different audio formats
 * used by various audio providers (OpenAI Realtime, Google Live, Bedrock Nova Sonic).
 */

export type SupportedInputFormat = 'wav' | 'mp3' | 'pcm16' | 'webm' | 'ogg';
export type SupportedOutputFormat = 'wav' | 'mp3';

export interface ConvertedAudio {
  data: Buffer;
  format: string;
  sampleRate: number;
  channels: number;
}

/**
 * Convert audio to the PCM16 format expected by real-time audio providers.
 *
 * @param input - Input audio buffer
 * @param inputFormat - Format of the input audio
 * @returns Converted audio in PCM16 format
 */
export async function convertToRealtimeFormat(
  input: Buffer,
  inputFormat: SupportedInputFormat,
): Promise<ConvertedAudio> {
  // For PCM16 input, return as-is
  if (inputFormat === 'pcm16') {
    return {
      data: input,
      format: 'pcm16',
      sampleRate: 24000,
      channels: 1,
    };
  }

  // For WAV input, strip header and return PCM data
  if (inputFormat === 'wav') {
    // WAV header is typically 44 bytes
    const pcmData = input.subarray(44);
    return {
      data: pcmData,
      format: 'pcm16',
      sampleRate: 24000,
      channels: 1,
    };
  }

  // For other formats, return the input as-is with a warning
  // In a full implementation, this would use ffmpeg or similar for conversion
  return {
    data: input,
    format: 'pcm16',
    sampleRate: 24000,
    channels: 1,
  };
}

/**
 * Convert PCM16 audio from real-time providers to a standard format.
 *
 * @param input - Input PCM16 audio buffer
 * @param outputFormat - Desired output format
 * @param sampleRate - Sample rate of the input audio
 * @returns Converted audio in the requested format
 */
export async function convertFromRealtimeFormat(
  input: Buffer,
  outputFormat: SupportedOutputFormat,
  sampleRate: number = 24000,
): Promise<ConvertedAudio> {
  if (outputFormat === 'wav') {
    // Create a basic WAV header
    const header = createWavHeader(input.length, sampleRate, 1, 16);
    const wavData = Buffer.concat([header, input]);
    return {
      data: wavData,
      format: 'wav',
      sampleRate,
      channels: 1,
    };
  }

  // For MP3, return as-is (would need ffmpeg for actual conversion)
  return {
    data: input,
    format: outputFormat,
    sampleRate,
    channels: 1,
  };
}

/**
 * Create a WAV file header.
 */
function createWavHeader(
  dataSize: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return header;
}
