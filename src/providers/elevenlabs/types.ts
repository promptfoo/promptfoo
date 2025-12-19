import type { EnvOverrides } from '../../types/env';

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

/**
 * Usage metrics tracked across providers
 */
export interface UsageMetrics {
  characters?: number; // For TTS
  seconds?: number; // For STT
  minutes?: number; // For Agents
  llmTokens?: {
    total: number;
    prompt: number;
    completion: number;
  };
}

/**
 * Cost breakdown by capability
 */
export interface CostMetrics {
  estimatedCost: number;
  currency: 'USD';
  breakdown: {
    tts?: number;
    stt?: number;
    agent?: number;
    llm?: number;
  };
}

/**
 * Options that can be passed when constructing a provider
 */
export interface ElevenLabsProviderOptions {
  config?: ElevenLabsBaseConfig;
  id?: string;
  label?: string;
  env?: EnvOverrides;
}
