/**
 * Turn Detection
 *
 * Handles turn detection logic for voice conversations.
 * Supports server VAD, silence-based, and hybrid detection modes.
 */

import { EventEmitter } from 'events';

import { base64ToBuffer } from './audioBuffer';
import { DEFAULT_TURN_DETECTION } from './types';

import type { AudioChunk, TurnDetectionConfig } from './types';

/**
 * Events emitted by TurnDetector.
 */
export interface TurnDetectorEvents {
  /** Speech has started */
  turn_start: () => void;
  /** Turn is complete (silence threshold met) */
  turn_end: () => void;
  /** Turn exceeded maximum duration */
  turn_timeout: () => void;
}

/**
 * Handles turn detection logic for voice conversations.
 *
 * Supports three modes:
 * - `server_vad`: Relies on the voice provider's VAD events
 * - `silence`: Detects silence locally using audio amplitude
 * - `hybrid`: Uses server VAD with local silence detection as fallback
 */
export class TurnDetector extends EventEmitter {
  private config: TurnDetectionConfig;
  private silenceTimer: NodeJS.Timeout | null = null;
  private maxDurationTimer: NodeJS.Timeout | null = null;
  private turnStartTime: number | null = null;
  private isSpeaking: boolean = false;
  private silenceDetector: SilenceDetector;

  constructor(config: Partial<TurnDetectionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_TURN_DETECTION, ...config };
    this.silenceDetector = new SilenceDetector(this.config.vadThreshold);
  }

  /**
   * Called when speech is detected (from server VAD).
   */
  onSpeechStart(): void {
    if (this.isSpeaking) {
      return;
    }

    this.isSpeaking = true;
    this.turnStartTime = Date.now();

    // Clear any existing silence timer
    this.clearSilenceTimer();

    // Set max duration timer
    this.setMaxDurationTimer();

    this.emit('turn_start');
  }

  /**
   * Called when silence is detected (from server VAD).
   */
  onSpeechEnd(): void {
    if (!this.isSpeaking) {
      return;
    }

    // Check minimum turn duration
    if (this.turnStartTime !== null) {
      const duration = Date.now() - this.turnStartTime;
      if (duration < this.config.minTurnDurationMs) {
        // Too short, don't end the turn yet
        return;
      }
    }

    this.endTurn();
  }

  /**
   * Called on each audio chunk (for local silence detection).
   * Only used in 'silence' or 'hybrid' mode.
   */
  onAudioChunk(chunk: AudioChunk): void {
    if (this.config.mode === 'server_vad') {
      // In server_vad mode, we don't do local detection
      return;
    }

    const buffer = base64ToBuffer(chunk.data);
    const isSilent = this.silenceDetector.isSilent(buffer);

    if (!isSilent) {
      // Speech detected
      if (!this.isSpeaking) {
        this.onSpeechStart();
      }
      // Reset silence timer
      this.resetSilenceTimer();
    } else if (this.isSpeaking) {
      // Silence detected while speaking - start silence timer if not already
      if (!this.silenceTimer) {
        this.startSilenceTimer();
      }
    }
  }

  /**
   * Force end of turn (e.g., max duration exceeded).
   */
  forceEndTurn(): void {
    if (this.isSpeaking) {
      this.emit('turn_timeout');
      this.endTurn();
    }
  }

  /**
   * Reset the detector state.
   */
  reset(): void {
    this.clearSilenceTimer();
    this.clearMaxDurationTimer();
    this.isSpeaking = false;
    this.turnStartTime = null;
  }

  /**
   * Check if currently in a turn (speaking).
   */
  isInTurn(): boolean {
    return this.isSpeaking;
  }

  /**
   * Get the current turn duration in milliseconds.
   */
  getTurnDuration(): number {
    if (this.turnStartTime === null) {
      return 0;
    }
    return Date.now() - this.turnStartTime;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<TurnDetectionConfig>): void {
    this.config = { ...this.config, ...config };
    this.silenceDetector = new SilenceDetector(this.config.vadThreshold);
  }

  private endTurn(): void {
    this.clearSilenceTimer();
    this.clearMaxDurationTimer();
    this.isSpeaking = false;
    this.turnStartTime = null;
    this.emit('turn_end');
  }

  private startSilenceTimer(): void {
    this.silenceTimer = setTimeout(() => {
      this.onSpeechEnd();
    }, this.config.silenceThresholdMs);
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    // Don't start a new timer - it will be started when silence is detected
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private setMaxDurationTimer(): void {
    this.clearMaxDurationTimer();
    this.maxDurationTimer = setTimeout(() => {
      this.forceEndTurn();
    }, this.config.maxTurnDurationMs);
  }

  private clearMaxDurationTimer(): void {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }
}

/**
 * Silence detector using audio amplitude analysis.
 *
 * Analyzes PCM16 audio data to determine if it represents silence.
 */
export class SilenceDetector {
  private threshold: number;
  private readonly defaultThreshold = 0.02; // 2% of max amplitude

  constructor(threshold?: number) {
    this.threshold = threshold ?? this.defaultThreshold;
  }

  /**
   * Determine if the audio chunk is silent.
   *
   * @param pcmData PCM16 audio data buffer
   * @returns true if the audio is considered silent
   */
  isSilent(pcmData: Buffer): boolean {
    const rms = this.getRmsAmplitude(pcmData);
    return rms < this.threshold;
  }

  /**
   * Get the RMS (Root Mean Square) amplitude of the audio.
   *
   * RMS provides a good measure of the "power" of the audio signal.
   * Values are normalized to 0-1 range.
   *
   * @param pcmData PCM16 audio data buffer
   * @returns Normalized RMS amplitude (0-1)
   */
  getRmsAmplitude(pcmData: Buffer): number {
    if (pcmData.length < 2) {
      return 0;
    }

    let sumSquares = 0;
    const sampleCount = Math.floor(pcmData.length / 2);

    for (let i = 0; i < pcmData.length; i += 2) {
      // Read 16-bit signed integer (little-endian)
      const sample = pcmData.readInt16LE(i);
      // Normalize to -1 to 1 range
      const normalized = sample / 32768;
      sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / sampleCount);
  }

  /**
   * Get the peak amplitude of the audio.
   *
   * @param pcmData PCM16 audio data buffer
   * @returns Normalized peak amplitude (0-1)
   */
  getPeakAmplitude(pcmData: Buffer): number {
    if (pcmData.length < 2) {
      return 0;
    }

    let maxAbsSample = 0;

    for (let i = 0; i < pcmData.length; i += 2) {
      const sample = Math.abs(pcmData.readInt16LE(i));
      if (sample > maxAbsSample) {
        maxAbsSample = sample;
      }
    }

    return maxAbsSample / 32768;
  }

  /**
   * Update the silence threshold.
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  /**
   * Get the current silence threshold.
   */
  getThreshold(): number {
    return this.threshold;
  }
}

/**
 * Create a TurnDetector with the given configuration.
 */
export function createTurnDetector(config?: Partial<TurnDetectionConfig>): TurnDetector {
  return new TurnDetector(config);
}
