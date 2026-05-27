/**
 * Google Live Connection
 *
 * WebSocket connection implementation for Google's Live (Gemini) API.
 * Handles session configuration, audio streaming, and event routing.
 */

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

const GOOGLE_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws';
const DEFAULT_MODEL = 'gemini-3.1-flash-live-preview';
const DEFAULT_API_VERSION = 'v1beta';
const DEFAULT_AUDIO_FORMAT: AudioFormat = 'pcm16';
const GOOGLE_INPUT_SAMPLE_RATE = 16000;
const GOOGLE_OUTPUT_SAMPLE_RATE = 24000;
const CONNECTION_TIMEOUT_MS = 15000;
const INITIAL_RESPONSE_PROMPT = 'Begin the conversation now.';
const TRANSCRIPT_SETTLE_DELAY_MS = 250;

type GoogleServerContent = {
  modelTurn?: {
    parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }>;
  };
  outputTranscription?: { text?: string };
  inputTranscription?: { text?: string };
  turnComplete?: boolean;
  generationComplete?: boolean;
};

type GoogleRealtimeInput = {
  audio?: { mimeType?: string; data?: string };
};

/**
 * Google Live API WebSocket connection.
 *
 * Manages the WebSocket connection to Google's Live API,
 * handling session configuration, audio streaming, and event routing.
 */
export class GoogleLiveConnection extends BaseVoiceConnection {
  private model: string;
  private apiVersion: string;
  private cumulativeAudioPositionMs = 0;
  private accumulatedTranscript = '';
  private inputActivityActive = false;
  private responseTriggeredByInput = false;
  private turnCompletionTimer: ReturnType<typeof setTimeout> | null = null;
  private outputTurnClosed = false;

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
      this.setConnectionTimeout(CONNECTION_TIMEOUT_MS, reject);

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
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.config.voice,
            },
          },
        }
      : undefined;

    const setupMessage = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          ...(speechConfig ? { speechConfig } : {}),
        },
        ...(this.config.instructions
          ? {
              systemInstruction: {
                parts: [{ text: this.config.instructions }],
              },
            }
          : {}),
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: true,
          },
        },
      },
    };

    this.inputActivityActive = false;
    this.responseTriggeredByInput = false;

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

    const pcmData = audioDataToPcm16(base64ToBuffer(chunk.data), chunk.format);
    const inputData = resamplePcm16(pcmData, chunk.sampleRate, GOOGLE_INPUT_SAMPLE_RATE);
    if (!this.inputActivityActive) {
      this.send({ realtimeInput: { activityStart: {} } });
      this.inputActivityActive = true;
    }

    this.send({
      realtimeInput: {
        audio: {
          mimeType: `audio/pcm;rate=${GOOGLE_INPUT_SAMPLE_RATE}`,
          data: bufferToBase64(inputData),
        },
      },
    });
  }

  /**
   * Commit the audio buffer (signal end of input).
   * End the manually bounded activity after the routed input audio completes.
   */
  commitAudio(): void {
    if (!this.isReady()) {
      logger.warn('[GoogleLive] Cannot commit audio: not ready');
      return;
    }

    if (!this.inputActivityActive) {
      logger.debug('[GoogleLive] No active input audio to commit');
      return;
    }

    this.send({ realtimeInput: { activityEnd: {} } });
    this.inputActivityActive = false;
    this.outputTurnClosed = false;
    this.responseTriggeredByInput = true;
  }

  /**
   * Request a response from the API.
   * Google Live responds to activityEnd after routed audio. For an initial
   * speak-first request there is no audio to close, so provide a text kickoff.
   */
  requestResponse(): void {
    if (!this.isReady()) {
      logger.warn('[GoogleLive] Cannot request response: not ready');
      return;
    }

    if (this.responseTriggeredByInput) {
      this.responseTriggeredByInput = false;
      logger.debug('[GoogleLive] Response triggered by completed audio activity');
      return;
    }

    this.outputTurnClosed = false;
    this.sendText(INITIAL_RESPONSE_PROMPT);
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

    this.outputTurnClosed = false;
    this.send({ realtimeInput: { text } });
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
        this.emitAudioDelta(data.toString('base64'));
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
      logger.warn('[GoogleLive] Failed to parse message:', { messageLength: msgString.length });
      return;
    }

    logger.debug('[GoogleLive] Received message:', { type: this.getMessageType(msg) });

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

    this.handleServerContent(msg.serverContent as GoogleServerContent | undefined);
    this.handleRealtimeInput(msg.realtimeInput as GoogleRealtimeInput | undefined);
  }

  private getMessageType(msg: RealtimeMessage): string {
    if (msg.setupComplete) {
      return 'setupComplete';
    }
    if (msg.serverContent?.modelTurn) {
      return 'modelTurn';
    }
    if (msg.serverContent?.turnComplete) {
      return 'turnComplete';
    }
    if (msg.serverContent?.generationComplete) {
      return 'generationComplete';
    }
    if (msg.toolCall) {
      return 'toolCall';
    }
    if (msg.error) {
      return 'error';
    }
    return 'unknown';
  }

  private handleServerContent(serverContent?: GoogleServerContent): void {
    if (!serverContent) {
      return;
    }

    for (const part of serverContent.modelTurn?.parts || []) {
      if (part.text) {
        this.appendTranscript(part.text);
      }
      if (part.inlineData?.mimeType?.includes('audio')) {
        this.emitAudioDelta(part.inlineData.data || '');
      }
    }

    if (serverContent.outputTranscription?.text) {
      this.appendTranscript(serverContent.outputTranscription.text);
    }

    if (serverContent.inputTranscription?.text) {
      this.emit('input_transcript', serverContent.inputTranscription.text);
    }

    if (serverContent.turnComplete) {
      logger.debug('[GoogleLive] Turn complete');
      this.scheduleTurnCompletion();
    }

    if (serverContent.generationComplete) {
      logger.debug('[GoogleLive] Generation complete');
    }
  }

  private handleRealtimeInput(realtimeInput?: GoogleRealtimeInput): void {
    const audio = realtimeInput?.audio;
    if (audio?.mimeType?.includes('audio') && audio.data) {
      this.emitAudioDelta(audio.data);
    }
  }

  private emitAudioDelta(data: string): void {
    // Google Live outputs PCM audio at 24kHz regardless of accepted input rate.
    const sampleRate = GOOGLE_OUTPUT_SAMPLE_RATE;
    const duration = calculateDuration(
      Buffer.from(data, 'base64').length,
      sampleRate,
      DEFAULT_AUDIO_FORMAT,
    );

    this.emit('audio_delta', {
      data,
      timestamp: this.cumulativeAudioPositionMs,
      duration,
      format: DEFAULT_AUDIO_FORMAT,
      sampleRate,
    });
    this.cumulativeAudioPositionMs += duration;
  }

  private appendTranscript(delta: string): void {
    if (this.outputTurnClosed) {
      logger.debug('[GoogleLive] Ignoring transcript received after turn completion');
      return;
    }

    this.accumulatedTranscript += delta;
    this.emit('transcript_delta', delta);

    if (this.turnCompletionTimer) {
      this.scheduleTurnCompletion();
    }
  }

  private finishTranscript(): void {
    this.emit('transcript_done', this.accumulatedTranscript);
    this.accumulatedTranscript = '';
  }

  private scheduleTurnCompletion(): void {
    this.clearTurnCompletionTimer();
    this.turnCompletionTimer = setTimeout(() => {
      this.turnCompletionTimer = null;
      this.finishTranscript();
      this.outputTurnClosed = true;
      this.emit('audio_done');
      this.emit('speech_stopped');
    }, TRANSCRIPT_SETTLE_DELAY_MS);
  }

  private clearTurnCompletionTimer(): void {
    if (this.turnCompletionTimer) {
      clearTimeout(this.turnCompletionTimer);
      this.turnCompletionTimer = null;
    }
  }

  override disconnect(): void {
    this.clearTurnCompletionTimer();
    this.inputActivityActive = false;
    this.responseTriggeredByInput = false;
    this.outputTurnClosed = false;
    super.disconnect();
  }

  /**
   * Get the API key from config or environment.
   */
  protected getApiKey(): string {
    return this.config.apiKey || getEnvString('GOOGLE_API_KEY') || '';
  }
}
