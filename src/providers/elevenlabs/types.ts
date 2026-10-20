/**
 * Base configuration shared across all ElevenLabs providers
 */
export interface ElevenLabsBaseConfig {
  apiKey?: string;
  apiKeyEnvar?: string;
  baseUrl?: string;
  timeout?: number;
  cache?: boolean;
  cacheTTL?: number;
  enableLogging?: boolean;
  retries?: number;
}

/**
 * Audio data format returned by TTS and other audio providers
 */
export interface AudioData {
  data: string; // Base64 encoded audio
  format: string; // 'mp3', 'pcm', 'wav', etc.
  durationMs?: number;
  sizeBytes?: number;
}
