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
 * A single turn in the voice conversation.
 */
export interface VoiceTurn {
  /** Who spoke during this turn */
  speaker: 'user' | 'agent';
  /** Audio chunks that make up this turn */
  audioChunks: AudioChunk[];
  /** Transcript of what was said */
  transcript: string;
  /** Start time in ms since conversation start */
  startTime: number;
  /** End time in ms since conversation start */
  endTime: number;
  /** Whether this turn was interrupted by the other party */
  interrupted: boolean;
  /** Token usage for this turn (if available) */
  tokenUsage?: TokenUsage;
}

/**
 * Current state of the conversation.
 */
export interface ConversationState {
  /** All completed turns */
  turns: VoiceTurn[];
  /** Who is currently speaking */
  currentSpeaker: 'user' | 'agent' | null;
  /** Is the user currently generating audio */
  isUserSpeaking: boolean;
  /** Is the agent currently generating audio */
  isAgentSpeaking: boolean;
  /** Accumulated transcript for current user turn */
  userTranscriptBuffer: string;
  /** Accumulated transcript for current agent turn */
  agentTranscriptBuffer: string;
  /** Number of completed turns */
  turnCount: number;
  /** Conversation start time (epoch ms) */
  startTime: number;
}

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
  /** All turns in the conversation */
  turns: VoiceTurn[];
  /** Full transcript formatted for output */
  fullTranscript: string;
  /** Full audio recording (if enabled) */
  audioRecording?: Buffer;
  /** Aggregated token usage */
  tokenUsage: TokenUsage;
  /** Total duration in milliseconds */
  duration: number;
  /** Why the conversation ended */
  stopReason: StopReason;
  /** Additional metadata */
  metadata: {
    userProvider: string;
    targetProvider: string;
    turnCount: number;
  };
}

// ─────────────────────────────────────────────────────────────
// TURN DETECTION TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Configuration for turn detection.
 */
export interface TurnDetectionConfig {
  /** Detection mode */
  mode: 'server_vad' | 'silence' | 'hybrid';
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
  provider: VoiceProviderType;
  /** Model to use (e.g., 'gpt-4o-realtime-preview') */
  model?: string;
  /** Voice ID */
  voice: string;
  /** API key (optional, uses env var if not set) */
  apiKey?: string;
  /** System instructions for the voice agent */
  instructions: string;
  /** Turn detection configuration */
  turnDetection: TurnDetectionConfig;
  /** Audio format */
  audioFormat: AudioFormat;
  /** Sample rate in Hz */
  sampleRate: number;
}

/**
 * Configuration for the voice conversation orchestrator.
 */
export interface OrchestratorConfig {
  /** Configuration for the simulated user provider */
  userConfig: VoiceProviderConfig;
  /** The target provider being tested */
  targetProvider: unknown; // ApiProvider - avoid circular import
  /** System prompt for the target agent */
  targetSystemPrompt: string;
  /** Maximum turns per speaker */
  maxTurns: number;
  /** Overall timeout in milliseconds */
  timeoutMs: number;
  /** Allow interruptions (barge-in) */
  enableInterruptions: boolean;
  /** Record full audio for playback */
  recordFullAudio: boolean;
  /** Transcribe audio in real-time */
  transcribeInRealtime: boolean;
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
  /** Voice ID for the simulated user */
  voice?: string;
  /** Provider for user voice generation */
  voiceProvider?: VoiceProviderType;
  /** Model to use for user voice */
  model?: string;
  /** Turn detection configuration */
  turnDetection?: Partial<TurnDetectionConfig>;
  /** Allow interruptions */
  enableInterruptions?: boolean;
  /** Record full conversation audio */
  recordConversation?: boolean;
}

/**
 * Default configuration for SimulatedVoiceUser.
 */
export const DEFAULT_SIMULATED_VOICE_USER_CONFIG: Required<SimulatedVoiceUserConfig> = {
  instructions: '{{instructions}}',
  maxTurns: 10,
  timeoutMs: 120000,
  voice: 'coral',
  voiceProvider: 'openai',
  model: 'gpt-4o-realtime-preview',
  turnDetection: DEFAULT_TURN_DETECTION,
  enableInterruptions: false,
  recordConversation: false,
};

// ─────────────────────────────────────────────────────────────
// WEBSOCKET MESSAGE TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Base WebSocket message structure.
 */
export interface RealtimeMessage {
  type: string;
  event_id?: string;
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
