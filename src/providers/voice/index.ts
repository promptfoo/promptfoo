/**
 * Voice Provider Module
 *
 * Exports all voice-related functionality for simulated voice user testing.
 */

// Audio utilities
export {
  AudioBuffer,
  base64ToBuffer,
  bufferToBase64,
  calculateDuration,
  pcm16ToWav,
} from './audioBuffer';
// Connections
export { BaseVoiceConnection, waitForEvent } from './connections/base';
export { GoogleLiveConnection } from './connections/googleLive';
export { NovaSonicConnection } from './connections/novaSonic';
export { OpenAIRealtimeConnection } from './connections/openaiRealtime';
// Orchestrator
export { runVoiceConversation, VoiceConversationOrchestrator } from './orchestrator';
// Provider
export { SimulatedVoiceUser } from './simulatedVoiceUser';
// Transcript management
export {
  extractStopMarker,
  formatTranscript,
  STOP_MARKER,
  TranscriptAccumulator,
} from './transcriptAccumulator';
// Turn detection
export { SilenceDetector, TurnDetector } from './turnDetection';

// Core types
export type {
  AudioChunk,
  AudioFormat,
  ConversationResult,
  ConversationState,
  OrchestratorConfig,
  RealtimeMessage,
  SimulatedVoiceUserConfig,
  StopReason,
  TurnDetectionConfig,
  TurnDetectionMode,
  VoiceProviderConfig,
  VoiceTurn,
} from './types';
