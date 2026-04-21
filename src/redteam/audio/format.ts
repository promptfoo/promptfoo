/**
 * Audio format conversion utilities for the red team audio evaluation pipeline.
 */

/**
 * Supported input formats for audio conversion.
 */
export type SupportedInputFormat = 'pcm16' | 'wav' | 'mp3' | 'ogg' | 'flac' | 'webm';

/**
 * Realtime audio format configuration.
 */
export interface RealtimeFormat {
  format: 'pcm16';
  sampleRate: number;
  channels: number;
}

/**
 * Convert audio data to the realtime format expected by providers.
 *
 * @param data - Raw audio data as a Buffer or base64-encoded string
 * @param inputFormat - The format of the input audio
 * @param targetSampleRate - Target sample rate (default: 24000)
 * @returns Converted audio data in PCM16 format
 */
export function convertToRealtimeFormat(
  data: Buffer | string,
  inputFormat: SupportedInputFormat,
  _targetSampleRate: number = 24000,
): Buffer {
  // Convert base64 string to Buffer if needed
  const buffer = typeof data === 'string' ? Buffer.from(data, 'base64') : data;

  // PCM16 is the target format, so pass through directly
  if (inputFormat === 'pcm16') {
    return buffer;
  }

  // TODO: Implement actual format conversion using ffmpeg or similar
  // For now, throw an error for unsupported formats to fail fast
  throw new Error(
    `Audio format conversion from '${inputFormat}' to PCM16 is not yet implemented. ` +
      `Please provide audio in PCM16 format, or implement conversion using ffmpeg.`,
  );
}

/**
 * Convert audio data from realtime format back to a specified output format.
 *
 * @param data - PCM16 audio data
 * @param outputFormat - Desired output format
 * @param sampleRate - Sample rate of the PCM data
 * @returns Converted audio data in the specified format
 */
export function convertFromRealtimeFormat(
  data: Buffer,
  outputFormat: SupportedInputFormat,
  _sampleRate: number = 24000,
): Buffer {
  // PCM16 is the source format, so pass through directly
  if (outputFormat === 'pcm16') {
    return data;
  }

  // TODO: Implement actual format conversion using ffmpeg or similar
  // For now, throw an error for unsupported formats to fail fast
  throw new Error(
    `Audio format conversion from PCM16 to '${outputFormat}' is not yet implemented. ` +
      `Please use PCM16 output format, or implement conversion using ffmpeg.`,
  );
}
