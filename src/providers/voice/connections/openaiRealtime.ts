/**
 * OpenAI Realtime Connection
 *
 * WebSocket connection implementation for OpenAI's Realtime API.
 * Handles session configuration, audio streaming, and event routing.
 */

import WebSocket from 'ws';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { BaseVoiceConnection, waitForEvent } from './base';

import type { AudioChunk, AudioFormat, RealtimeMessage, VoiceProviderConfig } from '../types';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const DEFAULT_MODEL = 'gpt-4o-realtime-preview';
const DEFAULT_AUDIO_FORMAT: AudioFormat = 'pcm16';
const DEFAULT_SAMPLE_RATE = 24000;
const CONNECTION_TIMEOUT_MS = 15000;

/**
 * OpenAI Realtime API WebSocket connection.
 *
 * Manages the WebSocket connection to OpenAI's Realtime API,
 * handling session configuration, audio streaming, and event routing.
 */
export class OpenAIRealtimeConnection extends BaseVoiceConnection {
  private model: string;
  // Track cumulative audio position across ALL responses (for playback timeline).
  // This is the key to proper audio alignment: each chunk's timestamp is based
  // on how much audio has been produced, NOT when it was received.
  private cumulativeAudioPositionMs: number = 0;

  constructor(config: VoiceProviderConfig) {
    super(config);
    this.model = config.model || DEFAULT_MODEL;
  }

  /**
   * Connect to the OpenAI Realtime API.
   */
  async connect(): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Set OPENAI_API_KEY environment variable.');
    }

    this.state = 'connecting';
    const url = `${OPENAI_REALTIME_URL}?model=${this.model}`;

    logger.debug('[OpenAIRealtime] Connecting to:', { url: url.replace(apiKey, '***') });

    return new Promise((resolve, reject) => {
      this.setConnectionTimeout(CONNECTION_TIMEOUT_MS);

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this.ws.on('open', () => {
        logger.debug('[OpenAIRealtime] WebSocket connected');
        this.clearConnectionTimeout();
        this.state = 'connected';
        this.startPingInterval();
        resolve();
      });

      this.ws.on('error', (error: Error) => {
        logger.error('[OpenAIRealtime] WebSocket error:', { error });
        this.clearConnectionTimeout();
        if (this.state === 'connecting') {
          reject(error);
        } else {
          this.handleError(error);
        }
      });

      this.setupWebSocketHandlers(this.ws);
    });
  }

  /**
   * Configure the voice session.
   */
  async configureSession(): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Cannot configure session: not connected');
    }

    const turnDetection = this.config.turnDetection;
    const turnDetectionConfig =
      turnDetection?.mode === 'server_vad'
        ? {
            type: 'server_vad' as const,
            threshold: turnDetection.vadThreshold,
            prefix_padding_ms: turnDetection.prefixPaddingMs,
            silence_duration_ms: turnDetection.silenceThresholdMs,
          }
        : null;

    const audioFormat = this.config.audioFormat || DEFAULT_AUDIO_FORMAT;
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.config.instructions,
        voice: this.config.voice,
        input_audio_format: audioFormat,
        output_audio_format: audioFormat,
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: turnDetectionConfig,
      },
    };

    logger.debug('[OpenAIRealtime] Configuring session:', {
      voice: this.config.voice,
      turnDetection: turnDetectionConfig?.type || 'disabled',
    });

    this.send(sessionConfig);

    // Wait for session confirmation
    await waitForEvent(this, 'session_configured', 10000);

    logger.debug('[OpenAIRealtime] Session configured');
  }

  /**
   * Send an audio chunk to the API.
   */
  sendAudio(chunk: AudioChunk): void {
    if (!this.isReady()) {
      logger.warn('[OpenAIRealtime] Cannot send audio: not ready');
      return;
    }

    this.send({
      type: 'input_audio_buffer.append',
      audio: chunk.data,
    });
  }

  /**
   * Commit the audio buffer (signal end of input).
   */
  commitAudio(): void {
    if (!this.isReady()) {
      logger.warn('[OpenAIRealtime] Cannot commit audio: not ready');
      return;
    }

    this.send({
      type: 'input_audio_buffer.commit',
    });
  }

  /**
   * Request a response from the API.
   */
  requestResponse(): void {
    if (!this.isReady()) {
      logger.warn('[OpenAIRealtime] Cannot request response: not ready');
      return;
    }

    this.send({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
      },
    });
  }

  /**
   * Clear the input audio buffer.
   */
  clearAudioBuffer(): void {
    if (!this.isReady()) {
      return;
    }

    this.send({
      type: 'input_audio_buffer.clear',
    });
  }

  /**
   * Cancel the current response.
   */
  cancelResponse(): void {
    if (!this.isReady()) {
      return;
    }

    this.send({
      type: 'response.cancel',
    });
  }

  /**
   * Handle incoming WebSocket messages.
   */
  protected handleMessage(data: Buffer | string): void {
    const msgString = typeof data === 'string' ? data : data.toString('utf-8');

    let msg: RealtimeMessage;
    try {
      msg = JSON.parse(msgString);
    } catch {
      logger.warn('[OpenAIRealtime] Failed to parse message:', { data: msgString.slice(0, 100) });
      return;
    }

    logger.debug('[OpenAIRealtime] Received message:', { type: msg.type });

    switch (msg.type) {
      // Session events
      case 'session.created':
      case 'session.updated':
        this.sessionId = (msg.session as { id?: string })?.id || null;
        this.setReady();
        this.emit('session_configured');
        break;

      // Audio output events
      case 'response.audio.delta': {
        const sampleRate = this.config.sampleRate || DEFAULT_SAMPLE_RATE;
        const audioData = Buffer.from(msg.delta as string, 'base64');
        const bytesPerSample = 2; // PCM16
        const durationMs = (audioData.length / bytesPerSample / sampleRate) * 1000;

        // Use cumulative audio position as timestamp (not real time).
        // This ensures proper playback alignment: a 10s audio response gets
        // timestamps spanning 0-10000ms regardless of network streaming speed.
        const timestamp = this.cumulativeAudioPositionMs;

        this.emit('audio_delta', {
          data: msg.delta as string,
          timestamp: timestamp,
          duration: durationMs,
          format: this.config.audioFormat || DEFAULT_AUDIO_FORMAT,
          sampleRate: sampleRate,
        });

        // Advance cumulative position for next chunk
        this.cumulativeAudioPositionMs += durationMs;
        break;
      }

      case 'response.audio.done':
        logger.debug('[OpenAIRealtime] Audio done:', {
          voice: this.config.voice,
          cumulativePositionMs: this.cumulativeAudioPositionMs,
        });
        this.emit('audio_done');
        break;

      // Transcript events
      case 'response.audio_transcript.delta':
        this.emit('transcript_delta', msg.delta as string);
        break;

      case 'response.audio_transcript.done':
        this.emit('transcript_done', (msg.transcript as string) || '');
        break;

      // Input transcription (what the model heard)
      case 'conversation.item.input_audio_transcription.completed':
        this.emit('input_transcript', (msg.transcript as string) || '');
        break;

      // VAD events
      case 'input_audio_buffer.speech_started':
        this.emit('speech_started');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.emit('speech_stopped');
        break;

      // Input audio events
      case 'input_audio_buffer.committed':
        logger.debug('[OpenAIRealtime] Audio buffer committed');
        break;

      case 'input_audio_buffer.cleared':
        logger.debug('[OpenAIRealtime] Audio buffer cleared');
        break;

      // Response lifecycle
      case 'response.created':
        logger.debug('[OpenAIRealtime] Response created:', {
          voice: this.config.voice,
          cumulativePositionMs: this.cumulativeAudioPositionMs,
        });
        break;

      case 'response.done':
        logger.debug('[OpenAIRealtime] Response done');
        break;

      case 'response.output_item.added':
        logger.debug('[OpenAIRealtime] Output item added');
        break;

      case 'response.output_item.done':
        logger.debug('[OpenAIRealtime] Output item done');
        break;

      case 'response.content_part.added':
        logger.debug('[OpenAIRealtime] Content part added');
        break;

      case 'response.content_part.done':
        logger.debug('[OpenAIRealtime] Content part done');
        break;

      // Conversation events
      case 'conversation.item.created':
        logger.debug('[OpenAIRealtime] Conversation item created');
        break;

      // Rate limiting
      case 'rate_limits.updated':
        logger.debug('[OpenAIRealtime] Rate limits updated:', { limits: msg.rate_limits });
        break;

      // Error handling
      case 'error':
        const error = msg.error as { type?: string; code?: string; message?: string };
        logger.error('[OpenAIRealtime] API error:', { error });
        this.emit('error', new Error(error?.message || 'Unknown OpenAI Realtime error'));
        break;

      default:
        logger.debug('[OpenAIRealtime] Unhandled message type:', { type: msg.type });
    }
  }

  /**
   * Get the API key from config or environment.
   */
  protected getApiKey(): string {
    return this.config.apiKey || getEnvString('OPENAI_API_KEY') || '';
  }
}
