export type ProviderName = 'openai-realtime' | 'dry-run';

export type AttackerKind = 'tts' | 'provider' | 'audio-to-audio';

export type EscalationLevel = 'gentle' | 'moderate' | 'aggressive' | 'forceful';

export interface AttackTurn {
  id: string;
  prompt: string;
  pluginId?: string;
  goal?: string;
  escalationLevel?: EscalationLevel;
  conversationId?: string;
}

export interface ConversationContext {
  testId: string;
  basePrompt: string;
  turnCount: number;
  pluginId?: string;
  goal?: string;
}

export interface AttackerPromptConfig {
  systemPrompt: string;
}

export interface TranscriptSegment {
  role: 'attacker' | 'target' | 'coaching';
  text: string;
  turn: number;
  timestampMs: number;
}

export interface ProviderEvent {
  type: 'info' | 'transcript' | 'audio' | 'error';
  message?: string;
  data?: unknown;
  turn?: number;
  timestampMs: number;
}

export interface RunConfig {
  runId: string;
  targetProvider: ProviderName;
  attackerProvider?: ProviderName;
  attackerKind: AttackerKind;
  speechProvider: 'local-liquid' | 'openai' | 'dry-run';
  targetPrompt?: string;
  attackerVoice?: string;
  targetVoice?: string;
  attackerPromptPath?: string;
  pluginExamplesPath?: string;
  pluginId?: string;
  turnCount?: number;
  outputRoot: string;
  dryRun?: boolean;
}

export interface TurnResult {
  turn: number;
  attackerText?: string;
  targetText?: string;
  attackerAudioPath?: string;
  targetAudioPath?: string;
  attackerRefused?: boolean;
  targetRefused?: boolean;
  targetTextOnly?: boolean;
}

export interface RunArtifacts {
  runDir: string;
  metadataPath: string;
  transcriptPath: string;
  providerEventsPath: string;
  summaryPath: string;
  conversationAttackerAudioPath?: string;
  conversationTargetAudioPath?: string;
  conversationInterleavedAudioPath?: string;
}

export interface RunSummary {
  runId: string;
  turnsCompleted: number;
  unsafeTurns: number;
}
