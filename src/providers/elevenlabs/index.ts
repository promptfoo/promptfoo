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
export {
  buildCriteriaFromPresets,
  COMMON_EVALUATION_CRITERIA,
} from './agents/evaluation';
export { COMMON_AGENT_TOOLS } from './agents/tools';
export { ElevenLabsAlignmentProvider } from './alignment';
export { ElevenLabsCache } from './cache';
export { ElevenLabsClient } from './client';
export { CostTracker } from './cost-tracker';
export { ElevenLabsAPIError, ElevenLabsAuthError, ElevenLabsRateLimitError } from './errors';
export { ElevenLabsHistoryProvider } from './history';
export { ElevenLabsIsolationProvider } from './isolation';
export { ElevenLabsSTTProvider } from './stt';
export { ElevenLabsTTSProvider } from './tts';
export {
  applyPronunciationDictionaries,
  applyPronunciationDictionary,
  COMMON_TECH_PRONUNCIATIONS,
  createPronunciationDictionary,
  createTechPronunciationDictionary,
  deletePronunciationDictionary,
  getPronunciationDictionary,
  listPronunciationDictionaries,
} from './tts/pronunciation';
export {
  cloneVoice,
  deleteVoice,
  designVoice,
  designVoiceFromTemplate,
  getVoiceGenerationStatus,
  remixVoice,
  VOICE_DESIGN_TEMPLATES,
} from './tts/voice-design';
export {
  getAvailableVoices,
  getPopularVoicesByCategory,
  getRecommendedSettings,
  getVoice,
  POPULAR_VOICES,
  resolveVoiceId,
} from './tts/voices';
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
  AudioFileMetadata,
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
export type { VoiceInfo } from './tts/voices';
export type {
  AudioData,
  CostMetrics,
  ElevenLabsBaseConfig,
  ElevenLabsProviderOptions,
  UsageMetrics,
} from './types';
export type { StreamingMessage, WebSocketClientConfig } from './websocket-client';
