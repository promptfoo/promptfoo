import WebSocket from 'ws';
import logger from '../../../logger';
import { describeWav, ensureWav, stripWavHeaderToPcm16 } from '../audio';

import type { ProviderEvent } from '../types';
import type { ModelAudioHandler, ModelTranscriptHandler, ProviderAdapter } from './provider';

type PendingResponse = {
  text: string[];
  audioChunks: Buffer[];
};

const MODEL = 'gpt-4o-realtime-preview-2024-12-17';
const WS_URL = `wss://api.openai.com/v1/realtime?model=${MODEL}`;

export class AttackerRealtimeProvider implements ProviderAdapter {
  readonly name = 'attacker-realtime' as const;

  private audioHandler?: ModelAudioHandler;

  private transcriptHandler?: ModelTranscriptHandler;

  private events: ProviderEvent[] = [];

  private ws?: WebSocket;

  private pending: PendingResponse = { text: [], audioChunks: [] };

  private instructions: string;

  private readonly voice: string;

  private currentTurn = 0;

  private pendingTurnResolvers: Map<
    number,
    { resolve: () => void; reject: (err: unknown) => void; timeout: NodeJS.Timeout }
  > = new Map();

  private pendingFlushTimers: Map<number, NodeJS.Timeout> = new Map();

  private activeResponse = false;

  private sessionReady = false;

  private lastAppendBytes = 0;

  constructor(private opts: { apiKey?: string; systemPrompt: string; voice?: string }) {
    this.instructions = opts.systemPrompt;
    this.voice = opts.voice || 'alloy';
  }

  async connect(sessionId: string) {
    if (!this.opts.apiKey) {
      throw new Error('OPENAI_API_KEY is required for the Attacker Realtime adapter');
    }
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });
      this.ws = ws;

      ws.on('open', () => {
        this.events.push({
          type: 'info',
          message: 'connect',
          data: { sessionId, role: 'attacker' },
          timestampMs: Date.now(),
        });
        logger.info({
          message: 'Connected to OpenAI Realtime as attacker',
          sessionId,
          model: MODEL,
        });
        this.sendSessionUpdate();
        resolve();
      });

      ws.on('error', (err) => {
        this.events.push({
          type: 'error',
          message: 'websocket-error',
          data: { err },
          timestampMs: Date.now(),
        });
        reject(err);
      });

      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString()) as { type: string; [key: string]: unknown };
          this.handleEvent(event);
        } catch (error) {
          logger.error({
            message: 'Failed to parse realtime event',
            error,
            role: 'attacker',
          });
        }
      });
    });

    // Wait for session to be fully initialized before returning
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  async sendUserAudio(audio: Buffer, turn: number) {
    if (!this.ws) {
      throw new Error('WebSocket not connected');
    }
    // Wait for at least one session.update to apply (after session.created).
    if (!this.sessionReady) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.currentTurn = turn;
    this.pending = { text: [], audioChunks: [] };

    this.enqueueEvent({
      type: 'info',
      message: 'sendUserAudio (from target)',
      turn,
      timestampMs: Date.now(),
    });

    this.sendSessionUpdate();

    let wavAudio = ensureWav(audio);
    if (wavAudio.length <= 44) {
      const minSamples = Math.max(Math.floor((24000 / 5) * 2), 1);
      wavAudio = ensureWav(Buffer.alloc(minSamples));
      logger.warn({
        message: 'Target audio was empty; sending fallback silence chunk',
        turn,
        role: 'attacker',
      });
    }
    const pcmAudio = stripWavHeaderToPcm16(wavAudio);
    const audioB64 = pcmAudio.toString('base64');

    // Check if PCM has actual audio data (not all zeros)
    let nonZeroSamples = 0;
    for (let i = 0; i < Math.min(pcmAudio.length, 1000); i += 2) {
      const sample = pcmAudio.readInt16LE(i);
      if (sample !== 0) {
        nonZeroSamples++;
      }
    }
    const hasAudioData = nonZeroSamples > 10;

    const wavInfo = describeWav(wavAudio);
    this.enqueueEvent({
      type: 'info',
      message: 'input_audio_buffer.append (target audio to attacker)',
      data: {
        wavTotalBytes: wavAudio.length,
        pcmBytes: pcmAudio.length,
        base64Length: audioB64.length,
        wavInfo,
        pcmDurationSec: pcmAudio.length / (24000 * 2),
        hasAudioData,
        nonZeroSamples,
      },
      turn,
      timestampMs: Date.now(),
    });
    logger.info({
      message: 'Sending target audio to attacker',
      turn,
      wavTotalBytes: wavAudio.length,
      pcmBytes: pcmAudio.length,
      base64Length: audioB64.length,
      sentPcmDurationSec: pcmAudio.length / (24000 * 2),
      hasAudioData,
      nonZeroSamples,
    });

    // Send audio in chunks to avoid overwhelming the buffer
    const CHUNK_SIZE = 48000; // 1 second of audio (24kHz * 2 bytes)
    let offset = 0;

    while (offset < pcmAudio.length) {
      const chunk = pcmAudio.subarray(offset, Math.min(offset + CHUNK_SIZE, pcmAudio.length));
      const chunkB64 = chunk.toString('base64');

      this.ws.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: chunkB64,
        }),
      );

      logger.debug({
        message: 'Sent audio chunk to attacker',
        turn,
        chunkBytes: chunk.length,
        totalOffset: offset + chunk.length,
        totalBytes: pcmAudio.length,
      });

      offset += chunk.length;

      // Small delay between chunks
      if (offset < pcmAudio.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    this.lastAppendBytes = pcmAudio.length;

    // Give audio chunks time to be received
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Commit the audio buffer
    this.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.commit',
      }),
    );
    this.enqueueEvent({
      type: 'info',
      message: 'input_audio_buffer.commit',
      turn,
      timestampMs: Date.now(),
    });

    // Wait for commit to be processed
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Ensure only one response is active at a time
    await this.waitForIdleResponse();

    this.activeResponse = true;
    this.ws.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          output_audio_format: 'pcm16',
        },
      }),
    );
    this.enqueueEvent({
      type: 'info',
      message: 'response.create (attacker response)',
      turn,
      timestampMs: Date.now(),
    });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingTurnResolvers.delete(turn);
        this.activeResponse = false;
        resolve();
      }, 20000);
      this.pendingTurnResolvers.set(turn, { resolve, reject, timeout });
    });
  }

  /**
   * Send text input to the attacker to read aloud
   * This sends the attack text as user input, then triggers a response
   */
  async sendTextInput(text: string, turn: number): Promise<void> {
    if (!this.ws) {
      throw new Error('WebSocket not connected');
    }

    // Wait for session to be ready
    if (!this.sessionReady) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.currentTurn = turn;
    this.pending = { text: [], audioChunks: [] };

    // Add text as user input
    this.ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: text,
            },
          ],
        },
      }),
    );

    this.enqueueEvent({
      type: 'info',
      message: 'text_input_sent',
      data: { text },
      turn,
      timestampMs: Date.now(),
    });

    logger.info({
      message: 'Sent text input to attacker',
      turn,
      textLength: text.length,
    });

    // Wait a bit for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Ensure only one response is active at a time
    await this.waitForIdleResponse();

    this.activeResponse = true;

    // Trigger response - include both text and audio so model can process text input
    this.ws.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          output_audio_format: 'pcm16',
        },
      }),
    );

    this.enqueueEvent({
      type: 'info',
      message: 'response.create (attacker reading text)',
      turn,
      timestampMs: Date.now(),
    });

    // Wait for response to complete
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingTurnResolvers.delete(turn);
        this.activeResponse = false;
        resolve();
      }, 20000);
      this.pendingTurnResolvers.set(turn, { resolve, reject, timeout });
    });
  }

  async completeTurn(turn: number) {
    this.enqueueEvent({
      type: 'info',
      message: 'completeTurn',
      turn,
      timestampMs: Date.now(),
    });
  }

  async close() {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.pendingTurnResolvers.forEach(({ resolve, timeout }) => {
      clearTimeout(timeout);
      resolve();
    });
    this.pendingTurnResolvers.clear();
    this.enqueueEvent({
      type: 'info',
      message: 'close',
      timestampMs: Date.now(),
    });
    logger.info({
      message: 'Closed attacker Realtime connection',
    });
  }

  onModelAudio(handler: ModelAudioHandler) {
    this.audioHandler = handler;
  }

  onModelTranscript(handler: ModelTranscriptHandler) {
    this.transcriptHandler = handler;
  }

  drainEvents() {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  private enqueueEvent(event: ProviderEvent) {
    this.events.push(event);
  }

  private sendSessionUpdate() {
    if (!this.ws) {
      return;
    }
    const session = {
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: {
        model: 'gpt-4o-mini-transcribe',
      },
      // Enable VAD for the attacker as well
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        create_response: false,
      },
      instructions: this.instructions,
      voice: this.voice,
    };
    this.enqueueEvent({
      type: 'info',
      message: 'session.update (attacker)',
      data: { instructions: this.instructions, turn_detection: session.turn_detection },
      timestampMs: Date.now(),
    });
    this.ws.send(
      JSON.stringify({
        type: 'session.update',
        session,
      }),
    );
  }

  private flushPending(turn: number) {
    const transcript = this.pending.text.join('');
    const audio = Buffer.concat(this.pending.audioChunks);

    if (transcript && this.transcriptHandler) {
      this.transcriptHandler(transcript, turn);
      this.enqueueEvent({
        type: 'transcript',
        message: transcript,
        turn,
        timestampMs: Date.now(),
      });
    }
    if (audio.length && this.audioHandler) {
      this.audioHandler(audio, turn);
      this.enqueueEvent({
        type: 'audio',
        data: { bytes: audio.length },
        turn,
        timestampMs: Date.now(),
      });
    }
    this.pending = { text: [], audioChunks: [] };
    const timer = this.pendingFlushTimers.get(turn);
    if (timer) {
      clearTimeout(timer);
      this.pendingFlushTimers.delete(turn);
    }
  }

  private handleEvent(event: { type: string; [key: string]: any }) {
    switch (event.type) {
      case 'session.created':
        // Session was created with defaults; immediately reapply our settings.
        this.sendSessionUpdate();
        this.sessionReady = true;
        break;
      case 'response.output_text.delta':
        if (typeof event.delta === 'string') {
          this.pending.text.push(event.delta);
        } else if (Array.isArray(event.delta)) {
          this.pending.text.push(event.delta.join(''));
        }
        break;
      case 'response.output_audio.delta':
        if (typeof event.delta === 'string') {
          this.pending.audioChunks.push(Buffer.from(event.delta, 'base64'));
        }
        if (this.pendingFlushTimers.has(this.currentTurn)) {
          clearTimeout(this.pendingFlushTimers.get(this.currentTurn) as NodeJS.Timeout);
        }
        this.pendingFlushTimers.set(
          this.currentTurn,
          setTimeout(() => this.flushPending(this.currentTurn), 1500),
        );
        break;
      case 'response.audio_transcript.delta':
        if (typeof event.delta === 'string') {
          this.pending.text.push(event.delta);
        }
        break;
      case 'response.audio.delta':
        if (typeof event.delta === 'string') {
          this.pending.audioChunks.push(Buffer.from(event.delta, 'base64'));
        }
        break;
      case 'response.done':
      case 'response.output_audio.done':
      case 'response.output_text.done':
      case 'response.completed':
        this.activeResponse = false;
        this.flushPending(this.currentTurn);
        this.resolveTurn(this.currentTurn);
        break;
      case 'response.error':
      case 'error': {
        const code = event?.error?.code || event?.code;
        if (code === 'input_audio_buffer_commit_empty') {
          logger.warn({
            message: 'Attacker Realtime provider reported empty audio buffer; continuing turn',
            turn: this.currentTurn,
            code,
            lastAppendBytes: this.lastAppendBytes,
          });
          this.activeResponse = false;
          this.flushPending(this.currentTurn);
          this.resolveTurn(this.currentTurn);
          break;
        }
        this.activeResponse = false;
        this.rejectTurn(this.currentTurn, event);
        break;
      }
      default:
        this.enqueueEvent({
          type: 'info',
          message: event.type,
          data: event,
          timestampMs: Date.now(),
        });
    }
  }

  private resolveTurn(turn: number) {
    const pending = this.pendingTurnResolvers.get(turn);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve();
      this.pendingTurnResolvers.delete(turn);
    }
  }

  private rejectTurn(turn: number, err: unknown) {
    const pending = this.pendingTurnResolvers.get(turn);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.reject(err);
      this.pendingTurnResolvers.delete(turn);
    }
  }

  private waitForIdleResponse(): Promise<void> {
    if (!this.activeResponse) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const check = () => {
        if (this.activeResponse) {
          setTimeout(check, 50);
        } else {
          resolve();
        }
      };
      check();
    });
  }
}
