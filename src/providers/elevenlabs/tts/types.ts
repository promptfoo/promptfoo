import type { AudioData, ElevenLabsBaseConfig } from '../types';

/**
 * ElevenLabs TTS-specific configuration
 */
export interface ElevenLabsTTSConfig extends ElevenLabsBaseConfig {
  voiceId: string;
  modelId: TTSModel;
  outputFormat?: OutputFormat;
  voiceSettings?: VoiceSettings;
  optimizeStreamingLatency?: 0 | 1 | 2 | 3 | 4;
  seed?: number;
  saveAudio?: boolean;
  audioOutputPath?: string;
  label?: string;

  // Future: Streaming support
  streaming?: boolean;

  // Future: Pronunciation dictionaries
  pronunciationDictionaryId?: string;
  pronunciationRules?: PronunciationRule[];

  // Future: Voice design & remixing
  voiceDesign?: VoiceDesignConfig;
  voiceRemix?: VoiceRemixConfig;
}

/**
 * Available TTS models
 */
export type TTSModel =
  | 'eleven_flash_v2_5'
  | 'eleven_turbo_v2_5'
  | 'eleven_turbo_v2'
  | 'eleven_multilingual_v2'
  | 'eleven_monolingual_v1';

/**
 * Available output formats
 */
export type OutputFormat =
  | 'mp3_22050_32'
  | 'mp3_44100_128'
  | 'mp3_44100_192'
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'ulaw_8000';

/**
 * Voice settings for fine-tuning output
 */
export interface VoiceSettings {
  stability?: number; // 0-1, more variable to more stable
  similarity_boost?: number; // 0-1, low to high
  style?: number; // 0-1 (only for v2 models)
  use_speaker_boost?: boolean;
  speed?: number; // 0.25-4.0
}

/**
 * Response from TTS API
 */
export interface TTSResponse {
  audio: AudioData;
  voiceId: string;
  modelId: string;
  alignments?: any[]; // Word-level alignment data (for streaming)
}

/**
 * Pronunciation rule for custom dictionaries
 */
export interface PronunciationRule {
  word: string;
  phoneme?: string;
  alphabet?: 'ipa' | 'cmu';
  pronunciation?: string;
}

/**
 * Voice design configuration
 */
export interface VoiceDesignConfig {
  description: string;
  gender?: 'male' | 'female';
  age?: 'young' | 'middle_aged' | 'old';
  accent?: string;
  accent_strength?: number; // 0-2
}

/**
 * Voice remix configuration
 */
export interface VoiceRemixConfig {
  gender?: 'male' | 'female';
  age?: 'young' | 'middle_aged' | 'old';
  accent?: string;
  style?: string;
  pacing?: 'slow' | 'normal' | 'fast';
  prompt_strength?: 'low' | 'medium' | 'high' | 'max';
}

/**
 * Streaming configuration for TTS
 */
export interface TTSStreamConfig {
  modelId: string;
  voiceSettings?: VoiceSettings;
  baseUrl?: string;
  keepAliveInterval?: number;
  chunkLengthSchedule?: number[]; // Chunk sizes for streaming (default: [120, 160, 250, 290])
  pronunciationDictionaryLocators?: Array<{
    pronunciation_dictionary_id: string;
    version_id?: string;
  }>;
}

/**
 * Single audio chunk from streaming
 */
export interface StreamingChunk {
  audio: string; // Base64 encoded audio
  chunkIndex: number;
  timestamp: number;
  alignment?: any; // Word-level alignment data
}
