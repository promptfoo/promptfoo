/**
 * ElevenLabs Provider Integration
 *
 * Provides access to ElevenLabs AI audio capabilities:
 * - Text-to-Speech (TTS): Generate high-quality voice synthesis
 * - Speech-to-Text (STT): Transcribe audio with speaker diarization
 * - Conversational Agents: Test voice AI agents with LLM backends
 * - Supporting APIs: Audio processing and conversation management
 */

export { ElevenLabsTTSProvider } from './tts';
export { ElevenLabsSTTProvider } from './stt';
export { ElevenLabsAgentsProvider } from './agents';
export { ElevenLabsHistoryProvider } from './history';
export { ElevenLabsIsolationProvider } from './isolation';
export { ElevenLabsAlignmentProvider } from './alignment';
export { ElevenLabsClient } from './client';
export { ElevenLabsWebSocketClient } from './websocket-client';
export { ElevenLabsCache } from './cache';
export { CostTracker } from './cost-tracker';
export { ElevenLabsAPIError, ElevenLabsRateLimitError, ElevenLabsAuthError } from './errors';
export {
  POPULAR_VOICES,
  getAvailableVoices,
  getVoice,
  resolveVoiceId,
  getRecommendedSettings,
  getPopularVoicesByCategory,
} from './tts/voices';
export {
  createPronunciationDictionary,
  applyPronunciationDictionary,
  applyPronunciationDictionaries,
  getPronunciationDictionary,
  listPronunciationDictionaries,
  deletePronunciationDictionary,
  createTechPronunciationDictionary,
  COMMON_TECH_PRONUNCIATIONS,
} from './tts/pronunciation';
export {
  designVoice,
  remixVoice,
  cloneVoice,
  deleteVoice,
  getVoiceGenerationStatus,
  designVoiceFromTemplate,
  VOICE_DESIGN_TEMPLATES,
} from './tts/voice-design';
export type {
  ElevenLabsBaseConfig,
  AudioData,
  UsageMetrics,
  CostMetrics,
  ElevenLabsProviderOptions,
} from './types';
export type {
  ElevenLabsTTSConfig,
  TTSModel,
  OutputFormat,
  VoiceSettings,
  TTSResponse,
  TTSStreamConfig,
  StreamingChunk,
  PronunciationRule,
  VoiceDesignConfig,
  VoiceRemixConfig,
} from './tts/types';
export type {
  ElevenLabsSTTConfig,
  STTModel,
  AudioFormat,
  STTResponse,
  DiarizationSegment,
  WERResult,
  AudioFileMetadata,
} from './stt/types';
export type { VoiceInfo } from './tts/voices';
export type { WebSocketClientConfig, StreamingMessage } from './websocket-client';
export type { PronunciationDictionary } from './tts/pronunciation';
export type { GeneratedVoice } from './tts/voice-design';
export type {
  ElevenLabsAgentsConfig,
  AgentConfig,
  AgentTool,
  SimulatedUser,
  EvaluationCriterion,
  ToolMockConfig,
  AgentSimulationResponse,
  ConversationTurn,
  ToolCall,
  ConversationAnalysis,
  EvaluationResult,
} from './agents/types';
export {
  COMMON_EVALUATION_CRITERIA,
  buildCriteriaFromPresets,
} from './agents/evaluation';
export { COMMON_AGENT_TOOLS } from './agents/tools';
export type {
  ConversationHistoryConfig,
  ConversationHistoryResponse,
} from './history/types';
export type { AudioIsolationConfig } from './isolation/types';
export type {
  ForcedAlignmentConfig,
  AlignmentResponse,
  WordAlignment,
  CharacterAlignment,
} from './alignment/types';
