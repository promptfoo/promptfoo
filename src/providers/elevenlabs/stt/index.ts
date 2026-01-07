/**
 * ElevenLabs Speech-to-Text (STT) Provider
 *
 * Transcribes audio files with support for:
 * - Multiple audio formats (MP3, WAV, FLAC, etc.)
 * - Speaker diarization (multi-speaker identification)
 * - Word Error Rate (WER) calculation for accuracy testing
 * - Language detection and specification
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { getCache, isCacheEnabled } from '../../../cache';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { ElevenLabsClient } from '../client';
import { CostTracker } from '../cost-tracker';
import { calculateWER } from './wer';

import type { EnvOverrides } from '../../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../../../types/providers';
import type { ElevenLabsSTTConfig, STTResponse, WERResult } from './types';

interface STTCallContext {
  originalProvider?: string;
  vars?: Record<string, any>;
}

/**
 * ElevenLabs STT Provider Implementation
 */
export class ElevenLabsSTTProvider implements ApiProvider {
  private client: ElevenLabsClient;
  private costTracker: CostTracker;
  private env?: EnvOverrides;
  config: ElevenLabsSTTConfig;

  constructor(
    private modelName: string,
    private options: ProviderOptions = {},
  ) {
    const config = options.config as ElevenLabsSTTConfig;
    this.env = options.env;

    this.config = {
      modelId: config?.modelId || 'scribe_v1',
      language: config?.language,
      diarization: config?.diarization || false,
      maxSpeakers: config?.maxSpeakers,
      audioFile: config?.audioFile,
      audioFormat: config?.audioFormat,
      referenceText: config?.referenceText,
      calculateWER: config?.calculateWER || false,
      baseUrl: config?.baseUrl || 'https://api.elevenlabs.io/v1',
      timeout: config?.timeout || 120000,
      retries: config?.retries || 3,
      label: options.label || config?.label,
      apiKey: config?.apiKey,
      apiKeyEnvar: config?.apiKeyEnvar,
    };

    const apiKey = this.getApiKey();
    this.client = new ElevenLabsClient({
      apiKey,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      retries: this.config.retries,
    });

    this.costTracker = new CostTracker();
  }

  id(): string {
    return this.config.label || `elevenlabs:stt:${this.config.modelId}`;
  }

  toString(): string {
    const parts = [`[ElevenLabs STT Provider] ${this.config.modelId}`];
    if (this.config.diarization) {
      parts.push('(diarization enabled)');
    }
    return parts.join(' ');
  }

  /**
   * Get API key from config or environment
   * Priority: config.apiKey > apiKeyEnvar in env > apiKeyEnvar in process.env > ELEVENLABS_API_KEY in env > ELEVENLABS_API_KEY in process.env
   */
  private getApiKey(): string {
    const apiKey =
      this.config.apiKey ||
      (this.config.apiKeyEnvar && this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]) ||
      (this.config.apiKeyEnvar && getEnvString(this.config.apiKeyEnvar as any)) ||
      this.env?.ELEVENLABS_API_KEY ||
      getEnvString('ELEVENLABS_API_KEY') ||
      '';

    if (!apiKey) {
      throw new Error(
        'ElevenLabs API key not found. Set ELEVENLABS_API_KEY environment variable or provide apiKey in config.',
      );
    }

    return apiKey;
  }

  /**
   * Main API call method
   */
  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const startTime = Date.now();

    try {
      // Determine audio file path
      const audioFilePath = this.resolveAudioFilePath(prompt, context);

      if (!audioFilePath) {
        throw new Error(
          'No audio file specified. Provide audioFile in config or pass file path as prompt.',
        );
      }

      // Check cache first
      if (isCacheEnabled()) {
        const cached = await this.getCachedResponse(audioFilePath);
        if (cached) {
          logger.debug('[ElevenLabs STT] Cache hit', { audioFilePath });
          return cached;
        }
      }

      // Read audio file
      const audioBuffer = await this.readAudioFile(audioFilePath);
      const audioMetadata = this.getAudioMetadata(audioFilePath, audioBuffer);

      logger.debug('[ElevenLabs STT] Transcribing audio', {
        audioFilePath,
        format: audioMetadata.format,
        size: audioMetadata.size_bytes,
        diarization: this.config.diarization,
      });

      // Call STT API
      const sttResponse = await this.transcribeAudio(
        audioBuffer,
        path.basename(audioFilePath),
        audioMetadata.format,
      );

      // Calculate WER if reference text provided
      let werResult: WERResult | undefined;
      if (this.config.calculateWER && this.config.referenceText) {
        werResult = calculateWER(this.config.referenceText, sttResponse.text);
        logger.debug('[ElevenLabs STT] WER calculated', {
          wer: werResult.wer,
          correct: werResult.correct,
          total: werResult.totalWords,
        });
      }

      // Estimate cost (based on audio duration)
      const durationSeconds = (sttResponse.duration_ms || 0) / 1000;
      const cost = this.costTracker.trackSTT(durationSeconds, {
        diarization: this.config.diarization,
      });

      const response: ProviderResponse = {
        output: sttResponse.text,
        metadata: {
          transcription: sttResponse,
          audio: audioMetadata,
          wer: werResult,
          latency: Date.now() - startTime,
          model: this.config.modelId,
        },
        cost,
        cached: false,
      };

      // Cache the response
      if (isCacheEnabled()) {
        await this.cacheResponse(audioFilePath, response);
      }

      return response;
    } catch (error) {
      logger.error('[ElevenLabs STT] Transcription failed', {
        error: error instanceof Error ? error.message : String(error),
        audioFile: this.config.audioFile,
      });

      return {
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          latency: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Resolve audio file path from prompt or config
   */
  private resolveAudioFilePath(prompt: string, context?: CallApiContextParams): string | undefined {
    // Priority: prompt (if it's a file path) > config.audioFile > vars.audioFile
    if (
      prompt &&
      (prompt.endsWith('.mp3') ||
        prompt.endsWith('.wav') ||
        prompt.endsWith('.flac') ||
        prompt.endsWith('.m4a') ||
        prompt.endsWith('.ogg') ||
        prompt.endsWith('.opus') ||
        prompt.endsWith('.webm'))
    ) {
      return prompt;
    }

    if (this.config.audioFile) {
      return this.config.audioFile;
    }

    const sttContext = context as STTCallContext | undefined;
    if (sttContext?.vars?.audioFile) {
      return sttContext.vars.audioFile as string;
    }

    return undefined;
  }

  /**
   * Read audio file from disk
   */
  private async readAudioFile(filePath: string): Promise<Buffer> {
    try {
      const resolvedPath = path.resolve(filePath);
      return await fs.promises.readFile(resolvedPath);
    } catch (error) {
      throw new Error(
        `Failed to read audio file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get audio file metadata
   */
  private getAudioMetadata(
    filePath: string,
    buffer: Buffer,
  ): { format: string; size_bytes: number } {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const format = this.config.audioFormat || ext || 'mp3';

    return {
      format,
      size_bytes: buffer.length,
    };
  }

  /**
   * Call ElevenLabs STT API
   */
  private async transcribeAudio(
    audioBuffer: Buffer,
    fileName: string,
    _format: string,
  ): Promise<STTResponse> {
    const endpoint = '/speech-to-text';

    const additionalFields: Record<string, any> = {
      model_id: this.config.modelId,
    };

    if (this.config.language) {
      additionalFields.language = this.config.language;
    }

    if (this.config.diarization) {
      additionalFields.enable_diarization = true;
      if (this.config.maxSpeakers) {
        additionalFields.num_speakers = this.config.maxSpeakers;
      }
    }

    const response = await this.client.upload<STTResponse>(
      endpoint,
      audioBuffer,
      fileName,
      additionalFields,
    );

    return response;
  }

  /**
   * Generate cache key for audio file
   */
  private getCacheKey(audioFilePath: string): string {
    const configHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          modelId: this.config.modelId,
          language: this.config.language,
          diarization: this.config.diarization,
          maxSpeakers: this.config.maxSpeakers,
        }),
      )
      .digest('hex')
      .slice(0, 16);

    // Include file modification time in cache key
    const stats = fs.statSync(audioFilePath);
    const mtime = stats.mtime.getTime();

    const fileHash = crypto
      .createHash('sha256')
      .update(`${audioFilePath}:${mtime}`)
      .digest('hex')
      .slice(0, 16);

    return `elevenlabs:stt:${configHash}:${fileHash}`;
  }

  /**
   * Get cached response
   */
  private async getCachedResponse(audioFilePath: string): Promise<ProviderResponse | null> {
    try {
      const cache = await getCache();
      const cacheKey = this.getCacheKey(audioFilePath);
      const cached = await cache.get(cacheKey);

      if (cached) {
        return {
          ...cached,
          cached: true,
        };
      }
    } catch (error) {
      logger.warn('[ElevenLabs STT] Cache retrieval failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Cache response
   */
  private async cacheResponse(audioFilePath: string, response: ProviderResponse): Promise<void> {
    try {
      const cache = await getCache();
      const cacheKey = this.getCacheKey(audioFilePath);
      await cache.set(cacheKey, response);

      logger.debug('[ElevenLabs STT] Response cached', { audioFilePath });
    } catch (error) {
      logger.warn('[ElevenLabs STT] Cache storage failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
