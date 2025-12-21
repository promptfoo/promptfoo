/**
 * Nova Sonic Voice Connection
 *
 * Adapter for AWS Bedrock Nova Sonic bidirectional streaming API.
 * Maps the AWS SDK streaming pattern to the VoiceConnection interface.
 *
 * Key differences from WebSocket-based providers:
 * - Uses AWS SDK InvokeModelWithBidirectionalStreamCommand
 * - Queue-based async iterable for sending events
 * - Different audio sample rates (8kHz input, 16kHz output vs 24kHz)
 */

import { EventEmitter } from 'events';
import { Subject, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { base64ToBuffer, bufferToBase64 } from '../audioBuffer';

import type { AudioChunk, AudioFormat, VoiceConnectionEvents, VoiceProviderConfig } from '../types';

// Nova Sonic specific constants
const DEFAULT_MODEL = 'amazon.nova-sonic-v1:0';
const NOVA_INPUT_SAMPLE_RATE = 8000;
const NOVA_OUTPUT_SAMPLE_RATE = 16000;
const TARGET_SAMPLE_RATE = 24000; // What other providers use
const CONNECTION_TIMEOUT_MS = 30000;

// Nova Sonic voice IDs
const NOVA_VOICES = ['tiffany', 'matthew', 'amy'] as const;
type NovaVoice = (typeof NOVA_VOICES)[number];

/**
 * Connection state.
 */
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'ready' | 'error';

/**
 * Nova Sonic session state.
 */
interface SessionState {
  queue: NovaSonicEvent[];
  queueSignal: Subject<void>;
  closeSignal: Subject<void>;
  isActive: boolean;
  audioContentId: string;
  promptName: string;
}

/**
 * Nova Sonic event structure.
 */
interface NovaSonicEvent {
  event: Record<string, unknown>;
}

/**
 * Nova Sonic audio configuration.
 */
interface NovaAudioConfig {
  audioType: 'SPEECH';
  encoding: 'base64';
  mediaType: 'audio/lpcm';
  sampleRateHertz: number;
  sampleSizeBits: 16;
  channelCount: 1;
  voiceId?: string;
}

/**
 * Default Nova Sonic configuration.
 */
const DEFAULT_CONFIG = {
  inference: {
    maxTokens: 1024,
    topP: 0.9,
    temperature: 0.7,
  },
  audio: {
    input: {
      audioType: 'SPEECH',
      encoding: 'base64',
      mediaType: 'audio/lpcm',
      sampleRateHertz: NOVA_INPUT_SAMPLE_RATE,
      sampleSizeBits: 16,
      channelCount: 1,
    } as NovaAudioConfig,
    output: {
      audioType: 'SPEECH',
      encoding: 'base64',
      mediaType: 'audio/lpcm',
      sampleRateHertz: NOVA_OUTPUT_SAMPLE_RATE,
      sampleSizeBits: 16,
      channelCount: 1,
      voiceId: 'tiffany',
    } as NovaAudioConfig,
  },
  text: {
    mediaType: 'text/plain',
  },
};

/**
 * Resample audio between sample rates using linear interpolation.
 * For production use, consider using a proper resampling library.
 */
function resampleAudio(
  inputBuffer: Buffer,
  inputRate: number,
  outputRate: number,
): Buffer {
  if (inputRate === outputRate) {
    return inputBuffer;
  }

  const ratio = outputRate / inputRate;
  const inputSamples = inputBuffer.length / 2; // 16-bit samples
  const outputSamples = Math.floor(inputSamples * ratio);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = i / ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples - 1);
    const fraction = srcIndex - srcIndexFloor;

    // Read samples (handle potential buffer overrun)
    const sample1 = srcIndexFloor * 2 + 1 < inputBuffer.length
      ? inputBuffer.readInt16LE(srcIndexFloor * 2)
      : 0;
    const sample2 = srcIndexCeil * 2 + 1 < inputBuffer.length
      ? inputBuffer.readInt16LE(srcIndexCeil * 2)
      : sample1;

    // Linear interpolation
    const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
    outputBuffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, interpolated)),
      i * 2,
    );
  }

  return outputBuffer;
}

/**
 * Nova Sonic Voice Connection.
 *
 * Adapts AWS Bedrock Nova Sonic bidirectional streaming to the VoiceConnection interface.
 */
export class NovaSonicConnection extends EventEmitter {
  protected state: ConnectionState = 'disconnected';
  protected config: VoiceProviderConfig;
  protected sessionId: string | null = null;

  private model: string;
  private session: SessionState | null = null;
  private bedrockClient: any = null;
  private responsePromise: Promise<any> | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private cumulativeAudioPositionMs: number = 0;

  constructor(config: VoiceProviderConfig) {
    super();
    this.config = config;
    this.model = config.model || DEFAULT_MODEL;
  }

  /**
   * Establish connection to Nova Sonic.
   */
  async connect(): Promise<void> {
    this.state = 'connecting';

    try {
      // Set connection timeout
      this.setConnectionTimeout(CONNECTION_TIMEOUT_MS);

      // Initialize Bedrock client
      const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
      const { NodeHttp2Handler } = await import('@smithy/node-http-handler');

      const region = this.getRegion();

      this.bedrockClient = new BedrockRuntimeClient({
        region,
        requestHandler: new NodeHttp2Handler({
          requestTimeout: 300000,
          sessionTimeout: 300000,
          disableConcurrentStreams: false,
          maxConcurrentStreams: 20,
        }),
      });

      this.clearConnectionTimeout();
      this.state = 'connected';

      logger.debug('[NovaSonic] Connected to AWS Bedrock', { region, model: this.model });
    } catch (error) {
      this.clearConnectionTimeout();
      this.state = 'error';
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to Nova Sonic: ${message}`);
    }
  }

  /**
   * Configure the voice session.
   */
  async configureSession(): Promise<void> {
    if (this.state !== 'connected') {
      throw new Error('Cannot configure session: not connected');
    }

    // Create session state
    this.sessionId = crypto.randomUUID();
    this.session = {
      queue: [],
      queueSignal: new Subject<void>(),
      closeSignal: new Subject<void>(),
      isActive: true,
      audioContentId: crypto.randomUUID(),
      promptName: crypto.randomUUID(),
    };

    // Start the bidirectional stream
    const { InvokeModelWithBidirectionalStreamCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );

    this.responsePromise = this.bedrockClient.send(
      new InvokeModelWithBidirectionalStreamCommand({
        modelId: this.model,
        body: this.createAsyncIterable(),
      }),
    );

    // Send session start
    await this.sendEvent({
      event: {
        sessionStart: {
          inferenceConfiguration: DEFAULT_CONFIG.inference,
        },
      },
    });

    // Send prompt start with audio config
    const voice = this.mapVoice(this.config.voice);
    await this.sendEvent({
      event: {
        promptStart: {
          promptName: this.session.promptName,
          textOutputConfiguration: DEFAULT_CONFIG.text,
          audioOutputConfiguration: {
            ...DEFAULT_CONFIG.audio.output,
            voiceId: voice,
          },
        },
      },
    });

    // Send system prompt if provided
    if (this.config.instructions) {
      await this.sendSystemPrompt(this.config.instructions);
    }

    // Start audio content
    await this.sendEvent({
      event: {
        contentStart: {
          promptName: this.session.promptName,
          contentName: this.session.audioContentId,
          type: 'AUDIO',
          interactive: true,
          role: 'USER',
          audioInputConfiguration: DEFAULT_CONFIG.audio.input,
        },
      },
    });

    // Start processing responses in background
    this.processResponses();

    this.state = 'ready';
    this.emit('session_configured');
    this.emit('ready');

    logger.debug('[NovaSonic] Session configured', {
      sessionId: this.sessionId,
      voice,
    });
  }

  /**
   * Send an audio chunk.
   */
  sendAudio(chunk: AudioChunk): void {
    if (!this.isReady() || !this.session) {
      logger.warn('[NovaSonic] Cannot send audio: not ready');
      return;
    }

    // Resample from 24kHz to 8kHz
    const inputBuffer = base64ToBuffer(chunk.data);
    const resampledBuffer = resampleAudio(
      inputBuffer,
      chunk.sampleRate || TARGET_SAMPLE_RATE,
      NOVA_INPUT_SAMPLE_RATE,
    );

    this.sendEvent({
      event: {
        audioInput: {
          promptName: this.session.promptName,
          contentName: this.session.audioContentId,
          content: bufferToBase64(resampledBuffer),
        },
      },
    });
  }

  /**
   * Commit the audio buffer (signal end of input).
   */
  commitAudio(): void {
    if (!this.isReady() || !this.session) {
      logger.warn('[NovaSonic] Cannot commit audio: not ready');
      return;
    }

    // End the current audio content
    this.sendEvent({
      event: {
        contentEnd: {
          promptName: this.session.promptName,
          contentName: this.session.audioContentId,
        },
      },
    });

    // Generate new content ID for next turn
    this.session.audioContentId = crypto.randomUUID();

    logger.debug('[NovaSonic] Audio committed');
  }

  /**
   * Request a response from the provider.
   * Nova Sonic automatically responds after content ends.
   */
  requestResponse(): void {
    // Nova Sonic automatically generates responses after contentEnd
    // We need to start a new audio content for the next turn
    if (!this.isReady() || !this.session) {
      logger.warn('[NovaSonic] Cannot request response: not ready');
      return;
    }

    // Start new audio content for next user turn
    this.sendEvent({
      event: {
        contentStart: {
          promptName: this.session.promptName,
          contentName: this.session.audioContentId,
          type: 'AUDIO',
          interactive: true,
          role: 'USER',
          audioInputConfiguration: DEFAULT_CONFIG.audio.input,
        },
      },
    });

    logger.debug('[NovaSonic] Response requested, new audio content started');
  }

  /**
   * Disconnect from the provider.
   */
  disconnect(): void {
    this.clearConnectionTimeout();

    if (this.session?.isActive) {
      this.session.isActive = false;

      // Send end events
      this.sendEvent({
        event: {
          promptEnd: {
            promptName: this.session.promptName,
          },
        },
      });

      this.sendEvent({
        event: {
          sessionEnd: {},
        },
      });

      this.session.closeSignal.next();
    }

    this.session = null;
    this.sessionId = null;
    this.state = 'disconnected';
    this.bedrockClient = null;

    this.emit('close');
    logger.debug('[NovaSonic] Disconnected');
  }

  /**
   * Check if ready.
   */
  isReady(): boolean {
    return this.state === 'ready';
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.state === 'connected' || this.state === 'ready';
  }

  /**
   * Get connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get session ID.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get config.
   */
  getConfig(): VoiceProviderConfig {
    return this.config;
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * Send a system prompt as text.
   */
  private async sendSystemPrompt(text: string): Promise<void> {
    if (!this.session) return;

    const textContentId = crypto.randomUUID();

    await this.sendEvent({
      event: {
        contentStart: {
          promptName: this.session.promptName,
          contentName: textContentId,
          type: 'TEXT',
          interactive: false,
          role: 'SYSTEM',
          textInputConfiguration: DEFAULT_CONFIG.text,
        },
      },
    });

    await this.sendEvent({
      event: {
        textInput: {
          promptName: this.session.promptName,
          contentName: textContentId,
          content: text,
        },
      },
    });

    await this.sendEvent({
      event: {
        contentEnd: {
          promptName: this.session.promptName,
          contentName: textContentId,
        },
      },
    });
  }

  /**
   * Send an event to the queue.
   */
  private async sendEvent(event: NovaSonicEvent): Promise<void> {
    if (!this.session?.isActive) {
      logger.warn('[NovaSonic] Cannot send event: session not active');
      return;
    }

    const eventType = Object.keys(event.event)[0];
    if (eventType !== 'audioInput') {
      logger.debug('[NovaSonic] Sending event:', { type: eventType });
    }

    this.session.queue.push(event);
    this.session.queueSignal.next();
  }

  /**
   * Create async iterable for bidirectional stream.
   */
  private createAsyncIterable(): AsyncIterable<{ chunk: { bytes: Uint8Array } }> {
    const session = this.session!;

    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (!session.isActive) {
            return { done: true, value: undefined };
          }

          if (session.queue.length === 0) {
            try {
              await Promise.race([
                firstValueFrom(session.queueSignal.pipe(take(1))),
                firstValueFrom(session.closeSignal.pipe(take(1))),
              ]);
            } catch {
              return { done: true, value: undefined };
            }
          }

          const nextEvent = session.queue.shift();
          if (nextEvent) {
            return {
              value: {
                chunk: {
                  bytes: new TextEncoder().encode(JSON.stringify(nextEvent)),
                },
              },
              done: false,
            };
          }

          return { done: true, value: undefined };
        },
      }),
    };
  }

  /**
   * Process response stream in background.
   */
  private async processResponses(): Promise<void> {
    if (!this.responsePromise) return;

    try {
      const response = await this.responsePromise;

      if (response.body) {
        for await (const event of response.body) {
          if (!this.session?.isActive) break;

          if (event.chunk?.bytes) {
            const data = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
            this.handleNovaEvent(data);
          }
        }
      }
    } catch (error) {
      logger.error('[NovaSonic] Response processing error:', { error });
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle Nova Sonic event and emit VoiceConnection events.
   */
  private handleNovaEvent(data: { event?: Record<string, unknown> }): void {
    if (!data.event) return;

    const eventType = Object.keys(data.event)[0];
    const eventData = data.event[eventType] as Record<string, unknown>;

    switch (eventType) {
      case 'textOutput': {
        const role = eventData.role as string;
        const content = eventData.content as string;

        if (role === 'ASSISTANT' && content) {
          this.emit('transcript_delta', content);
        } else if (role === 'USER' && content) {
          this.emit('input_transcript', content);
        }
        break;
      }

      case 'audioOutput': {
        const audioContent = eventData.content as string;
        if (audioContent) {
          // Resample from 16kHz to 24kHz
          const novaBuffer = base64ToBuffer(audioContent);
          const resampledBuffer = resampleAudio(
            novaBuffer,
            NOVA_OUTPUT_SAMPLE_RATE,
            TARGET_SAMPLE_RATE,
          );

          // Calculate duration
          const durationMs = (resampledBuffer.length / 2 / TARGET_SAMPLE_RATE) * 1000;

          this.emit('audio_delta', {
            data: bufferToBase64(resampledBuffer),
            timestamp: this.cumulativeAudioPositionMs,
            duration: durationMs,
            format: 'pcm16' as AudioFormat,
            sampleRate: TARGET_SAMPLE_RATE,
          });

          this.cumulativeAudioPositionMs += durationMs;
        }
        break;
      }

      case 'contentEnd': {
        const stopReason = eventData.stopReason as string;
        if (stopReason === 'END_TURN') {
          this.emit('audio_done');
          this.emit('transcript_done', ''); // Transcript was sent via textOutput
          this.emit('speech_stopped');
        }
        break;
      }

      default:
        logger.debug('[NovaSonic] Unhandled event:', { type: eventType });
    }
  }

  /**
   * Map voice name to Nova Sonic voice ID.
   */
  private mapVoice(voice?: string): NovaVoice {
    if (!voice) return 'tiffany';

    const lowerVoice = voice.toLowerCase();
    if (NOVA_VOICES.includes(lowerVoice as NovaVoice)) {
      return lowerVoice as NovaVoice;
    }

    // Map OpenAI-style voices to Nova equivalents
    const voiceMap: Record<string, NovaVoice> = {
      alloy: 'tiffany',
      echo: 'matthew',
      shimmer: 'amy',
      nova: 'tiffany',
      onyx: 'matthew',
      fable: 'amy',
    };

    return voiceMap[lowerVoice] || 'tiffany';
  }

  /**
   * Get AWS region.
   */
  private getRegion(): string {
    return (
      (this.config as { region?: string }).region ||
      getEnvString('AWS_REGION') ||
      getEnvString('AWS_DEFAULT_REGION') ||
      'us-east-1'
    );
  }

  /**
   * Set connection timeout.
   */
  private setConnectionTimeout(ms: number): void {
    this.clearConnectionTimeout();
    this.connectionTimeout = setTimeout(() => {
      if (this.state === 'connecting') {
        this.state = 'error';
        this.emit('error', new Error('Connection timeout'));
        this.disconnect();
      }
    }, ms);
  }

  /**
   * Clear connection timeout.
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TYPED EVENT EMITTER METHODS
  // ─────────────────────────────────────────────────────────────

  emit<K extends keyof VoiceConnectionEvents>(
    event: K,
    ...args: Parameters<VoiceConnectionEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof VoiceConnectionEvents>(event: K, listener: VoiceConnectionEvents[K]): this {
    return super.on(event, listener);
  }

  once<K extends keyof VoiceConnectionEvents>(event: K, listener: VoiceConnectionEvents[K]): this {
    return super.once(event, listener);
  }

  off<K extends keyof VoiceConnectionEvents>(event: K, listener: VoiceConnectionEvents[K]): this {
    return super.off(event, listener);
  }
}
