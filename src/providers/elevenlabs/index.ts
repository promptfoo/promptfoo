/**
 * ElevenLabs Provider Integration
 *
 * Provides access to ElevenLabs AI audio capabilities:
 * - Text-to-Speech (TTS): Generate high-quality voice synthesis
 * - Speech-to-Text (STT): Transcribe audio with speaker diarization
 * - Conversational Agents: Test voice AI agents with LLM backends
 * - Supporting APIs: Audio processing and conversation management
 */

export { ElevenLabsAgentsProvider } from './agents';
export { ElevenLabsAlignmentProvider } from './alignment';
export { ElevenLabsCache } from './cache';
export { ElevenLabsClient } from './client';
export { CostTracker } from './cost-tracker';
export { ElevenLabsAPIError, ElevenLabsAuthError, ElevenLabsRateLimitError } from './errors';
export { ElevenLabsHistoryProvider } from './history';
export { ElevenLabsIsolationProvider } from './isolation';
export { ElevenLabsSTTProvider } from './stt';
export { ElevenLabsTTSProvider } from './tts';
export { applyPronunciationDictionary, createPronunciationDictionary } from './tts/pronunciation';
export { designVoice, remixVoice } from './tts/voice-design';
export { ElevenLabsWebSocketClient } from './websocket-client';

export type {
  AgentConfig,
  AgentSimulationResponse,
  AgentTool,
  ConversationAnalysis,
  ConversationTurn,
  ElevenLabsAgentsConfig,
  EvaluationCriterion,
  EvaluationResult,
  SimulatedUser,
  ToolCall,
  ToolMockConfig,
} from './agents/types';
export type {
  AlignmentResponse,
  CharacterAlignment,
  ForcedAlignmentConfig,
  WordAlignment,
} from './alignment/types';
export type {
  ConversationHistoryConfig,
  ConversationHistoryResponse,
} from './history/types';
export type { AudioIsolationConfig } from './isolation/types';
export type {
  AudioFormat,
  DiarizationSegment,
  ElevenLabsSTTConfig,
  STTModel,
  STTResponse,
  WERResult,
} from './stt/types';
export type { PronunciationDictionary } from './tts/pronunciation';
export type {
  ElevenLabsTTSConfig,
  OutputFormat,
  PronunciationRule,
  StreamingChunk,
  TTSModel,
  TTSResponse,
  TTSStreamConfig,
  VoiceDesignConfig,
  VoiceRemixConfig,
  VoiceSettings,
} from './tts/types';
export type { GeneratedVoice } from './tts/voice-design';
export type { AudioData, ElevenLabsBaseConfig } from './types';
export type { StreamingMessage, WebSocketClientConfig } from './websocket-client';
