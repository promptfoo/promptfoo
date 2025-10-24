/**
 * ElevenLabs Provider Integration
 *
 * Provides access to ElevenLabs AI audio capabilities:
 * - Text-to-Speech (TTS): Generate high-quality voice synthesis
 * - Speech-to-Text (STT): Transcribe audio with speaker diarization (coming soon)
 * - Conversational Agents: Test voice AI agents with LLM backends (coming soon)
 */

export { ElevenLabsTTSProvider } from './tts';
export { ElevenLabsClient } from './client';
export { ElevenLabsWebSocketClient } from './websocket-client';
export { ElevenLabsCache } from './cache';
export { CostTracker } from './cost-tracker';
export { ElevenLabsAPIError, ElevenLabsRateLimitError, ElevenLabsAuthError } from './errors';
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
export type { WebSocketClientConfig, StreamingMessage } from './websocket-client';
