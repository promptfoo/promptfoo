import WebSocket from 'ws';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import {
  audioDataToPcm16,
  base64ToBuffer,
  bufferToBase64,
  calculateDuration,
  resamplePcm16,
} from '../audioBuffer';
import { BaseVoiceConnection, waitForEvent } from './base';

import type { AudioChunk, AudioFormat, RealtimeMessage, VoiceProviderConfig } from '../types';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const DEFAULT_MODEL = 'gpt-realtime';
const DEFAULT_AUDIO_FORMAT: AudioFormat = 'pcm16';
const DEFAULT_SAMPLE_RATE = 24000;
const G711_SAMPLE_RATE = 8000;
const CONNECTION_TIMEOUT_MS = 15000;

function toRealtimeAudioFormat(format: AudioFormat) {
  switch (format) {
    case 'g711_ulaw':
      return { type: 'audio/pcmu' as const };
    case 'g711_alaw':
      return { type: 'audio/pcma' as const };
    case 'pcm16':
      return { type: 'audio/pcm' as const, rate: DEFAULT_SAMPLE_RATE };
  }
}

export class OpenAIRealtimeConnection extends BaseVoiceConnection {
  private model: string;
  // Track cumulative audio position across responses (for playback timeline).
  // This is the key to proper audio alignment: each chunk's timestamp is based
  // on how much audio has been produced, rather than when it was received.
  private cumulativeAudioPositionMs = 0;
  private cancelRequested = false;

  constructor(config: VoiceProviderConfig) {
    super(config);
    this.model = config.model || DEFAULT_MODEL;
  }

  private getAudioSampleRate(audioFormat: AudioFormat): number {
    return audioFormat === 'pcm16' ? DEFAULT_SAMPLE_RATE : G711_SAMPLE_RATE;
  }

  async connect(): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Set OPENAI_API_KEY environment variable.');
    }

    this.state = 'connecting';
    const url = `${OPENAI_REALTIME_URL}?model=${this.model}`;

    logger.debug('[OpenAIRealtime] Connecting to:', { url: url.replace(apiKey, '***') });

    return new Promise((resolve, reject) => {
      this.setPendingConnectionReject(reject);
      this.setConnectionTimeout(CONNECTION_TIMEOUT_MS, reject);

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      this.ws.on('open', () => {
        if (this.state !== 'connecting') {
          return;
        }
        logger.debug('[OpenAIRealtime] WebSocket connected');
        this.clearConnectionTimeout();
        this.clearPendingConnectionReject();
        this.state = 'connected';
        this.startPingInterval();
        resolve();
      });

      this.setupWebSocketHandlers(this.ws);
    });
  }

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
    const realtimeAudioFormat = toRealtimeAudioFormat(audioFormat);
    const sessionConfig = {
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions: this.config.instructions,
        audio: {
          input: {
            format: realtimeAudioFormat,
            turn_detection: turnDetectionConfig,
          },
          output: {
            format: realtimeAudioFormat,
            voice: this.config.voice,
          },
        },
      },
    };

    logger.debug('[OpenAIRealtime] Configuring session:', {
      voice: this.config.voice,
      turnDetection: turnDetectionConfig?.type || 'disabled',
    });

    const configured = waitForEvent(this, 'session_configured', 10000);
    this.send(sessionConfig);

    // Wait for session confirmation
    await configured;

    logger.debug('[OpenAIRealtime] Session configured');
  }

  sendAudio(chunk: AudioChunk): void {
    if (!this.isReady()) {
      logger.warn('[OpenAIRealtime] Cannot send audio: not ready');
      return;
    }

    const inputFormat = this.config.audioFormat || DEFAULT_AUDIO_FORMAT;
    const inputSampleRate = this.getAudioSampleRate(inputFormat);
    let inputData: string;

    if (chunk.format === inputFormat && chunk.sampleRate === inputSampleRate) {
      inputData = chunk.data;
    } else if (inputFormat === 'pcm16') {
      const pcmData = audioDataToPcm16(base64ToBuffer(chunk.data), chunk.format);
      inputData = bufferToBase64(resamplePcm16(pcmData, chunk.sampleRate, inputSampleRate));
    } else {
      if (chunk.format !== inputFormat || chunk.sampleRate !== inputSampleRate) {
        throw new Error(
          `Cannot route ${chunk.format} at ${chunk.sampleRate} Hz to OpenAI ${inputFormat} at ${inputSampleRate} Hz without encoding support`,
        );
      }
      inputData = chunk.data;
    }

    this.send({
      type: 'input_audio_buffer.append',
      audio: inputData,
    });
  }

  commitAudio(): void {
    if (!this.isReady()) {
      logger.warn('[OpenAIRealtime] Cannot commit audio: not ready');
      return;
    }

    this.send({
      type: 'input_audio_buffer.commit',
    });
  }

  requestResponse(): void {
    if (!this.isReady()) {
      logger.warn('[OpenAIRealtime] Cannot request response: not ready');
      return;
    }

    this.send({ type: 'response.create' });
  }

  clearAudioBuffer(): void {
    if (!this.isReady()) {
      return;
    }

    this.send({
      type: 'input_audio_buffer.clear',
    });
  }

  cancelResponse(): void {
    this.cancelRequested = true;
    if (!this.isReady()) {
      return;
    }

    this.send({
      type: 'response.cancel',
    });
  }

  protected handleMessage(data: Buffer | string): void {
    const msgString = typeof data === 'string' ? data : data.toString('utf-8');

    let msg: RealtimeMessage;
    try {
      msg = JSON.parse(msgString);
    } catch {
      logger.warn('[OpenAIRealtime] Failed to parse message:', { messageLength: msgString.length });
      return;
    }

    logger.debug('[OpenAIRealtime] Received message:', { type: msg.type });

    switch (msg.type) {
      // Session events
      case 'session.created':
        this.sessionId = (msg.session as { id?: string })?.id || null;
        break;
      case 'session.updated':
        this.sessionId = (msg.session as { id?: string })?.id || null;
        this.setReady();
        this.emit('session_configured');
        break;

      // Audio output events
      case 'response.output_audio.delta': {
        const audioFormat = this.config.audioFormat || DEFAULT_AUDIO_FORMAT;
        const sampleRate = this.getAudioSampleRate(audioFormat);
        const audioData = Buffer.from(msg.delta as string, 'base64');
        const durationMs = calculateDuration(audioData.length, sampleRate, audioFormat);

        // Use cumulative audio position as timestamp (not real time).
        // This ensures proper playback alignment: a 10s audio response gets
        // timestamps spanning 0-10000ms regardless of network streaming speed.
        const timestamp = this.cumulativeAudioPositionMs;

        this.emit('audio_delta', {
          data: msg.delta as string,
          timestamp: timestamp,
          duration: durationMs,
          format: audioFormat,
          sampleRate: sampleRate,
        });

        // Advance cumulative position for next chunk
        this.cumulativeAudioPositionMs += durationMs;
        break;
      }

      case 'response.output_audio.done':
        logger.debug('[OpenAIRealtime] Audio done:', {
          voice: this.config.voice,
          cumulativePositionMs: this.cumulativeAudioPositionMs,
        });
        this.emit('audio_done');
        break;

      // Transcript events
      case 'response.output_audio_transcript.delta':
        this.emit('transcript_delta', msg.delta as string);
        break;

      case 'response.output_audio_transcript.done':
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

      case 'response.done': {
        const response = msg.response as
          | { status?: string; status_details?: { reason?: string; error?: { message?: string } } }
          | undefined;
        const status = response?.status;
        if (status && status !== 'completed' && !(status === 'cancelled' && this.cancelRequested)) {
          const detail =
            response?.status_details?.error?.message ?? response?.status_details?.reason;
          this.handleError(
            new Error(`OpenAI Realtime response ${status}${detail ? `: ${detail}` : ''}`),
          );
        }
        this.cancelRequested = false;
        break;
      }

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
        this.handleError(new Error(error?.message || 'Unknown OpenAI Realtime error'));
        break;

      default:
        logger.debug('[OpenAIRealtime] Unhandled message type:', { type: msg.type });
    }
  }

  protected getApiKey(): string {
    return this.config.apiKey || getEnvString('OPENAI_API_KEY') || '';
  }
}
