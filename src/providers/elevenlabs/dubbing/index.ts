/**
 * ElevenLabs Dubbing Provider
 *
 * Multi-language dubbing with speaker separation
 */

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
  EnvOverrides,
} from '../../../types';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { promises as fs } from 'fs';
import { ElevenLabsClient } from '../client';
import { encodeAudio } from '../tts/audio';
import type { DubbingConfig, DubbingCreateResponse, DubbingStatusResponse } from './types';

/**
 * Provider for multi-language dubbing
 *
 * Usage:
 * - Dub videos/audio to different languages
 * - Preserve speaker voices and timing
 * - Support for multiple speakers
 * - Automatic source language detection
 */
export class ElevenLabsDubbingProvider implements ApiProvider {
  private client: ElevenLabsClient;
  private env?: EnvOverrides;
  config: DubbingConfig;

  constructor(
    modelName: string,
    options: {
      config?: Partial<DubbingConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    this.env = options.env;
    this.config = this.parseConfig(modelName, options);

    if (!this.config.targetLanguage) {
      throw new Error('Target language is required for dubbing');
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'ELEVENLABS_API_KEY environment variable is not set. Please set it to use ElevenLabs Dubbing.',
      );
    }

    this.client = new ElevenLabsClient({
      apiKey,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout || 300000, // 5 minutes for dubbing
    });
  }

  id(): string {
    return this.config.label || `elevenlabs:dubbing:${this.config.targetLanguage}`;
  }

  toString(): string {
    return `[ElevenLabs Dubbing Provider: ${this.config.targetLanguage}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const startTime = Date.now();

    // Parse audio/video file or URL from prompt or context
    const sourceFileVar = context?.vars?.sourceFile;
    const sourceFile = typeof sourceFileVar === 'string' ? sourceFileVar : prompt.trim();
    const sourceUrlVar = context?.vars?.sourceUrl;
    const sourceUrl = typeof sourceUrlVar === 'string' ? sourceUrlVar : undefined;

    if (!sourceFile && !sourceUrl) {
      return {
        error:
          'Source file or URL is required. Provide via prompt, context.vars.sourceFile, or context.vars.sourceUrl',
      };
    }

    logger.debug('[ElevenLabs Dubbing] Creating dubbing project', {
      sourceFile,
      sourceUrl,
      targetLanguage: this.config.targetLanguage,
    });

    try {
      // Create dubbing project
      const dubbingId = sourceFile
        ? await this.createDubbingFromFile(sourceFile)
        : await this.createDubbingFromUrl(sourceUrl!);

      // Poll for completion
      const result = await this.waitForCompletion(dubbingId);

      if (result.status === 'failed') {
        return {
          error: `Dubbing failed: ${result.error_message || 'Unknown error'}`,
          metadata: {
            dubbingId,
            status: result.status,
          },
        };
      }

      // Download dubbed audio
      const dubbedAudio = await this.downloadDubbedAudio(dubbingId);

      const latency = Date.now() - startTime;

      logger.debug('[ElevenLabs Dubbing] Dubbing completed successfully', {
        dubbingId,
        targetLanguage: this.config.targetLanguage,
        latency,
      });

      return {
        output: `Dubbed to ${this.config.targetLanguage} successfully`,
        audio: dubbedAudio,
        metadata: {
          dubbingId,
          sourceFile,
          sourceUrl,
          targetLanguage: this.config.targetLanguage,
          sourceLanguage: result.metadata?.source_language,
          durationSeconds: result.metadata?.duration_seconds,
          numSpeakers: result.metadata?.num_speakers,
          audioSizeBytes: dubbedAudio.sizeBytes,
          latency,
        },
      };
    } catch (error) {
      logger.error('[ElevenLabs Dubbing] Failed to dub audio', {
        sourceFile,
        sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        error: `Failed to dub audio: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Create dubbing project from file
   */
  private async createDubbingFromFile(sourceFile: string): Promise<string> {
    const audioBuffer = await fs.readFile(sourceFile);
    const filename = sourceFile.split('/').pop() || 'video.mp4';

    logger.debug('[ElevenLabs Dubbing] Uploading file for dubbing', {
      filename,
      sizeBytes: audioBuffer.length,
    });

    const response = await this.client.upload<DubbingCreateResponse>(
      '/dubbing',
      audioBuffer,
      filename,
      {
        target_lang: this.config.targetLanguage,
        source_lang: this.config.sourceLanguage,
        num_speakers: this.config.numSpeakers,
        watermark: this.config.watermark || false,
        use_profanity_filter: this.config.useProfenitiesFilter !== false,
      },
    );

    return response.dubbing_id;
  }

  /**
   * Create dubbing project from URL
   */
  private async createDubbingFromUrl(sourceUrl: string): Promise<string> {
    logger.debug('[ElevenLabs Dubbing] Creating dubbing from URL', {
      sourceUrl,
    });

    const response = await this.client.post<DubbingCreateResponse>('/dubbing', {
      source_url: sourceUrl,
      target_lang: this.config.targetLanguage,
      source_lang: this.config.sourceLanguage,
      num_speakers: this.config.numSpeakers,
      watermark: this.config.watermark || false,
      use_profanity_filter: this.config.useProfenitiesFilter !== false,
    });

    return response.dubbing_id;
  }

  /**
   * Wait for dubbing to complete
   */
  private async waitForCompletion(dubbingId: string): Promise<DubbingStatusResponse> {
    const maxAttempts = 60; // 5 minutes max (5s * 60)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.client.get<DubbingStatusResponse>(`/dubbing/${dubbingId}`);

      logger.debug('[ElevenLabs Dubbing] Dubbing status', {
        dubbingId,
        status: status.status,
        progress: status.progress,
      });

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      // Wait 5 seconds before next check
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error(`Dubbing timed out after ${maxAttempts * 5} seconds`);
  }

  /**
   * Download dubbed audio
   */
  private async downloadDubbedAudio(dubbingId: string) {
    logger.debug('[ElevenLabs Dubbing] Downloading dubbed audio', {
      dubbingId,
    });

    const response = await this.client.get<ArrayBuffer>(
      `/dubbing/${dubbingId}/audio/${this.config.targetLanguage}`,
    );

    // Encode audio
    const audioBuffer = Buffer.from(response);
    return encodeAudio(audioBuffer, 'mp3_44100_128');
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
      config?: Partial<DubbingConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    },
  ): DubbingConfig {
    const { config } = options;

    return {
      apiKey: config?.apiKey,
      apiKeyEnvar: config?.apiKeyEnvar || 'ELEVENLABS_API_KEY',
      baseUrl: config?.baseUrl,
      timeout: config?.timeout || 300000,
      targetLanguage: config?.targetLanguage || '',
      sourceLanguage: config?.sourceLanguage,
      numSpeakers: config?.numSpeakers,
      watermark: config?.watermark,
      useProfenitiesFilter: config?.useProfenitiesFilter,
      label: options.label || config?.label || options.id,
    };
  }
}
