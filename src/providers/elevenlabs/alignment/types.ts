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
  character: string; // Single character
  start: number; // Start time in seconds
  end: number; // End time in seconds
}

/**
 * Response from forced alignment API
 */
export interface AlignmentResponse {
  word_alignments: WordAlignment[];
  character_alignments?: CharacterAlignment[];
  duration_seconds: number;
  transcript: string;
}
