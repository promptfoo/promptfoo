import { EventEmitter } from 'events';

import { audioDataToPcm16, base64ToBuffer } from './audioBuffer';
import { DEFAULT_TURN_DETECTION } from './types';

import type { AudioChunk, TurnDetectionConfig } from './types';

const DEFAULT_LOCAL_VAD_THRESHOLD = 0.02;

export class TurnDetector extends EventEmitter {
  private config: TurnDetectionConfig;
  private silenceTimer: NodeJS.Timeout | null = null;
  private maxDurationTimer: NodeJS.Timeout | null = null;
  private turnStartTime: number | null = null;
  private isSpeaking: boolean = false;
  private silenceDetector: SilenceDetector;

  constructor(config: Partial<TurnDetectionConfig> = {}) {
    super();
    const defaultVadThreshold =
      config.mode === 'silence' || config.mode === 'hybrid'
        ? DEFAULT_LOCAL_VAD_THRESHOLD
        : DEFAULT_TURN_DETECTION.vadThreshold;
    this.config = {
      ...DEFAULT_TURN_DETECTION,
      vadThreshold: defaultVadThreshold,
      ...config,
    };
    this.silenceDetector = new SilenceDetector(this.config.vadThreshold);
  }

  onSpeechStart(): void {
    if (this.isSpeaking) {
      this.clearSilenceTimer();
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

  onSpeechEnd(responseComplete = false): void {
    if (!this.isSpeaking) {
      return;
    }

    // Check minimum turn duration
    if (!responseComplete && this.turnStartTime !== null) {
      const duration = Date.now() - this.turnStartTime;
      if (duration < this.config.minTurnDurationMs) {
        // Too short: schedule the end for the earliest valid turn boundary.
        this.scheduleTurnEnd(this.config.minTurnDurationMs - duration);
        return;
      }
    }

    this.endTurn();
  }

  onAudioChunk(chunk: AudioChunk): void {
    if (this.config.mode === 'server_vad') {
      // In server_vad mode, we don't do local detection
      return;
    }

    const buffer = audioDataToPcm16(base64ToBuffer(chunk.data), chunk.format);
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

  forceEndTurn(): void {
    if (this.isSpeaking) {
      this.emit('turn_timeout');
      this.endTurn();
    }
  }

  reset(): void {
    this.clearSilenceTimer();
    this.clearMaxDurationTimer();
    this.isSpeaking = false;
    this.turnStartTime = null;
  }

  isInTurn(): boolean {
    return this.isSpeaking;
  }

  getTurnDuration(): number {
    if (this.turnStartTime === null) {
      return 0;
    }
    return Date.now() - this.turnStartTime;
  }

  updateConfig(config: Partial<TurnDetectionConfig>): void {
    const switchingToLocalMode =
      config.mode !== undefined &&
      config.mode !== 'server_vad' &&
      this.config.mode === 'server_vad' &&
      config.vadThreshold === undefined;
    this.config = {
      ...this.config,
      ...(switchingToLocalMode ? { vadThreshold: DEFAULT_LOCAL_VAD_THRESHOLD } : {}),
      ...config,
    };
    if (config.vadThreshold !== undefined || switchingToLocalMode) {
      this.silenceDetector = new SilenceDetector(this.config.vadThreshold);
    }
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
      this.silenceTimer = null;
      this.onSpeechEnd();
    }, this.config.silenceThresholdMs);
  }

  private scheduleTurnEnd(delayMs: number): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this.onSpeechEnd();
    }, delayMs);
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

export class SilenceDetector {
  private threshold: number;
  private readonly defaultThreshold = DEFAULT_LOCAL_VAD_THRESHOLD; // 2% of max amplitude

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

    for (let i = 0; i + 1 < pcmData.length; i += 2) {
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

    for (let i = 0; i + 1 < pcmData.length; i += 2) {
      const sample = Math.abs(pcmData.readInt16LE(i));
      if (sample > maxAbsSample) {
        maxAbsSample = sample;
      }
    }

    return maxAbsSample / 32768;
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  getThreshold(): number {
    return this.threshold;
  }
}
