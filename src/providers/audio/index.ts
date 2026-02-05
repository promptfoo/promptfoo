/**
 * Unified Audio Provider Module
 *
 * This module provides a unified interface for working with real-time audio providers
 * in the audio-to-audio red team evaluation pipeline.
 */

import logger from '../../logger';
import {
  convertFromRealtimeFormat,
  convertToRealtimeFormat,
  type SupportedInputFormat,
} from '../../redteam/audio/format';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
} from '../../types/providers';
import type {
  AudioFormat,
  AudioInput,
  AudioProviderConfig,
  AudioProviderResponse,
  AudioRealtimeProvider,
} from './types';

export * from './types';

/**
 * Wrapper class that adapts existing providers to the AudioRealtimeProvider interface.
 *
 * This allows using providers like OpenAI Realtime, Google Live, and Bedrock Nova Sonic
 * through a common interface for audio-to-audio red team testing.
 */
export class UnifiedAudioProvider implements AudioRealtimeProvider {
  readonly supportsAudioInput: boolean = true;
  readonly supportsAudioOutput: boolean = true;
  readonly audioFormats: AudioFormat[] = ['pcm16', 'wav'];
  readonly defaultSampleRate: number = 24000;

  private readonly baseProvider: ApiProvider;
  private readonly providerType: 'openai' | 'google' | 'bedrock' | 'unknown';
  private readonly audioProviderConfig: AudioProviderConfig;

  constructor(baseProvider: ApiProvider, config?: Partial<AudioProviderConfig>) {
    this.baseProvider = baseProvider;
    this.audioProviderConfig = {
      voice: config?.voice || 'alloy',
      instructions: config?.instructions,
      inputAudioFormat: config?.inputAudioFormat || 'pcm16',
      outputAudioFormat: config?.outputAudioFormat || 'pcm16',
      transcribeInput: config?.transcribeInput ?? true,
      transcribeOutput: config?.transcribeOutput ?? true,
      temperature: config?.temperature ?? 0.8,
      maxResponseTokens: config?.maxResponseTokens || 'inf',
      websocketTimeout: config?.websocketTimeout || 30000,
      ...config,
    };

    // Detect provider type
    const providerId = baseProvider.id().toLowerCase();
    if (providerId.includes('openai') && providerId.includes('realtime')) {
      this.providerType = 'openai';
      this.audioFormats = ['pcm16', 'g711_ulaw', 'g711_alaw'];
    } else if (providerId.includes('google') && providerId.includes('live')) {
      this.providerType = 'google';
      this.audioFormats = ['pcm16'];
    } else if (providerId.includes('bedrock') && providerId.includes('nova')) {
      this.providerType = 'bedrock';
      this.audioFormats = ['pcm16'];
      this.defaultSampleRate = 16000;
    } else {
      this.providerType = 'unknown';
      logger.warn(`Unknown audio provider type: ${providerId}. Using default settings.`);
    }
  }

  id(): string {
    return `audio:${this.baseProvider.id()}`;
  }

  /**
   * Call the API with text input (standard provider interface)
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<AudioProviderResponse> {
    // For text input, delegate to the base provider
    const response = await this.baseProvider.callApi(prompt, context, options);

    // Normalize the response to include audio field if present
    return this.normalizeResponse(response);
  }

  /**
   * Call the audio API with audio input
   */
  async callAudioApi(
    audioInput: AudioInput,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<AudioProviderResponse> {
    // Convert audio to the format expected by the provider
    const convertedAudio = await this.prepareAudioInput(audioInput);

    // Build the prompt with audio data
    const audioPrompt = this.buildAudioPrompt(convertedAudio, audioInput.transcript);

    // Call the base provider
    const response = await this.baseProvider.callApi(audioPrompt, context, options);

    // Normalize and return the response
    return this.normalizeResponse(response);
  }

  /**
   * Call the audio API with text input (converted to audio)
   */
  async callTextToAudioApi(
    textPrompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<AudioProviderResponse> {
    // For providers that support text input directly (like OpenAI Realtime),
    // we can just call the base provider
    const response = await this.baseProvider.callApi(textPrompt, context, options);
    return this.normalizeResponse(response);
  }

  /**
   * Get the provider's audio configuration
   */
  getAudioConfig(): AudioProviderConfig {
    return { ...this.audioProviderConfig };
  }

  /**
   * Prepare audio input for the provider
   */
  private async prepareAudioInput(audioInput: AudioInput): Promise<{
    data: string;
    format: AudioFormat;
  }> {
    const targetFormat = this.audioProviderConfig.inputAudioFormat || 'pcm16';

    // Helper to ensure data is a base64 string
    const toBase64String = (data: Buffer | string): string =>
      typeof data === 'string' ? data : data.toString('base64');

    // If already in the correct format, return as-is
    if (audioInput.format === targetFormat) {
      return {
        data: toBase64String(audioInput.data),
        format: targetFormat,
      };
    }

    // Convert to the target format
    try {
      const inputBuffer =
        typeof audioInput.data === 'string'
          ? Buffer.from(audioInput.data, 'base64')
          : audioInput.data;

      // Validate that the input format is supported for conversion
      const supportedFormats: SupportedInputFormat[] = [
        'pcm16',
        'wav',
        'mp3',
        'ogg',
        'flac',
        'webm',
      ];
      if (!supportedFormats.includes(audioInput.format as SupportedInputFormat)) {
        throw new Error(`Unsupported input format for conversion: ${audioInput.format}`);
      }

      const converted = convertToRealtimeFormat(
        inputBuffer,
        audioInput.format as SupportedInputFormat,
      );

      return {
        data: converted.toString('base64'),
        format: 'pcm16',
      };
    } catch (error) {
      logger.error(`Failed to convert audio format: ${error}`);
      // Return original audio if conversion fails
      return {
        data: toBase64String(audioInput.data),
        format: audioInput.format,
      };
    }
  }

  /**
   * Build the prompt with audio data for the provider
   */
  private buildAudioPrompt(
    audio: { data: string; format: AudioFormat },
    transcript?: string,
  ): string {
    // Different providers expect audio data in different formats
    switch (this.providerType) {
      case 'openai':
        // OpenAI Realtime handles audio via WebSocket events
        // For now, we pass the audio data in a JSON structure that the provider can parse
        return JSON.stringify({
          type: 'audio_input',
          audio: {
            data: audio.data,
            format: audio.format,
          },
          transcript,
        });

      case 'google':
        // Google Live expects audio in a specific format
        return JSON.stringify({
          audio_data: audio.data,
          transcript,
        });

      case 'bedrock':
        // Bedrock Nova Sonic expects audio differently
        return JSON.stringify({
          inputAudio: {
            audioData: audio.data,
            contentType: `audio/${audio.format}`,
          },
          inputText: transcript,
        });

      default:
        // Generic format
        return JSON.stringify({
          audio: audio.data,
          format: audio.format,
          transcript,
        });
    }
  }

  /**
   * Normalize the provider response to a standard format
   */
  private normalizeResponse(response: any): AudioProviderResponse {
    const normalized: AudioProviderResponse = {
      output: response.output,
      error: response.error,
      cached: response.cached,
      cost: response.cost,
      latencyMs: response.latencyMs,
      tokenUsage: response.tokenUsage,
      metadata: response.metadata,
    };

    // Extract audio from various possible locations
    const audioData = response.audio || response.metadata?.audio;

    if (audioData) {
      normalized.audio = {
        data: audioData.data,
        format: audioData.format || 'wav',
        transcript: audioData.transcript || response.output,
        sampleRate: audioData.sampleRate || this.defaultSampleRate,
        channels: audioData.channels || 1,
      };
    }

    // Extract input transcript if available
    if (response.metadata?.inputTranscript) {
      normalized.inputTranscript = response.metadata.inputTranscript;
    }

    return normalized;
  }

  /**
   * Convert provider response audio to a specific format
   */
  async convertResponseAudio(
    response: AudioProviderResponse,
    targetFormat: 'wav' | 'mp3' = 'wav',
  ): Promise<AudioProviderResponse> {
    if (!response.audio?.data) {
      return response;
    }

    // If already in target format, return as-is
    if (response.audio.format === targetFormat) {
      return response;
    }

    try {
      const inputBuffer = Buffer.from(response.audio.data, 'base64');
      const converted = convertFromRealtimeFormat(
        inputBuffer,
        targetFormat,
        response.audio.sampleRate || this.defaultSampleRate,
      );

      return {
        ...response,
        audio: {
          ...response.audio,
          data: converted.toString('base64'),
          format: targetFormat as AudioFormat,
        },
      };
    } catch (error) {
      logger.error(`Failed to convert response audio: ${error}`);
      return response;
    }
  }
}

/**
 * Create a unified audio provider from an existing provider
 *
 * @param provider - Base API provider (OpenAI Realtime, Google Live, etc.)
 * @param config - Optional audio configuration
 * @returns Unified audio provider instance
 */
export function createUnifiedAudioProvider(
  provider: ApiProvider,
  config?: Partial<AudioProviderConfig>,
): UnifiedAudioProvider {
  return new UnifiedAudioProvider(provider, config);
}

/**
 * Check if a provider supports audio input/output
 *
 * @param provider - Provider to check
 * @returns True if the provider supports audio
 */
export function isAudioCapableProvider(provider: ApiProvider): boolean {
  const providerId = provider.id().toLowerCase();
  return (
    (providerId.includes('realtime') && providerId.includes('openai')) ||
    (providerId.includes('live') && providerId.includes('google')) ||
    (providerId.includes('nova') && providerId.includes('sonic')) ||
    providerId.includes('audio')
  );
}

/**
 * Get audio-related metadata from a provider response
 */
export function extractAudioMetadata(response: AudioProviderResponse): {
  hasAudio: boolean;
  audioFormat?: string;
  audioDuration?: number;
  hasTranscript: boolean;
  transcript?: string;
} {
  const hasAudio = !!response.audio?.data;
  const hasTranscript = !!(response.audio?.transcript || response.output);

  return {
    hasAudio,
    audioFormat: response.audio?.format,
    audioDuration: response.audio?.duration,
    hasTranscript,
    transcript:
      response.audio?.transcript ||
      (typeof response.output === 'string' ? response.output : undefined),
  };
}
