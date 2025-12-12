import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';

export type AudioFormat = 'pcm16' | 'wav' | 'mp3' | 'g711_ulaw' | 'g711_alaw';

export interface AudioInput {
  data: string; // Base64 encoded audio data
  format: AudioFormat;
  sampleRate?: number;
  channels?: number;
  transcript?: string;
}

export interface AudioOutput {
  data: string; // Base64 encoded audio data
  format: AudioFormat;
  sampleRate?: number;
  channels?: number;
  duration?: number;
  transcript?: string;
}

export interface AudioProviderConfig {
  voice?: string;
  instructions?: string;
  inputAudioFormat?: AudioFormat;
  outputAudioFormat?: AudioFormat;
  transcribeInput?: boolean;
  transcribeOutput?: boolean;
  temperature?: number;
  maxResponseTokens?: number | 'inf';
  websocketTimeout?: number;
}

export interface AudioProviderResponse extends ProviderResponse {
  audio?: AudioOutput;
  inputTranscript?: string;
}

export interface AudioRealtimeProvider {
  readonly supportsAudioInput: boolean;
  readonly supportsAudioOutput: boolean;
  readonly audioFormats: AudioFormat[];
  readonly defaultSampleRate: number;

  id(): string;
  callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<AudioProviderResponse>;
  callAudioApi?(
    audioInput: AudioInput,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<AudioProviderResponse>;
  callTextToAudioApi?(
    textPrompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<AudioProviderResponse>;
  getAudioConfig?(): AudioProviderConfig;
}
