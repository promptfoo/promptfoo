/**
 * Voice Conversation Types
 *
 * Core type definitions for the simulated voice user system.
 * These types are used across the orchestrator, connections, and provider.
 */

import type { TokenUsage } from '../../types';

// ─────────────────────────────────────────────────────────────
// AUDIO TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Supported audio formats for voice providers.
 */
export type AudioFormat = 'pcm16' | 'g711_ulaw' | 'g711_alaw';

/**
 * A single chunk of audio data.
 */
export interface AudioChunk {
  /** Base64 encoded audio data */
  data: string;
  /** Milliseconds since conversation start */
  timestamp: number;
  /** Duration of this chunk in milliseconds */
  duration?: number;
  /** Audio format */
  format: AudioFormat;
  /** Sample rate in Hz */
  sampleRate: number;
}

// ─────────────────────────────────────────────────────────────
// CONVERSATION TYPES
// ─────────────────────────────────────────────────────────────

/**
 * A single turn in the voice conversation (simplified for transcript).
 */
export interface VoiceTurn {
  /** Who spoke during this turn */
  speaker: 'user' | 'agent';
  /** Text content of the turn */
  text: string;
  /** Timestamp when this turn occurred */
  timestamp?: number;
}

/**
 * Current state of the conversation (state machine).
 */
export type ConversationState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'configuring'
  | 'active'
  | 'completed'
  | 'error';

/**
 * Reason the conversation ended.
 */
export type StopReason =
  | 'goal_achieved' // User said ###STOP###
  | 'max_turns' // Reached maximum turn limit
  | 'timeout' // Conversation timed out
  | 'error' // An error occurred
  | 'user_hangup'; // User naturally ended conversation

/**
 * Result of a completed voice conversation.
 */
export interface ConversationResult {
  /** Whether the conversation succeeded */
  success: boolean;
  /** Reason the conversation stopped */
  stopReason: StopReason;
  /** Full transcript formatted for output */
  transcript: string;
  /** All turns in the conversation */
  turns: VoiceTurn[];
  /** Number of turns */
  turnCount: number;
  /** Total duration in milliseconds */
  duration: number;
  /** Full audio from target agent (WAV format) */
  targetAudio?: Buffer;
  /** Full audio from simulated user (WAV format) */
  simulatedUserAudio?: Buffer;
  /** Aggregated token usage */
  tokenUsage?: TokenUsage;
  /** Additional metadata */
  metadata?: {
    targetProvider?: string;
    simulatedUserProvider?: string;
    maxTurns?: number;
    timeoutMs?: number;
  };
}

// ─────────────────────────────────────────────────────────────
// TURN DETECTION TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Turn detection mode.
 */
export type TurnDetectionMode = 'server_vad' | 'silence' | 'hybrid';

/**
 * Configuration for turn detection.
 */
export interface TurnDetectionConfig {
  /** Detection mode */
  mode: TurnDetectionMode;
  /** Silence duration before turn ends (ms) */
  silenceThresholdMs: number;
  /** VAD sensitivity threshold (0-1) */
  vadThreshold: number;
  /** Minimum turn duration to prevent micro-turns (ms) */
  minTurnDurationMs: number;
  /** Maximum turn duration before forced end (ms) */
  maxTurnDurationMs: number;
  /** Padding before speech starts (ms) */
  prefixPaddingMs: number;
}

/**
 * Default turn detection configuration.
 */
export const DEFAULT_TURN_DETECTION: TurnDetectionConfig = {
  mode: 'server_vad',
  silenceThresholdMs: 700,
  vadThreshold: 0.5,
  minTurnDurationMs: 500,
  maxTurnDurationMs: 30000,
  prefixPaddingMs: 300,
};

// ─────────────────────────────────────────────────────────────
// PROVIDER CONFIGURATION TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Supported voice provider types.
 */
export type VoiceProviderType = 'openai' | 'google';

/**
 * Configuration for a voice provider connection.
 */
export interface VoiceProviderConfig {
  /** Provider type */
  provider: VoiceProviderType | string;
  /** Model to use (e.g., 'gpt-4o-realtime-preview') */
  model?: string;
  /** Voice ID */
  voice?: string;
  /** API key (optional, uses env var if not set) */
  apiKey?: string;
  /** System instructions for the voice agent */
  instructions?: string;
  /** Turn detection configuration */
  turnDetection?: TurnDetectionConfig;
  /** Audio format */
  audioFormat?: AudioFormat;
  /** Sample rate in Hz */
  sampleRate?: number;
}

/**
 * Configuration for the voice conversation orchestrator.
 */
export interface OrchestratorConfig {
  /** Configuration for the target voice provider */
  targetConfig: VoiceProviderConfig;
  /** Configuration for the simulated user provider */
  simulatedUserConfig: VoiceProviderConfig;
  /** Turn detection configuration */
  turnDetection: TurnDetectionConfig;
  /** Maximum turns per speaker */
  maxTurns?: number;
  /** Overall timeout in milliseconds */
  timeoutMs?: number;
  /** Whether the target speaks first (default: true) */
  targetSpeaksFirst?: boolean;
  /** Allow interruptions (barge-in) */
  enableInterruptions?: boolean;
  /** Record full audio for playback */
  recordFullAudio?: boolean;
}

// ─────────────────────────────────────────────────────────────
// SIMULATED VOICE USER CONFIG
// ─────────────────────────────────────────────────────────────

/**
 * Available voices for OpenAI Realtime.
 */
export type OpenAIVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'sage'
  | 'shimmer'
  | 'verse';

/**
 * Configuration for the SimulatedVoiceUser provider.
 */
export interface SimulatedVoiceUserConfig {
  /** User persona and goals (supports Nunjucks templating) */
  instructions?: string;
  /** Maximum conversation turns per speaker */
  maxTurns?: number;
  /** Overall timeout in milliseconds */
  timeoutMs?: number;
  /** Audio sample rate */
  sampleRate?: number;
  /** Audio format */
  audioFormat?: AudioFormat;

  // Target provider config
  /** Provider for the target agent */
  targetProvider?: VoiceProviderType | string;
  /** Model for the target agent */
  targetModel?: string;
  /** API key for the target provider */
  targetApiKey?: string;
  /** Voice for the target agent */
  targetVoice?: string;

  // Simulated user provider config
  /** Provider for the simulated user */
  simulatedUserProvider?: VoiceProviderType | string;
  /** Model for the simulated user */
  simulatedUserModel?: string;
  /** API key for the simulated user provider */
  simulatedUserApiKey?: string;
  /** Voice for the simulated user */
  simulatedUserVoice?: string;

  // Turn detection config
  /** Turn detection mode */
  turnDetectionMode?: TurnDetectionMode;
  /** Silence threshold in ms */
  silenceThresholdMs?: number;
  /** VAD threshold (0-1) */
  vadThreshold?: number;
  /** Minimum turn duration in ms */
  minTurnDurationMs?: number;
  /** Maximum turn duration in ms */
  maxTurnDurationMs?: number;
  /** Prefix padding in ms */
  prefixPaddingMs?: number;

  /** Whether the target speaks first */
  targetSpeaksFirst?: boolean;
  /** Allow interruptions */
  enableInterruptions?: boolean;
  /** Record full conversation audio */
  recordConversation?: boolean;
}

/**
 * Default configuration for SimulatedVoiceUser.
 */
export const DEFAULT_SIMULATED_VOICE_USER_CONFIG: Required<
  Pick<SimulatedVoiceUserConfig, 'maxTurns' | 'timeoutMs' | 'sampleRate' | 'audioFormat'>
> = {
  maxTurns: 10,
  timeoutMs: 120000,
  sampleRate: 24000,
  audioFormat: 'pcm16',
};

// ─────────────────────────────────────────────────────────────
// WEBSOCKET MESSAGE TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Base WebSocket message structure.
 */
export interface RealtimeMessage {
  type?: string;
  event_id?: string;
  // OpenAI specific
  session?: Record<string, unknown>;
  delta?: string;
  audio?: string;
  transcript?: string;
  error?: Record<string, unknown>;
  // Google specific
  setupComplete?: boolean;
  serverContent?: Record<string, unknown>;
  toolCall?: Record<string, unknown>;
  realtimeInput?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown>>;
  streamingCustomOp?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * OpenAI session update message.
 */
export interface SessionUpdateMessage extends RealtimeMessage {
  type: 'session.update';
  session: {
    modalities: string[];
    instructions: string;
    voice: string;
    input_audio_format: AudioFormat;
    output_audio_format: AudioFormat;
    input_audio_transcription?: { model: string };
    turn_detection?: {
      type: 'server_vad';
      threshold?: number;
      prefix_padding_ms?: number;
      silence_duration_ms?: number;
    } | null;
  };
}

/**
 * Audio delta message (streaming audio chunk).
 */
export interface AudioDeltaMessage extends RealtimeMessage {
  type: 'response.audio.delta' | 'input_audio_buffer.append';
  delta?: string;
  audio?: string;
}

/**
 * Transcript delta message.
 */
export interface TranscriptDeltaMessage extends RealtimeMessage {
  type: 'response.audio_transcript.delta';
  delta: string;
}

/**
 * Transcript complete message.
 */
export interface TranscriptDoneMessage extends RealtimeMessage {
  type: 'response.audio_transcript.done';
  text: string;
}

/**
 * Error message from voice provider.
 */
export interface ErrorMessage extends RealtimeMessage {
  type: 'error';
  error: {
    type: string;
    code?: string;
    message: string;
  };
}

// ─────────────────────────────────────────────────────────────
// CONNECTION EVENTS
// ─────────────────────────────────────────────────────────────

/**
 * Events emitted by voice connections.
 */
export interface VoiceConnectionEvents {
  /** Connection is ready */
  ready: () => void;
  /** Session has been configured */
  session_configured: () => void;
  /** Received audio chunk */
  audio_delta: (chunk: AudioChunk) => void;
  /** Audio generation complete */
  audio_done: () => void;
  /** Received transcript chunk */
  transcript_delta: (delta: string) => void;
  /** Full transcript available */
  transcript_done: (text: string) => void;
  /** Transcript of input audio (what was heard) */
  input_transcript: (text: string) => void;
  /** VAD detected speech start */
  speech_started: () => void;
  /** VAD detected speech end */
  speech_stopped: () => void;
  /** Error occurred */
  error: (error: Error) => void;
  /** Connection closed */
  close: () => void;
}

// ─────────────────────────────────────────────────────────────
// UTILITY TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Audio sample rates commonly used.
 */
export const SAMPLE_RATES = {
  OPENAI_REALTIME: 24000,
  GOOGLE_LIVE: 24000,
  TELEPHONE: 8000,
  CD_QUALITY: 44100,
} as const;

/**
 * Bytes per sample for different formats.
 */
export const BYTES_PER_SAMPLE: Record<AudioFormat, number> = {
  pcm16: 2,
  g711_ulaw: 1,
  g711_alaw: 1,
};
