/**
 * Voice Provider Module
 *
 * Exports all voice-related functionality for simulated voice user testing.
 */

// Core types
export type {
  AudioChunk,
  AudioFormat,
  VoiceTurn,
  ConversationState,
  ConversationResult,
  StopReason,
  TurnDetectionConfig,
  TurnDetectionMode,
  VoiceProviderConfig,
  OrchestratorConfig,
  SimulatedVoiceUserConfig,
  RealtimeMessage,
} from './types';

// Audio utilities
export { AudioBuffer, base64ToBuffer, bufferToBase64, pcm16ToWav, calculateDuration } from './audioBuffer';

// Turn detection
export { TurnDetector, SilenceDetector } from './turnDetection';

// Transcript management
export { TranscriptAccumulator, STOP_MARKER, extractStopMarker, formatTranscript } from './transcriptAccumulator';

// Connections
export { BaseVoiceConnection, waitForEvent } from './connections/base';
export { OpenAIRealtimeConnection } from './connections/openaiRealtime';
export { GoogleLiveConnection } from './connections/googleLive';

// Orchestrator
export { VoiceConversationOrchestrator, runVoiceConversation } from './orchestrator';

// Provider
export { SimulatedVoiceUser } from './simulatedVoiceUser';
