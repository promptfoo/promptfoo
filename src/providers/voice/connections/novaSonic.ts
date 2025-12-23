/**
 * Nova Sonic Voice Connection
 *
 * Adapter for AWS Bedrock Nova Sonic bidirectional streaming API.
 * Maps the AWS SDK streaming pattern to the VoiceConnection interface.
 *
 * Key differences from WebSocket-based providers:
 * - Uses AWS SDK InvokeModelWithBidirectionalStreamCommand
 * - Queue-based async iterable for sending events
 * - Uses 16kHz input sample rate, 24kHz output (resampled from Nova's 16kHz)
 * - Requires silence after audio input to trigger VAD-based turn detection
 *
 * Based on analysis of haizelabs/spoken library patterns.
 */

import { EventEmitter } from 'events';

import { firstValueFrom, Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { base64ToBuffer, bufferToBase64 } from '../audioBuffer';

import type { AudioChunk, AudioFormat, VoiceConnectionEvents, VoiceProviderConfig } from '../types';

// Nova Sonic specific constants
const DEFAULT_MODEL = 'amazon.nova-sonic-v1:0';
const NOVA_INPUT_SAMPLE_RATE = 16000; // Nova Sonic expects 16kHz input (not 8kHz!)
const NOVA_OUTPUT_SAMPLE_RATE = 24000; // Nova outputs at 24kHz (was incorrectly 16kHz)
const TARGET_SAMPLE_RATE = 24000; // What other providers use
const CONNECTION_TIMEOUT_MS = 30000;

// VAD trigger configuration - send silence to trigger turn detection
const VAD_SILENCE_CHUNKS = 50; // Number of silence chunks to send
const VAD_SILENCE_CHUNK_SIZE = 1024; // Bytes per chunk (32ms at 16kHz)
const VAD_CHUNK_DELAY_MS = 10; // Delay between chunks

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
  audioContentActive: boolean; // Track if audio content block is currently open
  iteratorStarted: boolean; // Track if async iterator has started being consumed
  promptEnded: boolean; // Track if promptEnd has been sent
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
function resampleAudio(inputBuffer: Buffer, inputRate: number, outputRate: number): Buffer {
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
    const sample1 =
      srcIndexFloor * 2 + 1 < inputBuffer.length ? inputBuffer.readInt16LE(srcIndexFloor * 2) : 0;
    const sample2 =
      srcIndexCeil * 2 + 1 < inputBuffer.length
        ? inputBuffer.readInt16LE(srcIndexCeil * 2)
        : sample1;

    // Linear interpolation
    const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
    outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
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
  private hasReceivedAudio: boolean = false; // Track if we've received any audio
  private accumulatedTranscript: string = ''; // Accumulate transcript from textOutput events

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
      audioContentActive: false, // Will be set true after contentStart
      iteratorStarted: false, // Will be set true when iterator starts
      promptEnded: false, // Will be set true after promptEnd is sent
    };

    // Queue all initial events BEFORE starting the stream.
    // Nova Sonic times out if events aren't available immediately.
    const voice = this.mapVoice(this.config.voice);

    // Queue session start
    this.session.queue.push({
      event: {
        sessionStart: {
          inferenceConfiguration: DEFAULT_CONFIG.inference,
        },
      },
    });

    // Queue prompt start
    this.session.queue.push({
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

    // Queue system prompt - Nova Sonic REQUIRES a SYSTEM role content first
    const textContentId = crypto.randomUUID();
    const basePrompt = this.config.instructions || 'You are a helpful voice assistant.';
    // Explicitly request English output to prevent language switching
    const systemPrompt = `You must always respond in English. ${basePrompt}`;
    this.session.queue.push({
      event: {
        contentStart: {
          promptName: this.session.promptName,
          contentName: textContentId,
          type: 'TEXT',
          interactive: true, // Use interactive: true like spoken library
          role: 'SYSTEM',
          textInputConfiguration: DEFAULT_CONFIG.text,
        },
      },
    });
    this.session.queue.push({
      event: {
        textInput: {
          promptName: this.session.promptName,
          contentName: textContentId,
          content: systemPrompt,
        },
      },
    });
    this.session.queue.push({
      event: {
        contentEnd: {
          promptName: this.session.promptName,
          contentName: textContentId,
        },
      },
    });

    // Queue audio content start (interactive: true for ongoing conversation)
    this.session.queue.push({
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
    this.session.audioContentActive = true;

    // Send some initial silence to establish the stream
    // At 16kHz sample rate, 16-bit samples: 16000 * 2 = 32000 bytes/sec, so 3200 bytes = 100ms
    const silentBuffer = Buffer.alloc(3200, 0); // 100ms at 16kHz
    this.session.queue.push({
      event: {
        audioInput: {
          promptName: this.session.promptName,
          contentName: this.session.audioContentId,
          content: silentBuffer.toString('base64'),
        },
      },
    });

    // Create a flag to track when iterator starts being consumed
    this.session.iteratorStarted = false;

    // Start the bidirectional stream with events already queued
    const { InvokeModelWithBidirectionalStreamCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );

    this.responsePromise = this.bedrockClient.send(
      new InvokeModelWithBidirectionalStreamCommand({
        modelId: this.model,
        body: this.createAsyncIterable(),
      }),
    );

    // Start processing responses in background - this also triggers input consumption
    this.processResponses();

    // Wait for the iterator to actually start being consumed by AWS SDK
    // This ensures events are being sent before we return
    const startTime = Date.now();
    while (!this.session.iteratorStarted && Date.now() - startTime < 5000) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    if (!this.session.iteratorStarted) {
      logger.warn('[NovaSonic] Iterator did not start within timeout');
    }

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

    // Mark that we've received audio input
    this.hasReceivedAudio = true;

    // Make sure audio content is started
    if (!this.session.audioContentActive) {
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
      this.session.audioContentActive = true;
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
   * Sends silence chunks to trigger Nova Sonic's VAD-based turn detection.
   */
  async commitAudio(): Promise<void> {
    if (!this.isReady() || !this.session) {
      logger.warn('[NovaSonic] Cannot commit audio: not ready');
      return;
    }

    // Only proceed if content is currently active
    if (!this.session.audioContentActive) {
      logger.debug('[NovaSonic] Audio content not active, skipping commit');
      return;
    }

    // Send silence chunks to trigger VAD turn detection
    // This is how Nova Sonic detects end of user speech
    await this.sendSilenceForVAD();

    logger.debug('[NovaSonic] Audio committed with VAD silence');
  }

  /**
   * Send silence chunks to trigger VAD-based turn detection.
   * Nova Sonic uses VAD to detect when user stops speaking.
   * Based on haizelabs/spoken library approach.
   */
  private async sendSilenceForVAD(): Promise<void> {
    if (!this.session?.isActive || !this.session.audioContentActive) {
      return;
    }

    const silenceChunk = Buffer.alloc(VAD_SILENCE_CHUNK_SIZE, 0).toString('base64');

    for (let i = 0; i < VAD_SILENCE_CHUNKS; i++) {
      if (!this.session?.isActive) {
        break;
      }

      this.sendEvent({
        event: {
          audioInput: {
            promptName: this.session.promptName,
            contentName: this.session.audioContentId,
            content: silenceChunk,
          },
        },
      });

      // Small delay between chunks to simulate real-time silence
      await new Promise((resolve) => setTimeout(resolve, VAD_CHUNK_DELAY_MS));
    }

    logger.debug('[NovaSonic] Sent VAD silence chunks', { count: VAD_SILENCE_CHUNKS });
  }

  /**
   * Request a response from the provider.
   * Nova Sonic requires actual audio input with VAD detection to trigger responses.
   * It does not support "agent speaks first" mode without user audio.
   *
   * Unlike other providers, we DON'T end the content here - Nova Sonic uses VAD
   * to detect when the user stops speaking and triggers the response automatically.
   * We just send silence to help trigger the VAD detection.
   */
  async requestResponse(): Promise<void> {
    if (!this.isReady() || !this.session) {
      logger.warn('[NovaSonic] Cannot request response: not ready');
      return;
    }

    // Nova Sonic requires audio input to generate responses
    // If no audio has been received, caller should send audio first
    if (!this.hasReceivedAudio) {
      logger.debug(
        '[NovaSonic] requestResponse called but no audio received - Nova Sonic requires audio input',
      );
      return;
    }

    // Send silence to trigger VAD - Nova Sonic will detect end of speech
    // and generate a response. We don't end the content here.
    if (this.session.audioContentActive) {
      await this.sendSilenceForVAD();
    }

    logger.debug('[NovaSonic] Response requested via VAD silence');
  }

  /**
   * Disconnect from the provider.
   */
  disconnect(): void {
    this.clearConnectionTimeout();

    if (this.session?.isActive) {
      this.session.isActive = false;

      // Only send promptEnd if it hasn't been sent yet
      if (!this.session.promptEnded) {
        this.sendEvent({
          event: {
            promptEnd: {
              promptName: this.session.promptName,
            },
          },
        });
      }

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
   * Create async iterable for bidirectional stream using async generator.
   * AWS SDK requires an async generator function pattern for proper streaming.
   * Nova Sonic requires continuous input to avoid timeout.
   */
  private createAsyncIterable(): AsyncIterable<{ chunk: { bytes: Uint8Array } }> {
    const session = this.session!;

    // Keep-alive audio chunk (32ms of silence at 16kHz = 1024 bytes)
    const keepAliveChunk = Buffer.alloc(1024, 0).toString('base64');

    return {
      [Symbol.asyncIterator]: async function* () {
        session.iteratorStarted = true;

        let lastKeepAlive = Date.now();
        const KEEP_ALIVE_INTERVAL_MS = 100; // Send keep-alive every 100ms if idle

        while (session.isActive) {
          // Yield all queued events first
          while (session.queue.length > 0 && session.isActive) {
            const nextEvent = session.queue.shift();
            if (nextEvent) {
              yield {
                chunk: {
                  bytes: new TextEncoder().encode(JSON.stringify(nextEvent)),
                },
              };
              lastKeepAlive = Date.now();
            }
          }

          // If queue is empty, wait briefly for new events or send keep-alive
          if (session.queue.length === 0 && session.isActive) {
            try {
              // Wait for signal with short timeout
              await Promise.race([
                firstValueFrom(session.queueSignal.pipe(take(1))),
                firstValueFrom(session.closeSignal.pipe(take(1))),
                new Promise((resolve) => setTimeout(resolve, 50)),
              ]);
            } catch {
              // Ignore errors from race
            }

            // If audio content is active and we haven't sent anything recently, send keep-alive
            if (
              session.isActive &&
              session.audioContentActive &&
              session.queue.length === 0 &&
              Date.now() - lastKeepAlive > KEEP_ALIVE_INTERVAL_MS
            ) {
              yield {
                chunk: {
                  bytes: new TextEncoder().encode(
                    JSON.stringify({
                      event: {
                        audioInput: {
                          promptName: session.promptName,
                          contentName: session.audioContentId,
                          content: keepAliveChunk,
                        },
                      },
                    }),
                  ),
                },
              };
              lastKeepAlive = Date.now();
            }
          }
        }
      },
    };
  }

  /**
   * Process response stream in background.
   */
  private async processResponses(): Promise<void> {
    if (!this.responsePromise) {
      return;
    }

    try {
      const response = await this.responsePromise;

      if (response.body) {
        for await (const event of response.body) {
          if (!this.session?.isActive) {
            break;
          }

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
    if (!data.event) {
      logger.debug('[NovaSonic] Received non-event data:', { data });
      return;
    }

    const eventType = Object.keys(data.event)[0];
    logger.debug('[NovaSonic] Processing event:', { type: eventType });
    const eventData = data.event[eventType] as Record<string, unknown>;

    switch (eventType) {
      case 'textOutput': {
        const role = eventData.role as string;
        const content = eventData.content as string;

        if (role === 'ASSISTANT' && content) {
          // Accumulate transcript for when turn ends
          this.accumulatedTranscript += content;
          this.emit('transcript_delta', content);
        } else if (role === 'USER' && content) {
          this.emit('input_transcript', content);
        }
        break;
      }

      case 'audioOutput': {
        const audioContent = eventData.content as string;
        if (audioContent) {
          // Nova Sonic outputs at 24kHz, same as our target - no resampling needed
          // but we keep the resample call for flexibility if rates change
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
          // Emit accumulated transcript and clear for next turn
          this.emit('transcript_done', this.accumulatedTranscript);
          this.accumulatedTranscript = '';
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
    if (!voice) {
      return 'tiffany';
    }

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
