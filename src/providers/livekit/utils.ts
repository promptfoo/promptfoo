import type { MultiModalInput } from './types';

/**
 * Parse multi-modal input from prompt string
 * Supports formats like:
 * - "audio:https://example.com/file.wav Please transcribe this"
 * - "video:https://example.com/file.mp4 Describe what you see"
 */
export function parseMultiModalInput(prompt: string): MultiModalInput {
  const result: MultiModalInput = { text: prompt };

  // Extract audio URLs
  const audioMatch = prompt.match(/audio:(https?:\/\/[^\s]+)/);
  if (audioMatch) {
    result.audioUrl = audioMatch[1];
    result.text = prompt.replace(audioMatch[0], '').trim();
  }

  // Extract video URLs
  const videoMatch = prompt.match(/video:(https?:\/\/[^\s]+)/);
  if (videoMatch) {
    result.videoUrl = videoMatch[1];
    result.text = prompt.replace(videoMatch[0], '').trim();
  }

  return result;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a timeout promise that rejects after the specified time
 */
export function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
  });
}