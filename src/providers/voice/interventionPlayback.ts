import { LIVE_FRAME_MS } from '../openai/liveSession';

import type { PcmAudioPlayout } from './audioPlayout';
import type { PreparedVoiceIntervention } from './interventions';
import type { VoiceIntervention } from './types';

const SAMPLE_RATE = 24000;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000;
const FRAME_BYTES = BYTES_PER_MS * LIVE_FRAME_MS;
const QUIET_SAMPLES = SAMPLE_RATE / 5;
const QUIET_WINDOW_SAMPLES = (SAMPLE_RATE * LIVE_FRAME_MS) / 1000;
const QUIET_RMS_DBFS = -55;
const QUIET_MEAN_SQUARE = 32768 ** 2 * 10 ** (QUIET_RMS_DBFS / 10);
const RECOVERY_TIMEOUT_MS = 3000;
const RECOVERY_POLICY = Object.freeze({
  sourceQuietMethod: 'rms' as const,
  sourceQuietRmsDbfs: QUIET_RMS_DBFS,
  sourceQuietWindowMs: LIVE_FRAME_MS,
  sourceQuietWindowAlignment: 'intervention_start' as const,
  sourceQuietMs: (QUIET_SAMPLES * 1000) / SAMPLE_RATE,
  recoveryTimeoutMs: RECOVERY_TIMEOUT_MS,
});

type AudioFrame = { frame: Buffer; audioBytes: number };

interface Playback {
  audio: Buffer;
  record: VoiceIntervention;
  offset: number;
  quietSamples: number;
  windowSamples: number;
  windowEnergy: number;
  recoveryStartedAtMs?: number;
  proposed?: AudioFrame;
}

/**
 * Replace caller audio with a prepared clip, then suppress old caller output until an
 * observed 200 ms quiet PCM boundary. Complete 20 ms RMS windows tolerate the low
 * noise floor found in generated pauses; this development-derived acoustic gate
 * cannot establish a semantic turn boundary. An arrival gap is never silence.
 * Only accepted frames advance playback; proposed or rejected frames prove no delivery.
 */
export class VoiceInterventionPlayback {
  private playback?: Playback;

  constructor(private readonly queue: PcmAudioPlayout) {}

  get active(): boolean {
    return this.playback !== undefined;
  }

  begin(prepared: PreparedVoiceIntervention, record: VoiceIntervention): void {
    if (this.playback) {
      throw new Error('Caller audio has not recovered before the next scheduled speech clip.');
    }
    if (!prepared.audio?.length || prepared.audio.length % 2 !== 0) {
      throw new Error('Scheduled caller speech requires complete PCM16 audio samples.');
    }
    record.discardedCallerAudioBytes = (record.discardedCallerAudioBytes ?? 0) + this.queue.clear();
    record.deliveredAudioBytes = 0;
    record.recoveryPolicy = RECOVERY_POLICY;
    this.playback = {
      audio: prepared.audio,
      record,
      offset: 0,
      quietSamples: 0,
      windowSamples: 0,
      windowEnergy: 0,
    };
  }

  /** Return only the portion after a proven quiet boundary, preserving fresh speech. */
  filterCallerAudio(audio: Buffer, elapsedMs: number): Buffer | undefined {
    const playback = this.playback;
    if (!playback) {
      return audio;
    }
    if (audio.length % 2 !== 0) {
      throw new Error('Caller audio requires complete PCM16 samples.');
    }
    let discarded = audio.length;
    let remainder: Buffer | undefined;
    for (let offset = 0; offset < audio.length; offset += 2) {
      const sample = audio.readInt16LE(offset);
      playback.windowEnergy += sample * sample;
      playback.windowSamples++;
      if (playback.windowSamples < QUIET_WINDOW_SAMPLES) {
        continue;
      }
      // Keep complete source windows across packets; do not count local padding,
      // stalled arrivals, or samples received before this intervention began.
      playback.quietSamples =
        playback.windowEnergy / QUIET_WINDOW_SAMPLES <= QUIET_MEAN_SQUARE
          ? playback.quietSamples + QUIET_WINDOW_SAMPLES
          : 0;
      playback.windowSamples = 0;
      playback.windowEnergy = 0;
      if (playback.offset === playback.audio.length && playback.quietSamples >= QUIET_SAMPLES) {
        discarded = offset + 2;
        remainder = discarded < audio.length ? audio.subarray(discarded) : undefined;
        this.resume(elapsedMs);
        break;
      }
    }
    playback.record.discardedCallerAudioBytes =
      (playback.record.discardedCallerAudioBytes ?? 0) + discarded;
    return remainder;
  }

  /** Propose one frame without advancing the clip or recording an acceptance. */
  readFrame(): AudioFrame | undefined {
    const playback = this.playback;
    if (!playback) {
      return undefined;
    }
    if (playback.proposed) {
      return playback.proposed;
    }
    const frame = Buffer.alloc(FRAME_BYTES);
    const audioBytes = playback.audio.copy(
      frame,
      0,
      playback.offset,
      Math.min(playback.offset + FRAME_BYTES, playback.audio.length),
    );
    playback.proposed = { frame, audioBytes };
    return playback.proposed;
  }

  /** Call only after the target session accepts the proposed frame. */
  frameAccepted(audioBytes: number, frameAtMs: number, sentAtMs: number): void {
    const playback = this.playback;
    if (!playback?.proposed || playback.proposed.audioBytes !== audioBytes) {
      throw new Error('Scheduled caller speech acceptance must match its proposed frame.');
    }
    playback.proposed = undefined;
    if (!audioBytes) {
      return;
    }
    playback.record.firstFrameAtMs ??= frameAtMs;
    playback.record.firstFrameSentAtMs ??= sentAtMs;
    playback.offset += audioBytes;
    playback.record.deliveredAudioBytes = playback.offset;
    if (playback.offset === playback.audio.length) {
      playback.record.completedAtMs = frameAtMs + audioBytes / BYTES_PER_MS;
      playback.recoveryStartedAtMs = sentAtMs;
      // A later partial window may already contain new speech; wait until its
      // energy is known instead of reusing an older quiet boundary.
      if (playback.quietSamples >= QUIET_SAMPLES && playback.windowSamples === 0) {
        this.resume(sentAtMs);
      }
    }
  }

  checkRecovery(elapsedMs: number): void {
    const startedAtMs = this.playback?.recoveryStartedAtMs;
    if (startedAtMs !== undefined && elapsedMs - startedAtMs > RECOVERY_TIMEOUT_MS) {
      throw new Error('Caller output did not return to observed silence after scheduled speech.');
    }
  }

  private resume(elapsedMs: number): void {
    this.playback!.record.callerResumedAtMs = elapsedMs;
    this.playback = undefined;
  }
}
