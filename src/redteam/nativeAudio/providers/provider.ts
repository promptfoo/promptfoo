import type { ProviderEvent } from '../types';

export type ModelTranscriptHandler = (text: string, turn: number) => void;
export type ModelAudioHandler = (audio: Buffer, turn: number) => void;

export interface ProviderAdapter {
  name: string;
  connect(sessionId: string): Promise<void>;
  sendUserAudio(audio: Buffer, turn: number): Promise<void>;
  sendAttackerPrompt?(prompt: string, turn: number): Promise<void>;
  completeTurn(turn: number): Promise<void>;
  close(): Promise<void>;
  onModelTranscript(handler: ModelTranscriptHandler): void;
  onModelAudio(handler: ModelAudioHandler): void;
  drainEvents(): ProviderEvent[];
}
