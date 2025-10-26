/**
 * ElevenLabs Forced Alignment Types
 */

import type { ElevenLabsBaseConfig } from '../types';

/**
 * Configuration for forced alignment provider
 */
export interface ForcedAlignmentConfig extends ElevenLabsBaseConfig {
  label?: string; // Provider label
}

/**
 * Alignment data for a single word
 */
export interface WordAlignment {
  word: string; // The word text
  start: number; // Start time in seconds
  end: number; // End time in seconds
  confidence?: number; // Confidence score (0-1)
}

/**
 * Alignment data for a character
 */
export interface CharacterAlignment {
  text: string; // Single character (API uses 'text', not 'character')
  start: number; // Start time in seconds
  end: number; // End time in seconds
}

/**
 * Response from forced alignment API
 */
export interface AlignmentResponse {
  words: WordAlignment[]; // API uses 'words', not 'word_alignments'
  characters?: CharacterAlignment[]; // API uses 'characters', not 'character_alignments'
  duration_seconds?: number; // Optional in API response
  transcript?: string; // Optional in API response
}
