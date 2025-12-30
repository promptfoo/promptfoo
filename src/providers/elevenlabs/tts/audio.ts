import { promises as fs } from 'fs';
import path from 'path';

import logger from '../../../logger';

import type { AudioData } from '../types';
import type { OutputFormat } from './types';

/**
 * Encode audio buffer to base64 and wrap in AudioData structure
 */
export async function encodeAudio(buffer: Buffer, format: OutputFormat): Promise<AudioData> {
  const base64 = buffer.toString('base64');

  // Map format to file extension
  const extension = getFileExtension(format);

  // Estimate duration (rough approximation based on bitrate)
  const durationMs = estimateDuration(buffer.length, format);

  return {
    data: base64,
    format: extension,
    sizeBytes: buffer.length,
    durationMs,
  };
}

/**
 * Save audio data to file
 */
export async function saveAudioFile(
  audioData: AudioData,
  outputPath: string,
  filename?: string,
): Promise<string> {
  await fs.mkdir(outputPath, { recursive: true });

  const rawFilename = filename || `audio-${Date.now()}.${audioData.format}`;
  const sanitized = path.basename(rawFilename).replace(/[\\/]/g, '').replace(/\0/g, '').trim();

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error('Invalid filename for audio output');
  }

  const expectedExtension = `.${audioData.format}`;
  const existingExtension = path.extname(sanitized);
  const baseName = existingExtension ? sanitized.slice(0, -existingExtension.length) : sanitized;
  if (!baseName) {
    throw new Error('Invalid filename for audio output');
  }
  const finalFilename =
    existingExtension.toLowerCase() === expectedExtension.toLowerCase()
      ? sanitized
      : `${baseName}${expectedExtension}`;

  const fullPath = path.join(outputPath, finalFilename);
  const buffer = Buffer.from(audioData.data, 'base64');
  await fs.writeFile(fullPath, buffer);

  logger.debug('[ElevenLabs Audio] Saved audio file', {
    path: fullPath,
    size: audioData.sizeBytes,
    format: audioData.format,
  });

  return fullPath;
}

/**
 * Get file extension from output format
 */
function getFileExtension(format: OutputFormat): string {
  if (format.startsWith('mp3_')) {
    return 'mp3';
  } else if (format.startsWith('pcm_')) {
    return 'pcm';
  } else if (format.startsWith('ulaw_')) {
    return 'wav';
  }
  return 'mp3'; // Default
}

/**
 * Estimate audio duration based on file size and format
 * This is a rough approximation
 */
function estimateDuration(sizeBytes: number, format: OutputFormat): number {
  // For PCM formats, use sample rate to calculate duration
  if (format.startsWith('pcm_')) {
    const sampleRateMatch = format.match(/pcm_(\d+)/);
    if (sampleRateMatch) {
      const sampleRate = parseInt(sampleRateMatch[1]);
      // PCM is 16-bit (2 bytes per sample), mono
      const samplesPerSecond = sampleRate;
      const bytesPerSecond = samplesPerSecond * 2;
      return (sizeBytes / bytesPerSecond) * 1000; // Convert to milliseconds
    }
  }

  // For ulaw format, use sample rate (1 byte per sample)
  if (format.startsWith('ulaw_')) {
    const sampleRateMatch = format.match(/ulaw_(\d+)/);
    if (sampleRateMatch) {
      const sampleRate = parseInt(sampleRateMatch[1]);
      // ulaw is 8-bit (1 byte per sample), mono
      const bytesPerSecond = sampleRate;
      return (sizeBytes / bytesPerSecond) * 1000; // Convert to milliseconds
    }
  }

  let bitrate = 128000; // Default 128 kbps

  // Parse bitrate from format string (e.g., mp3_44100_128)
  const match = format.match(/(\d+)$/);
  if (match) {
    bitrate = parseInt(match[1]) * 1000;
  }

  // For MP3, use bitrate
  const bytesPerSecond = bitrate / 8;
  return (sizeBytes / bytesPerSecond) * 1000; // Convert to milliseconds
}

/**
 * Resolve voice ID from name (for future voice library support)
 * Currently just returns the input as-is
 */
export function resolveVoiceId(voiceIdOrName: string): string {
  // TODO: Implement voice library lookup
  // For now, assume input is already a voice ID
  return voiceIdOrName;
}
