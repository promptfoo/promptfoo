import type { TokenUsage } from '../../contracts/shared';

export type AudioFormat = 'pcm16' | 'g711_ulaw' | 'g711_alaw';

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

export interface VoiceTurn {
  /** Who spoke during this turn */
  speaker: 'user' | 'agent';
  /** Text content of the turn */
  text: string;
  /** Timestamp when this turn occurred */
  timestamp?: number;
}

export type ConversationState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'configuring'
  | 'active'
  | 'completed'
  | 'error';

export type StopReason =
  | 'goal_achieved' // User said ###STOP###
  | 'max_turns' // Reached maximum turn limit
  | 'timeout' // Conversation timed out
  | 'error' // An error occurred
  | 'user_hangup'; // User naturally ended conversation

export interface ConversationResult {
  /** Whether the conversation succeeded */
  success: boolean;
  /** Reason the conversation stopped */
  stopReason: StopReason;
  error?: string;
  /** Full transcript formatted for output */
  transcript: string;
  /** All turns in the conversation */
  turns: VoiceTurn[];
  /** Number of turns */
  turnCount: number;
  /** Total duration in milliseconds */
  duration: number;
  /** Full audio from target agent (WAV format, mono) */
  targetAudio?: Buffer;
  /** Full audio from simulated user (WAV format, mono) */
  simulatedUserAudio?: Buffer;
  /** Combined stereo audio (WAV format, left=agent, right=user) */
  combinedAudio?: Buffer;
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

export type TurnDetectionMode = 'server_vad' | 'silence' | 'hybrid';

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

export const DEFAULT_TURN_DETECTION: TurnDetectionConfig = {
  mode: 'server_vad',
  silenceThresholdMs: 700,
  vadThreshold: 0.5,
  minTurnDurationMs: 500,
  maxTurnDurationMs: 30000,
  prefixPaddingMs: 300,
};

export type VoiceProviderType = 'openai';

export interface VoiceProviderConfig {
  /** Provider type */
  provider: VoiceProviderType;
  /** Model to use (e.g., 'gpt-realtime') */
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

export interface OrchestratorConfig {
  /** Configuration for the target voice provider */
  targetConfig: VoiceProviderConfig;
  /** Configuration for the simulated user provider */
  simulatedUserConfig: VoiceProviderConfig;
  /** Turn detection configuration */
  turnDetection: TurnDetectionConfig;
  /** Maximum completed speaker utterances */
  maxTurns?: number;
  /** Overall timeout in milliseconds */
  timeoutMs?: number;
  /** Whether the target speaks first (default: true) */
  targetSpeaksFirst?: boolean;
  /** Record full audio for playback */
  recordFullAudio?: boolean;
}

export interface SimulatedVoiceUserConfig {
  /** User persona and goals (supports Nunjucks templating) */
  instructions?: string;
  /** Maximum completed speaker utterances */
  maxTurns?: number;
  /** Overall timeout in milliseconds */
  timeoutMs?: number;
  /** Audio sample rate */
  sampleRate?: number;
  /** Audio format */
  audioFormat?: AudioFormat;

  // Target provider config
  /** Provider for the target agent */
  targetProvider?: VoiceProviderType;
  /** Model for the target agent */
  targetModel?: string;
  /** API key for the target provider */
  targetApiKey?: string;
  /** Voice for the target agent */
  targetVoice?: string;

  // Simulated user provider config
  /** Provider for the simulated user */
  simulatedUserProvider?: VoiceProviderType;
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
  /** Record full conversation audio */
  recordConversation?: boolean;
}

export interface RealtimeMessage {
  type?: string;
  event_id?: string;
  // OpenAI specific
  session?: Record<string, unknown>;
  delta?: string;
  audio?: string;
  transcript?: string;
  error?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VoiceConnectionEvents {
  usage: (usage: TokenUsage) => void;
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

export const SAMPLE_RATES = {
  OPENAI_REALTIME: 24000,
  TELEPHONE: 8000,
  CD_QUALITY: 44100,
} as const;

export const BYTES_PER_SAMPLE: Record<AudioFormat, number> = {
  pcm16: 2,
  g711_ulaw: 1,
  g711_alaw: 1,
};
