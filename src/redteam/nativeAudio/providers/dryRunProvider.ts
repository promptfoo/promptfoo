import { randomUUID } from 'node:crypto';
import { ensureWav } from '../audio';
import type { ProviderEvent } from '../types';
import type { ModelAudioHandler, ModelTranscriptHandler, ProviderAdapter } from './provider';

export class DryRunProvider implements ProviderAdapter {
  readonly name = 'dry-run' as const;

  private audioHandler?: ModelAudioHandler;

  private transcriptHandler?: ModelTranscriptHandler;

  private events: ProviderEvent[] = [];

  async connect(sessionId: string): Promise<void> {
    this.events.push({
      type: 'info',
      message: 'connect',
      data: { sessionId },
      timestampMs: Date.now(),
    });
  }

  async sendUserAudio(audio: Buffer, turn: number): Promise<void> {
    const wav = ensureWav(audio);
    const transcript = `Echo turn ${turn} (${randomUUID().slice(0, 6)})`;
    this.transcriptHandler?.(transcript, turn);
    this.audioHandler?.(wav, turn);
    this.events.push({
      type: 'info',
      message: 'sendUserAudio',
      turn,
      data: { bytes: wav.length },
      timestampMs: Date.now(),
    });
  }

  async sendAttackerPrompt(prompt: string, turn: number): Promise<void> {
    this.events.push({
      type: 'info',
      message: 'sendAttackerPrompt',
      data: { prompt },
      turn,
      timestampMs: Date.now(),
    });
  }

  async completeTurn(turn: number): Promise<void> {
    this.events.push({
      type: 'info',
      message: 'completeTurn',
      turn,
      timestampMs: Date.now(),
    });
  }

  async close(): Promise<void> {
    this.events.push({
      type: 'info',
      message: 'close',
      timestampMs: Date.now(),
    });
  }

  onModelAudio(handler: ModelAudioHandler): void {
    this.audioHandler = handler;
  }

  onModelTranscript(handler: ModelTranscriptHandler): void {
    this.transcriptHandler = handler;
  }

  drainEvents(): ProviderEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }
}
