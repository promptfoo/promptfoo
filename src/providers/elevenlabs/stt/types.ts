import type { ElevenLabsBaseConfig } from '../types';

/**
 * ElevenLabs STT-specific configuration
 */
export interface ElevenLabsSTTConfig extends ElevenLabsBaseConfig {
  modelId?: STTModel;
  language?: string; // ISO 639-1 language code
  diarization?: boolean; // Enable speaker diarization
  maxSpeakers?: number; // Maximum number of speakers (for diarization)
  audioFile?: string; // Path to audio file
  audioFormat?: AudioFormat;
  label?: string;
  apiKey?: string; // API key for authentication
  apiKeyEnvar?: string; // Environment variable name for API key

  // Accuracy testing
  referenceText?: string; // Expected transcription for WER calculation
  calculateWER?: boolean; // Calculate Word Error Rate
}

/**
 * Available STT models
 */
export type STTModel = 'scribe_v1';

/**
 * Supported audio formats
 */
export type AudioFormat =
  | 'mp3'
  | 'mp4'
  | 'mpeg'
  | 'mpga'
  | 'm4a'
  | 'wav'
  | 'webm'
  | 'flac'
  | 'ogg'
  | 'opus';

/**
 * STT API response
 */
export interface STTResponse {
  text: string;
  confidence?: number;
  diarization?: DiarizationSegment[];
  language?: string;
  duration_ms?: number;
}

/**
 * Speaker diarization segment
 */
export interface DiarizationSegment {
  speaker_id: string;
  text: string;
  start_time_ms: number;
  end_time_ms: number;
  confidence?: number;
}

/**
 * Word Error Rate calculation result
 */
export interface WERResult {
  wer: number; // Word Error Rate (0-1, lower is better)
  substitutions: number;
  deletions: number;
  insertions: number;
  correct: number;
  totalWords: number;
  details?: {
    reference: string;
    hypothesis: string;
    alignment?: string;
  };
}

/**
 * Audio file metadata
 */
export interface AudioFileMetadata {
  format: AudioFormat;
  duration_ms?: number;
  sample_rate?: number;
  channels?: number;
  size_bytes: number;
}
