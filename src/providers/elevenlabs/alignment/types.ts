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
  text: string; // The word text (API uses 'text', not 'word')
  start: number; // Start time in seconds
  end: number; // End time in seconds
  loss?: number; // Alignment loss/confidence metric
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
