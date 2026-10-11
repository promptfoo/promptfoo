import type { OpenAiLiveOptions } from '../openai/liveTypes';
import type { OpenAiTtsOptions } from '../openai/tts';

/** Each participant has independent OpenAI credentials, endpoint, voice, and backend settings. */
export type VoiceParticipantOptions = OpenAiLiveOptions & { model?: string };

export interface SimulatedVoiceUserConfig {
  /** Caller persona and goal. Defaults to {{instructions}} and supports test variables. */
  instructions?: string;
  /** Target instructions; defaults to the evaluated prompt. */
  targetInstructions?: string;
  target?: VoiceParticipantOptions;
  caller?: VoiceParticipantOptions;
  /** Shared audio capture window, excluding startup and finalization (default 60000). */
  durationMs?: number;
  /** Hard deadline including configuration, startup and finalization (default 120000). */
  timeoutMs?: number;
  /** Maximum queued audio per participant (default 3000, maximum 10000). */
  maxBufferedAudioMs?: number;
  recordConversation?: boolean;
  targetSpeaksFirst?: boolean;
  /** Speech rendering options; uses the caller's connection and credentials. */
  interventionTts?: Pick<OpenAiTtsOptions, 'model' | 'voice' | 'instructions' | 'speed'>;
  /** Exact text is rendered before capture; instruction-only entries are advisory steering. */
  callerInterventions?: VoiceInterventionConfig[];
}

export interface VoiceInterventionConfig {
  atMs: number;
  /** Exact caller utterance, prepared before capture and played at the scheduled offset. */
  text?: string;
  /** Additional caller context, or model-timed steering when text is omitted. */
  instructions?: string;
}

export type VoiceSpeaker = 'target' | 'caller';

export interface VoiceTranscriptFragment {
  speaker: VoiceSpeaker;
  /** output: what this participant said; input: its recognition of the other participant. */
  source: 'output' | 'input';
  delta: string;
  startMs: number;
  endMs: number;
  receivedAtMs: number;
}

export interface VoiceIntervention {
  scheduledAtMs: number;
  sentAtMs: number;
  instructions?: string;
  text?: string;
  eventId: string;
  mode?: 'instructions' | 'audio';
  clipDurationMs?: number;
  clipSha256?: string;
  trimmedLeadingSilenceMs?: number;
  firstFrameAtMs?: number;
  firstFrameSentAtMs?: number;
  completedAtMs?: number;
  callerResumedAtMs?: number;
  contextEventIds?: string[];
  deliveredAudioBytes?: number;
  discardedCallerAudioBytes?: number;
}
