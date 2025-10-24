import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../../types/providers';
import type { EnvOverrides } from '../../../types/env';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { ElevenLabsClient } from '../client';
import { ElevenLabsCache } from '../cache';
import { CostTracker } from '../cost-tracker';
import type { ElevenLabsTTSConfig, TTSResponse, TTSStreamConfig } from './types';
import { encodeAudio, saveAudioFile } from './audio';
import {
  createStreamingConnection,
  handleStreamingTTS,
  combineStreamingChunks,
  calculateStreamingMetrics,
} from './streaming';

/**
 * ElevenLabs Text-to-Speech provider
 */
export class ElevenLabsTTSProvider implements ApiProvider {
  private client: ElevenLabsClient;
  private cache: ElevenLabsCache;
  private costTracker: CostTracker;
  public config: ElevenLabsTTSConfig;
  private env?: EnvOverrides;

  constructor(
    modelName: string,
    options: {
      config?: Partial<ElevenLabsTTSConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    const { id, env } = options;
    this.env = env;
    this.config = this.parseConfig(modelName, options);

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'ELEVENLABS_API_KEY environment variable is not set. Please set it to use ElevenLabs providers.',
      );
    }

    this.client = new ElevenLabsClient({
      apiKey,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      retries: this.config.retries,
    });

    this.cache = new ElevenLabsCache({
      enabled: this.config.cache !== false,
      ttl: this.config.cacheTTL,
    });

    this.costTracker = new CostTracker();

    // Override id if provided
    if (id) {
      this.id = () => id;
    }
  }

  id(): string {
    return this.config.label || `elevenlabs:tts:${this.config.modelId}`;
  }

  toString(): string {
    return `[ElevenLabs TTS Provider] Model: ${this.config.modelId}, Voice: ${this.config.voiceId}`;
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    _options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const startTime = Date.now();

    logger.debug('[ElevenLabs TTS] Generating speech', {
      textLength: prompt.length,
      voiceId: this.config.voiceId,
      modelId: this.config.modelId,
      streaming: this.config.streaming,
    });

    // Route to streaming if enabled
    if (this.config.streaming) {
      return this.handleStreamingRequest(prompt, startTime);
    }

    // Check cache first
    const cacheKey = this.cache.generateKey('tts', {
      text: prompt,
      voiceId: this.config.voiceId,
      modelId: this.config.modelId,
      voiceSettings: this.config.voiceSettings,
      outputFormat: this.config.outputFormat,
      seed: this.config.seed,
    });

    const cached = await this.cache.get<TTSResponse>(cacheKey);
    if (cached) {
      logger.debug('[ElevenLabs TTS] Cache hit');
      return this.buildResponse(cached, true, prompt.length, Date.now() - startTime);
    }

    // Make API call
    try {
      const response = await this.client.post<ArrayBuffer>(
        `/text-to-speech/${this.config.voiceId}`,
        {
          text: prompt,
          model_id: this.config.modelId,
          voice_settings: this.config.voiceSettings,
          output_format: this.config.outputFormat,
          seed: this.config.seed,
          optimize_streaming_latency: this.config.optimizeStreamingLatency,
        },
        {
          headers: {
            Accept: 'audio/mpeg',
          },
        },
      );

      // Process audio
      const audioData = await encodeAudio(
        Buffer.from(response),
        this.config.outputFormat || 'mp3_44100_128',
      );

      const ttsResponse: TTSResponse = {
        audio: audioData,
        voiceId: this.config.voiceId,
        modelId: this.config.modelId,
      };

      // Cache response
      await this.cache.set(cacheKey, ttsResponse, audioData.sizeBytes);

      // Save to file if configured
      if (this.config.saveAudio && this.config.audioOutputPath) {
        const savedPath = await saveAudioFile(
          audioData,
          this.config.audioOutputPath,
          `tts-${Date.now()}`,
        );
        logger.debug('[ElevenLabs TTS] Audio saved to file', { path: savedPath });
      }

      return this.buildResponse(ttsResponse, false, prompt.length, Date.now() - startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[ElevenLabs TTS] API call failed', { error: errorMessage });

      return {
        error: `ElevenLabs TTS API error: ${errorMessage}`,
        tokenUsage: {
          total: prompt.length,
          prompt: prompt.length,
          completion: 0,
        },
      };
    }
  }

  private buildResponse(
    ttsResponse: TTSResponse,
    cacheHit: boolean,
    characters: number,
    latency: number,
  ): ProviderResponse {
    // Track cost
    const cost = this.costTracker.trackTTS(characters, {
      voiceId: this.config.voiceId,
      modelId: this.config.modelId,
      cacheHit,
    });

    return {
      output: `Generated ${characters} characters of speech`,
      cached: cacheHit,
      audio: {
        data: ttsResponse.audio.data,
        format: ttsResponse.audio.format,
      },
      tokenUsage: {
        total: characters,
        prompt: characters,
        completion: 0,
        cached: cacheHit ? characters : undefined,
      },
      cost,
      metadata: {
        voiceId: ttsResponse.voiceId,
        modelId: ttsResponse.modelId,
        outputFormat: this.config.outputFormat,
        latency,
        cacheHit,
        audioDuration: ttsResponse.audio.durationMs,
        audioSize: ttsResponse.audio.sizeBytes,
      },
    };
  }

  private parseConfig(
    modelName: string,
    options: {
      config?: Partial<ElevenLabsTTSConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    },
  ): ElevenLabsTTSConfig {
    const { config } = options;

    // Parse provider ID: elevenlabs:tts or elevenlabs:tts:voiceName
    const parts = modelName.split(':');
    const voiceNameFromId = parts.length > 2 ? parts.slice(2).join(':') : undefined;

    return {
      apiKey: config?.apiKey,
      apiKeyEnvar: config?.apiKeyEnvar || 'ELEVENLABS_API_KEY',
      baseUrl: config?.baseUrl,
      timeout: config?.timeout || 120000, // 2 minutes
      cache: config?.cache,
      cacheTTL: config?.cacheTTL,
      retries: config?.retries || 3,

      // TTS-specific config
      voiceId: config?.voiceId || voiceNameFromId || '21m00Tcm4TlvDq8ikWAM', // Rachel (default)
      modelId: config?.modelId || 'eleven_multilingual_v2',
      outputFormat: config?.outputFormat || 'mp3_44100_128',
      voiceSettings: config?.voiceSettings || {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
        speed: 1.0,
      },
      optimizeStreamingLatency: config?.optimizeStreamingLatency || 0,
      seed: config?.seed,
      saveAudio: config?.saveAudio || false,
      audioOutputPath: config?.audioOutputPath,
      label: options.label || options.id,

      // Future features (not yet implemented)
      streaming: config?.streaming || false,
      pronunciationDictionaryId: config?.pronunciationDictionaryId,
      pronunciationRules: config?.pronunciationRules,
      voiceDesign: config?.voiceDesign,
      voiceRemix: config?.voiceRemix,
    };
  }

  private getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config.apiKeyEnvar && this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]) ||
      (this.config.apiKeyEnvar && getEnvString(this.config.apiKeyEnvar as any)) ||
      this.env?.ELEVENLABS_API_KEY ||
      getEnvString('ELEVENLABS_API_KEY')
    );
  }

  private async handleStreamingRequest(
    prompt: string,
    startTime: number,
  ): Promise<ProviderResponse> {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('API key is required for streaming');
      }

      logger.debug('[ElevenLabs TTS] Starting streaming request');

      // Create streaming configuration
      const streamConfig: TTSStreamConfig = {
        modelId: this.config.modelId,
        voiceSettings: this.config.voiceSettings,
        baseUrl: this.config.baseUrl?.replace('https:', 'wss:').replace('http:', 'ws:'),
      };

      // Create WebSocket connection
      const wsClient = await createStreamingConnection(apiKey, this.config.voiceId, streamConfig);

      // Handle streaming
      const session = await handleStreamingTTS(wsClient, prompt);

      // Close connection
      wsClient.close();

      // Combine chunks into single audio buffer
      const combinedAudio = combineStreamingChunks(session.chunks);

      // Calculate metrics
      const metrics = calculateStreamingMetrics(session, prompt.length);

      // Encode audio
      const audioData = await encodeAudio(combinedAudio, this.config.outputFormat || 'mp3_44100_128');

      const ttsResponse: TTSResponse = {
        audio: audioData,
        voiceId: this.config.voiceId,
        modelId: this.config.modelId,
        alignments: session.alignments,
      };

      // Save to file if configured
      if (this.config.saveAudio && this.config.audioOutputPath) {
        const savedPath = await saveAudioFile(
          audioData,
          this.config.audioOutputPath,
          `tts-streaming-${Date.now()}`,
        );
        logger.debug('[ElevenLabs TTS] Streaming audio saved to file', { path: savedPath });
      }

      // Track cost
      const cost = this.costTracker.trackTTS(prompt.length, {
        voiceId: this.config.voiceId,
        modelId: this.config.modelId,
        streaming: true,
      });

      return {
        output: `Generated ${prompt.length} characters of speech (streaming)`,
        cached: false,
        audio: {
          data: ttsResponse.audio.data,
          format: ttsResponse.audio.format,
        },
        tokenUsage: {
          total: prompt.length,
          prompt: prompt.length,
          completion: 0,
        },
        cost,
        metadata: {
          voiceId: ttsResponse.voiceId,
          modelId: ttsResponse.modelId,
          outputFormat: this.config.outputFormat,
          latency: Date.now() - startTime,
          cacheHit: false,
          streaming: true,
          audioDuration: ttsResponse.audio.durationMs,
          audioSize: ttsResponse.audio.sizeBytes,
          ...metrics,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[ElevenLabs TTS] Streaming failed', { error: errorMessage });

      return {
        error: `ElevenLabs TTS streaming error: ${errorMessage}`,
        tokenUsage: {
          total: prompt.length,
          prompt: prompt.length,
          completion: 0,
        },
      };
    }
  }
}
