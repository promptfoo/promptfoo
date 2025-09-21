import type { MultiModalInput } from './types';

/**
 * Parse multi-modal input from prompt string
 * Supports formats like:
 * - "audio:https://example.com/file.wav Please transcribe this"
 * - "video:https://example.com/file.mp4 Describe what you see"
 */
export function parseMultiModalInput(prompt: string): MultiModalInput {
  const result: MultiModalInput = {};

  // Extract all modalities in one pass using replaceAll with a callback
  let cleanedText = prompt
    .replace(/audio:(https?:\/\/[^\s]+)/g, (match, url) => {
      result.audioUrl = url;
      return '';
    })
    .replace(/video:(https?:\/\/[^\s]+)/g, (match, url) => {
      result.videoUrl = url;
      return '';
    })
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim();

  result.text = cleanedText || prompt; // Fallback to original if nothing left
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