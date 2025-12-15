/**
 * Audio provider type definitions for audio-to-audio red team evaluation.
 */

import type { ApiProvider, ProviderResponse } from '../../types/providers';

/**
 * Supported audio formats for input/output.
 */
export type AudioFormat = 'pcm16' | 'wav' | 'mp3' | 'ogg' | 'flac' | 'g711_ulaw' | 'g711_alaw';

/**
 * Audio input configuration.
 */
export interface AudioInput {
  /** Raw audio data as a Buffer or base64-encoded string */
  data: Buffer | string;
  /** Audio format */
  format: AudioFormat;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Transcript of the audio content */
  transcript?: string;
}

/**
 * Configuration for audio providers.
 */
export interface AudioProviderConfig {
  /** Voice to use for audio generation */
  voice?: string;
  /** System instructions for the provider */
  instructions?: string;
  /** Input audio format */
  inputAudioFormat?: AudioFormat;
  /** Output audio format */
  outputAudioFormat?: AudioFormat;
  /** Output audio format (alias for outputAudioFormat) */
  outputFormat?: AudioFormat;
  /** Output sample rate in Hz */
  outputSampleRate?: number;
  /** Whether to transcribe input audio */
  transcribeInput?: boolean;
  /** Whether to transcribe output audio */
  transcribeOutput?: boolean;
  /** Temperature for generation */
  temperature?: number;
  /** Maximum response tokens */
  maxResponseTokens?: number | 'inf';
  /** WebSocket timeout in milliseconds */
  websocketTimeout?: number;
}

/**
 * Response from an audio provider.
 */
export interface AudioProviderResponse extends ProviderResponse {
  /** Transcript of input audio */
  inputTranscript?: string;
}

/**
 * Audio output data structure.
 */
export interface AudioOutput {
  data: Buffer | string;
  format: AudioFormat;
  sampleRate?: number;
  /** Transcript of the audio */
  transcript?: string;
  /** Duration of the audio in seconds */
  duration?: number;
}

/**
 * Interface for providers that support real-time audio input/output.
 */
export interface AudioRealtimeProvider extends ApiProvider {
  /** Whether this provider supports audio input */
  readonly supportsAudioInput: boolean;
  /** Whether this provider supports audio output */
  readonly supportsAudioOutput: boolean;
  /** Supported audio formats */
  audioFormats: AudioFormat[];
  /** Default sample rate for audio */
  defaultSampleRate: number;
}
