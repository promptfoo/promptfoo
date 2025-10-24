import fs from 'fs';
import path from 'path';
import type { AudioData } from '../types';
import type { OutputFormat } from './types';
import logger from '../../../logger';

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
  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  // Generate filename if not provided
  const finalFilename = filename || `audio-${Date.now()}.${audioData.format}`;
  const fullPath = path.join(outputPath, finalFilename);

  // Decode base64 and write to file
  const buffer = Buffer.from(audioData.data, 'base64');
  fs.writeFileSync(fullPath, buffer);

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
  let bitrate = 128000; // Default 128 kbps

  // Parse bitrate from format string
  const match = format.match(/(\d+)$/);
  if (match) {
    bitrate = parseInt(match[1]) * 1000;
  }

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
