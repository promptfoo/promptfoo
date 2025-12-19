/**
 * ElevenLabs Audio Isolation Provider
 *
 * Extracts clean speech from audio with background noise
 */

import { promises as fs } from 'fs';
import path from 'path';

import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { ElevenLabsClient } from '../client';
import { CostTracker } from '../cost-tracker';
import { encodeAudio } from '../tts/audio';

import type {
  ApiProvider,
  CallApiContextParams,
  EnvOverrides,
  ProviderResponse,
} from '../../../types';
import type { AudioIsolationConfig } from './types';

/**
 * Provider for audio isolation (noise removal)
 *
 * Usage:
 * - Remove background noise from audio
 * - Extract clean speech for further processing
 * - Improve audio quality for STT
 */
export class ElevenLabsIsolationProvider implements ApiProvider {
  private client: ElevenLabsClient;
  private costTracker: CostTracker;
  private env?: EnvOverrides;
  config: AudioIsolationConfig;

  constructor(
    modelName: string,
    options: {
      config?: Partial<AudioIsolationConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    this.env = options.env;
    this.config = this.parseConfig(modelName, options);

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'ELEVENLABS_API_KEY environment variable is not set. Please set it to use ElevenLabs Audio Isolation.',
      );
    }

    this.client = new ElevenLabsClient({
      apiKey,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout || 120000, // 2 minutes for audio processing
    });

    this.costTracker = new CostTracker();
  }

  id(): string {
    return this.config.label || 'elevenlabs:isolation';
  }

  toString(): string {
    return '[ElevenLabs Audio Isolation Provider]';
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const startTime = Date.now();

    // Parse audio file path from prompt or context
    const audioFileVar = context?.vars?.audioFile;
    const audioFile = typeof audioFileVar === 'string' ? audioFileVar : prompt.trim();

    if (!audioFile || audioFile.length === 0) {
      return {
        error: 'Audio file path is required. Provide it via prompt or context.vars.audioFile',
      };
    }

    logger.debug('[ElevenLabs Isolation] Isolating audio', {
      audioFile,
    });

    try {
      // Read audio file
      const audioBuffer = await fs.readFile(audioFile);
      const filename = path.basename(audioFile) || 'audio.mp3';

      logger.debug('[ElevenLabs Isolation] Uploading audio for isolation', {
        filename,
        sizeBytes: audioBuffer.length,
      });

      // Upload and process
      const response = await this.client.upload<ArrayBuffer>(
        '/audio-isolation',
        audioBuffer,
        filename,
        {},
        'audio', // Audio Isolation API expects 'audio' field
      );

      const latency = Date.now() - startTime;

      // Encode isolated audio
      const isolatedBuffer = Buffer.from(response);
      const isolatedAudio = await encodeAudio(
        isolatedBuffer,
        this.config.outputFormat || 'mp3_44100_128',
      );

      logger.debug('[ElevenLabs Isolation] Audio isolated successfully', {
        originalSize: audioBuffer.length,
        isolatedSize: isolatedAudio.sizeBytes,
        latency,
      });

      // Track cost (roughly based on audio duration)
      // Estimate duration from file size (rough approximation)
      const estimatedDurationSeconds = audioBuffer.length / 32000; // ~32KB per second for typical MP3
      const cost = this.costTracker.trackSTT(estimatedDurationSeconds, {
        operation: 'audio_isolation',
      });

      return {
        output: `Audio isolated successfully from ${filename}`,
        audio: isolatedAudio,
        metadata: {
          sourceFile: audioFile,
          originalSizeBytes: audioBuffer.length,
          isolatedSizeBytes: isolatedAudio.sizeBytes,
          format: isolatedAudio.format,
          latency,
        },
        cost,
      };
    } catch (error) {
      logger.error('[ElevenLabs Isolation] Failed to isolate audio', {
        audioFile,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        error: `Failed to isolate audio: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get API key from config or environment
   */
  private getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config.apiKeyEnvar && this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]) ||
      (this.config.apiKeyEnvar && getEnvString(this.config.apiKeyEnvar as any)) ||
      this.env?.ELEVENLABS_API_KEY ||
      getEnvString('ELEVENLABS_API_KEY')
    );
  }

  /**
   * Parse configuration from constructor options
   */
  private parseConfig(
    _modelName: string,
    options: {
      config?: Partial<AudioIsolationConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    },
  ): AudioIsolationConfig {
    const { config } = options;

    return {
      apiKey: config?.apiKey,
      apiKeyEnvar: config?.apiKeyEnvar || 'ELEVENLABS_API_KEY',
      baseUrl: config?.baseUrl,
      timeout: config?.timeout || 120000,
      outputFormat: config?.outputFormat,
      label: options.label || config?.label || options.id,
    };
  }
}
