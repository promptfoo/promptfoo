/**
 * ElevenLabs Dubbing Types
 */

import type { ElevenLabsBaseConfig } from '../types';

/**
 * Configuration for dubbing provider
 */
export interface DubbingConfig extends ElevenLabsBaseConfig {
  sourceLanguage?: string; // Source language code (auto-detected if not provided)
  targetLanguage: string; // Target language code (required)
  numSpeakers?: number; // Expected number of speakers for better separation
  watermark?: boolean; // Add watermark (default: false)
  useProfenitiesFilter?: boolean; // Filter profanities (default: true)
  label?: string; // Provider label
}

/**
 * Dubbing project status
 */
export type DubbingStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Response from dubbing creation
 */
export interface DubbingCreateResponse {
  dubbing_id: string;
  status: DubbingStatus;
  expected_duration_seconds?: number;
}

/**
 * Response from dubbing status check
 */
export interface DubbingStatusResponse {
  dubbing_id: string;
  status: DubbingStatus;
  progress?: number; // 0-100
  error_message?: string;
  metadata?: {
    source_language?: string;
    target_language: string;
    duration_seconds?: number;
    num_speakers?: number;
  };
}

/**
 * Dubbing project metadata
 */
export interface DubbingMetadata {
  dubbing_id: string;
  source_url?: string;
  source_file?: string;
  target_language: string;
  source_language?: string;
  created_at: string;
  completed_at?: string;
  duration_seconds?: number;
}
