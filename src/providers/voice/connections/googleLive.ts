/**
 * Google Live Connection
 *
 * WebSocket connection implementation for Google's Live (Gemini) API.
 * Handles session configuration, audio streaming, and event routing.
 */

import WebSocket from 'ws';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { BaseVoiceConnection, waitForEvent } from './base';

import type { AudioChunk, AudioFormat, RealtimeMessage, VoiceProviderConfig } from '../types';

const GOOGLE_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws';
const DEFAULT_MODEL = 'gemini-2.0-flash-exp';
const DEFAULT_API_VERSION = 'v1alpha';
const DEFAULT_AUDIO_FORMAT: AudioFormat = 'pcm16';
const DEFAULT_SAMPLE_RATE = 24000;
const CONNECTION_TIMEOUT_MS = 15000;

/**
 * Google Live API WebSocket connection.
 *
 * Manages the WebSocket connection to Google's Live API,
 * handling session configuration, audio streaming, and event routing.
 */
export class GoogleLiveConnection extends BaseVoiceConnection {
  private model: string;
  private apiVersion: string;

  constructor(config: VoiceProviderConfig) {
    super(config);
    this.model = config.model || DEFAULT_MODEL;
    this.apiVersion = (config as { apiVersion?: string }).apiVersion || DEFAULT_API_VERSION;
  }

  /**
   * Connect to the Google Live API.
   */
  async connect(): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Google API key not found. Set GOOGLE_API_KEY environment variable.');
    }

    this.state = 'connecting';
    const url = `${GOOGLE_LIVE_URL}/google.ai.generativelanguage.${this.apiVersion}.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    logger.debug('[GoogleLive] Connecting to:', { url: url.replace(apiKey, '***') });

    return new Promise((resolve, reject) => {
      this.setConnectionTimeout(CONNECTION_TIMEOUT_MS);

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        logger.debug('[GoogleLive] WebSocket connected');
        this.clearConnectionTimeout();
        this.state = 'connected';
        this.startPingInterval();
        resolve();
      });

      this.ws.on('error', (error: Error) => {
        logger.error('[GoogleLive] WebSocket error:', { error });
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

    // Build speech config if voice is specified
    const speechConfig = this.config.voice
      ? {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: this.config.voice,
            },
          },
        }
      : undefined;

    const setupMessage = {
      setup: {
        model: `models/${this.model}`,
        generation_config: {
          response_modalities: ['audio'],
          speech_config: speechConfig,
        },
        ...(this.config.instructions ? { systemInstruction: this.config.instructions } : {}),
        output_audio_transcription: { model: 'gemini-1.5-flash' },
        input_audio_transcription: { model: 'gemini-1.5-flash' },
      },
    };

    logger.debug('[GoogleLive] Configuring session:', {
      model: this.model,
      voice: this.config.voice,
    });

    this.send(setupMessage);

    // Wait for session confirmation
    await waitForEvent(this, 'session_configured', 10000);

    logger.debug('[GoogleLive] Session configured');
  }

  /**
   * Send an audio chunk to the API.
   */
  sendAudio(chunk: AudioChunk): void {
    if (!this.isReady()) {
      logger.warn('[GoogleLive] Cannot send audio: not ready');
      return;
    }

    // Google Live uses realtimeInput.mediaChunks format
    this.send({
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm',
            data: chunk.data,
          },
        ],
      },
    });
  }

  /**
   * Commit the audio buffer (signal end of input).
   * Google Live handles turn completion differently - we send end_of_turn flag.
   */
  commitAudio(): void {
    if (!this.isReady()) {
      logger.warn('[GoogleLive] Cannot commit audio: not ready');
      return;
    }

    // Google Live uses client_content with turn_complete flag
    this.send({
      client_content: {
        turn_complete: true,
      },
    });
  }

  /**
   * Request a response from the API.
   * Google Live automatically generates responses after turn completion.
   */
  requestResponse(): void {
    // Google Live automatically responds after turn_complete
    // No explicit request needed, but we can send an empty turn to trigger
    if (!this.isReady()) {
      logger.warn('[GoogleLive] Cannot request response: not ready');
      return;
    }

    logger.debug('[GoogleLive] Response will be generated after turn completion');
  }

  /**
   * Clear the input audio buffer.
   * Google Live doesn't have explicit buffer clearing.
   */
  clearAudioBuffer(): void {
    // Google Live doesn't support explicit buffer clearing
    logger.debug('[GoogleLive] Buffer clear not supported - will be handled by new turn');
  }

  /**
   * Cancel the current response.
   * Google Live doesn't support explicit response cancellation.
   */
  cancelResponse(): void {
    // Google Live doesn't support explicit response cancellation
    logger.debug('[GoogleLive] Response cancellation not supported');
  }

  /**
   * Send a text message (for text-based turns).
   */
  sendText(text: string): void {
    if (!this.isReady()) {
      logger.warn('[GoogleLive] Cannot send text: not ready');
      return;
    }

    this.send({
      client_content: {
        turns: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        turn_complete: true,
      },
    });
  }

  /**
   * Handle incoming WebSocket messages.
   */
  protected handleMessage(data: Buffer | string): void {
    // Handle binary audio data
    if (Buffer.isBuffer(data)) {
      try {
        // Try to parse as JSON first
        const msgString = data.toString('utf-8');
        JSON.parse(msgString);
        // If it parses as JSON, handle as message
        this.handleJsonMessage(msgString);
      } catch {
        // Binary audio data
        const audioData = data.toString('base64');
        this.emit('audio_delta', {
          data: audioData,
          timestamp: Date.now(),
          format: this.config.audioFormat || DEFAULT_AUDIO_FORMAT,
          sampleRate: this.config.sampleRate || DEFAULT_SAMPLE_RATE,
        });
      }
      return;
    }

    this.handleJsonMessage(data);
  }

  /**
   * Handle JSON messages from the API.
   */
  private handleJsonMessage(msgString: string): void {
    let msg: RealtimeMessage;
    try {
      msg = JSON.parse(msgString);
    } catch {
      logger.warn('[GoogleLive] Failed to parse message:', { data: msgString.slice(0, 100) });
      return;
    }

    // Determine message type for logging
    const messageType = msg.setupComplete
      ? 'setupComplete'
      : msg.serverContent?.modelTurn
        ? 'modelTurn'
        : msg.serverContent?.turnComplete
          ? 'turnComplete'
          : msg.serverContent?.generationComplete
            ? 'generationComplete'
            : msg.toolCall
              ? 'toolCall'
              : msg.error
                ? 'error'
                : 'unknown';

    logger.debug('[GoogleLive] Received message:', { type: messageType });

    // Setup complete
    if (msg.setupComplete) {
      this.sessionId = 'google-live-session';
      this.setReady();
      this.emit('session_configured');
      return;
    }

    // Error handling
    if (msg.error) {
      const error = msg.error as { message?: string; code?: number };
      logger.error('[GoogleLive] API error:', { error });
      this.emit('error', new Error(error?.message || 'Unknown Google Live error'));
      return;
    }

    // Server content
    const serverContent = msg.serverContent as {
      modelTurn?: {
        parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }>;
      };
      outputTranscription?: { text?: string };
      inputTranscription?: { text?: string };
      turnComplete?: boolean;
      generationComplete?: boolean;
    };

    if (serverContent) {
      // Model turn with content
      if (serverContent.modelTurn?.parts) {
        for (const part of serverContent.modelTurn.parts) {
          if (part.text) {
            this.emit('transcript_delta', part.text);
          }
          if (part.inlineData?.mimeType?.includes('audio')) {
            this.emit('audio_delta', {
              data: part.inlineData.data || '',
              timestamp: Date.now(),
              format: this.config.audioFormat || DEFAULT_AUDIO_FORMAT,
              sampleRate: this.config.sampleRate || DEFAULT_SAMPLE_RATE,
            });
          }
        }
      }

      // Output transcription (what the model said)
      if (serverContent.outputTranscription?.text) {
        this.emit('transcript_delta', serverContent.outputTranscription.text);
      }

      // Input transcription (what the user said)
      if (serverContent.inputTranscription?.text) {
        this.emit('input_transcript', serverContent.inputTranscription.text);
      }

      // Turn complete
      if (serverContent.turnComplete) {
        logger.debug('[GoogleLive] Turn complete');
        this.emit('audio_done');
        this.emit('speech_stopped');
      }

      // Generation complete
      if (serverContent.generationComplete) {
        logger.debug('[GoogleLive] Generation complete');
        this.emit('audio_done');
      }
    }

    // Realtime input (audio chunks from server)
    const realtimeInput = msg.realtimeInput as {
      mediaChunks?: Array<{ mimeType?: string; data?: string }>;
    };
    if (realtimeInput?.mediaChunks) {
      for (const chunk of realtimeInput.mediaChunks) {
        if (chunk.mimeType?.includes('audio') && chunk.data) {
          this.emit('audio_delta', {
            data: chunk.data,
            timestamp: Date.now(),
            format: this.config.audioFormat || DEFAULT_AUDIO_FORMAT,
            sampleRate: this.config.sampleRate || DEFAULT_SAMPLE_RATE,
          });
        }
      }
    }
  }

  /**
   * Get the API key from config or environment.
   */
  protected getApiKey(): string {
    return this.config.apiKey || getEnvString('GOOGLE_API_KEY') || '';
  }
}
