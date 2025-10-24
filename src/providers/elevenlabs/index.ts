/**
 * ElevenLabs Provider Integration
 *
 * Provides access to ElevenLabs AI audio capabilities:
 * - Text-to-Speech (TTS): Generate high-quality voice synthesis
 * - Speech-to-Text (STT): Transcribe audio with speaker diarization
 * - Conversational Agents: Test voice AI agents with LLM backends (coming soon)
 */

export { ElevenLabsTTSProvider } from './tts';
export { ElevenLabsSTTProvider } from './stt';
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
