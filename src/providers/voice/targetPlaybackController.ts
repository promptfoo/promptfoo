import type { PcmAudioPlayout } from './audioPlayout';

const SAMPLE_RATE = 24000;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000;
const FRAME_MS = 20;
const FRAME_BYTES = BYTES_PER_MS * FRAME_MS;
const QUIET_SAMPLE_PEAK = 8;
// Recover only through a declared low-energy source boundary. Generated PCM can
// retain a low DC/noise floor during pauses, so exact near-zero samples are too
// strict. This is acoustic recovery, not a semantic turn-completion detector.
const SOURCE_QUIET_RMS_DBFS = -60;
const SOURCE_QUIET_WINDOW_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const SOURCE_QUIET_MEAN_SQUARE = 32768 ** 2 * 10 ** (SOURCE_QUIET_RMS_DBFS / 10);

interface AudioFrame {
  frame: Buffer;
  audioBytes: number;
}

interface CallerTurn {
  id: string;
  onsetAtMs: number;
  stopped: boolean;
}

export interface TargetPlaybackControllerOptions {
  sourceQuietMs?: number;
  callerQuietMs?: number;
  recoveryTimeoutMs?: number;
  recentTargetActivityMs?: number;
  maxInterruptions?: number;
}

export interface TargetPlaybackStopDecision {
  turnId: string;
  callerOnsetAtMs: number;
  decisionAtMs: number;
  /** Global next recorded-frame position, supplied by the bridge on the WAV clock. */
  recordingAtMs?: number;
}

interface Suppression {
  epoch: number;
  turnId: string;
  startedAtMs: number;
  sourceStartByte: number;
  quietSamples: number;
  windowSamples: number;
  windowEnergy: number;
}

export interface TargetPlaybackEvent {
  type: 'suppressed' | 'redirect_acknowledged' | 'resumed' | 'recovery_timeout' | 'closed';
  epoch: number;
  atMs: number;
  /** WAV-frame boundary, independent of elapsed atMs; absent in legacy callers. */
  recordingAtMs?: number;
  turnId?: string;
  callerOnsetAtMs?: number;
  lastDeliveredActiveAtMs?: number;
  /** Half-open offsets in the separately retained, contiguous target source PCM. */
  discardedSourceStartByte?: number;
  discardedSourceEndByte?: number;
  discardedQueuedBytes?: number;
  discardedSelectedBytes?: number;
  /** A PCM silence boundary is a heuristic, not an API turn-completion signal. */
  recovery?: 'observed_source_quiet';
}

function boundedOption(value: number | undefined, fallback: number, min: number, max: number) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new Error(`Target playback setting must be an integer between ${min} and ${max}.`);
  }
  return result;
}

function validatePcm(audio: Buffer): void {
  if (audio.length % 2 !== 0) {
    throw new Error('Target playback requires complete PCM16 samples.');
  }
}

function validateTime(atMs: number): void {
  if (!Number.isFinite(atMs) || atMs < 0) {
    throw new Error('Target playback requires a finite nonnegative media clock.');
  }
}

/**
 * Explicit application playback control, separate from GPT-Live's native yielding.
 *
 * A caller perception component supplies causal turn IDs and stop decisions. This
 * class never receives evaluation schedules, expected text, or intent labels. It
 * clears queued target audio at a decision and withholds subsequent source until
 * accepted caller silence and real source PCM silence meet the recovery policy.
 * Source recovery uses complete 20 ms RMS windows starting after suppression.
 * Packet stalls and locally generated padding cannot establish source silence.
 *
 * GPT-Live has no output turn IDs or cancellation acknowledgment. Consequently the
 * observed silence boundary is only a recovery heuristic: later old speech and an
 * early new answer remain semantically indistinguishable here. Retain source and
 * delivered recordings separately and grade continuation independently.
 *
 * The bridge must call readFrame immediately before transport delivery, then
 * frameAccepted or frameRejected synchronously. With no stop decisions, the
 * underlying playout produces exactly the same samples and reserve behavior.
 */
export class TargetPlaybackController {
  readonly policy: Readonly<
    Required<TargetPlaybackControllerOptions> & {
      callerQuietMethod: 'peak';
      callerQuietSamplePeak: number;
      sourceQuietMethod: 'rms';
      sourceQuietRmsDbfs: number;
      sourceQuietWindowMs: number;
      sourceQuietWindowAlignment: 'suppression_start';
    }
  >;
  private readonly audit: TargetPlaybackEvent[] = [];
  private turn?: CallerTurn;
  private suppression?: Suppression;
  private proposed?: AudioFrame;
  private proposedSuppressed = false;
  private epoch = 0;
  private closed = false;
  private failure?: Error;
  private recoveryTimedOut = false;
  private acknowledgedEpoch = 0;
  private callerQuietSamples = 0;
  private lastCallerFrameAtMs?: number;
  private lastCallerAcceptedAtMs?: number;
  private lastDeliveredActiveAtMs?: number;
  private lastActiveFrameAcceptedAtMs?: number;
  private readonly counters = {
    sourceBytes: 0,
    deliveredSourceBytes: 0,
    transportRejectedSourceBytes: 0,
    bufferingRejectedSourceBytes: 0,
    discardedQueuedBytes: 0,
    discardedSelectedBytes: 0,
    discardedIncomingBytes: 0,
    suppressedPlaybackMs: 0,
    stops: 0,
    staleDecisions: 0,
    duplicateDecisions: 0,
    decisionsWithoutOverlap: 0,
    staleAcknowledgments: 0,
  };

  constructor(
    private readonly queue: PcmAudioPlayout,
    options: TargetPlaybackControllerOptions = {},
  ) {
    if (queue.bytes) {
      throw new Error('Target playback controller must attach before any source audio arrives.');
    }
    this.policy = Object.freeze({
      callerQuietMethod: 'peak',
      callerQuietSamplePeak: QUIET_SAMPLE_PEAK,
      sourceQuietMethod: 'rms',
      sourceQuietRmsDbfs: SOURCE_QUIET_RMS_DBFS,
      sourceQuietWindowMs: FRAME_MS,
      sourceQuietWindowAlignment: 'suppression_start',
      sourceQuietMs: boundedOption(options.sourceQuietMs, 200, 40, 1000),
      callerQuietMs: boundedOption(options.callerQuietMs, 200, 40, 1000),
      recoveryTimeoutMs: boundedOption(options.recoveryTimeoutMs, 5000, 500, 10000),
      recentTargetActivityMs: boundedOption(options.recentTargetActivityMs, 100, 0, 500),
      maxInterruptions: boundedOption(options.maxInterruptions, 20, 1, 100),
    });
  }

  get active(): boolean {
    return this.suppression !== undefined;
  }

  get events(): TargetPlaybackEvent[] {
    return this.audit.map((event) => ({ ...event }));
  }

  get metrics() {
    return {
      ...this.counters,
      pendingQueuedBytes: this.queue.bytes,
      pendingSelectedBytes: this.proposed?.audioBytes ?? 0,
      suppressed: this.active,
      closed: this.closed,
      recoveryFailed: this.recoveryTimedOut,
    };
  }

  /** Announce a causal PCM turn start before launching asynchronous perception. */
  beginCallerTurn(turnId: string, onsetAtMs: number): void {
    validateTime(onsetAtMs);
    if (!turnId || turnId.length > 256) {
      throw new Error('Target playback caller turn IDs must contain 1 to 256 characters.');
    }
    if (this.closed || this.failure) {
      return;
    }
    if (this.turn && onsetAtMs <= this.turn.onsetAtMs) {
      if (turnId === this.turn.id && onsetAtMs === this.turn.onsetAtMs) {
        return;
      }
      throw new Error('Target playback caller turns must start in increasing media-clock order.');
    }
    this.turn = { id: turnId, onsetAtMs, stopped: false };
  }

  /** Keep sample continuity separate from elapsed transport-acceptance freshness. */
  observeAcceptedCaller(audio: Buffer, frameAtMs: number, acceptedAtMs = frameAtMs): void {
    validatePcm(audio);
    validateTime(frameAtMs);
    validateTime(acceptedAtMs);
    if (audio.length !== FRAME_BYTES) {
      throw new Error('Target playback requires one accepted 20 ms caller frame.');
    }
    if (this.closed || this.failure) {
      return;
    }
    if (this.lastCallerFrameAtMs !== undefined) {
      if (frameAtMs <= this.lastCallerFrameAtMs) {
        throw new Error('Target playback caller frames must advance the media clock.');
      }
      // A missing accepted frame cannot provide evidence of continuous caller silence.
      if (frameAtMs !== this.lastCallerFrameAtMs + FRAME_MS) {
        this.callerQuietSamples = 0;
      }
    }
    this.lastCallerFrameAtMs = frameAtMs;
    this.lastCallerAcceptedAtMs = acceptedAtMs;
    for (let offset = 0; offset < audio.length; offset += 2) {
      this.callerQuietSamples =
        Math.abs(audio.readInt16LE(offset)) <= QUIET_SAMPLE_PEAK ? this.callerQuietSamples + 1 : 0;
    }
  }

  /** Return the new suppression epoch, or abstain on stale, repeated, or non-overlap decisions. */
  requestStop(decision: TargetPlaybackStopDecision): number | undefined {
    validateTime(decision.decisionAtMs);
    validateTime(decision.callerOnsetAtMs);
    if (decision.recordingAtMs !== undefined) {
      validateTime(decision.recordingAtMs);
    }
    if (
      this.closed ||
      this.failure ||
      !this.turn ||
      decision.turnId !== this.turn.id ||
      decision.callerOnsetAtMs !== this.turn.onsetAtMs ||
      decision.decisionAtMs < decision.callerOnsetAtMs
    ) {
      this.counters.staleDecisions++;
      return undefined;
    }
    if (this.turn.stopped || this.suppression) {
      this.turn.stopped = true;
      this.counters.duplicateDecisions++;
      return undefined;
    }
    if (
      this.lastActiveFrameAcceptedAtMs === undefined ||
      decision.decisionAtMs < this.lastActiveFrameAcceptedAtMs ||
      decision.decisionAtMs - this.lastActiveFrameAcceptedAtMs > this.policy.recentTargetActivityMs
    ) {
      this.counters.decisionsWithoutOverlap++;
      return undefined;
    }
    if (this.counters.stops >= this.policy.maxInterruptions) {
      throw new Error('Target playback exceeded the configured interruption limit.');
    }
    this.turn.stopped = true;
    this.epoch++;
    const discardedQueuedBytes = this.queue.clear();
    const discardedSelectedBytes = this.proposed?.audioBytes ?? 0;
    if (this.proposed) {
      // Invalidate an outstanding frame by reference so a late sender cannot emit its old PCM.
      this.proposed.frame.fill(0);
      this.proposed.audioBytes = 0;
      this.proposedSuppressed = true;
    }
    this.counters.discardedQueuedBytes += discardedQueuedBytes;
    this.counters.discardedSelectedBytes += discardedSelectedBytes;
    this.counters.stops++;
    this.suppression = {
      epoch: this.epoch,
      turnId: this.turn.id,
      startedAtMs: decision.decisionAtMs,
      sourceStartByte: this.counters.sourceBytes,
      quietSamples: 0,
      windowSamples: 0,
      windowEnergy: 0,
    };
    this.audit.push({
      type: 'suppressed',
      epoch: this.epoch,
      atMs: decision.decisionAtMs,
      recordingAtMs: decision.recordingAtMs,
      turnId: this.turn.id,
      callerOnsetAtMs: this.turn.onsetAtMs,
      lastDeliveredActiveAtMs: this.lastDeliveredActiveAtMs,
      discardedQueuedBytes,
      discardedSelectedBytes,
      discardedSourceStartByte:
        this.counters.sourceBytes - discardedQueuedBytes - discardedSelectedBytes,
      discardedSourceEndByte: this.counters.sourceBytes,
    });
    return this.epoch;
  }

  /** A redirect acknowledgment is audited, but never grants permission to unmute. */
  acknowledgeRedirect(epoch: number, atMs: number): boolean {
    validateTime(atMs);
    if (
      this.closed ||
      this.failure ||
      this.suppression?.epoch !== epoch ||
      this.acknowledgedEpoch === epoch ||
      atMs < this.suppression.startedAtMs
    ) {
      this.counters.staleAcknowledgments++;
      return false;
    }
    this.acknowledgedEpoch = epoch;
    this.audit.push({ type: 'redirect_acknowledged', epoch, atMs });
    return true;
  }

  /** Ingest the exact source PCM before any application suppression or jitter buffering. */
  appendSource(audio: Buffer, atMs: number, recordingAtMs?: number): void {
    validatePcm(audio);
    validateTime(atMs);
    if (recordingAtMs !== undefined) {
      validateTime(recordingAtMs);
    }
    if (this.closed) {
      return;
    }
    const sourceStartByte = this.counters.sourceBytes;
    this.counters.sourceBytes += audio.length;
    try {
      this.checkRecovery(atMs);
    } catch (error) {
      // The deadline can expire as a final source chunk arrives. It was received
      // and withheld, so retain it in the source/discard accounting before failing.
      this.counters.discardedIncomingBytes += audio.length;
      throw error;
    }
    const suppression = this.suppression;
    if (!suppression) {
      this.appendPlayable(audio, atMs);
      return;
    }
    let discarded = audio.length;
    for (let offset = 0; offset < audio.length; offset += 2) {
      const sample = audio.readInt16LE(offset);
      suppression.windowEnergy += sample * sample;
      suppression.windowSamples++;
      if (suppression.windowSamples < SOURCE_QUIET_WINDOW_SAMPLES) {
        continue;
      }
      // Windows begin with the first source sample after this suppression and
      // span chunk boundaries. Neither arrival gaps nor incomplete windows add
      // silence. A non-multiple duration rounds up to a complete 20 ms window.
      const quiet =
        suppression.windowEnergy / SOURCE_QUIET_WINDOW_SAMPLES <= SOURCE_QUIET_MEAN_SQUARE;
      suppression.quietSamples = quiet ? suppression.quietSamples + SOURCE_QUIET_WINDOW_SAMPLES : 0;
      suppression.windowSamples = 0;
      suppression.windowEnergy = 0;
      if (
        suppression.quietSamples >= (SAMPLE_RATE * this.policy.sourceQuietMs) / 1000 &&
        this.callerQuietSamples >= (SAMPLE_RATE * this.policy.callerQuietMs) / 1000 &&
        this.lastCallerAcceptedAtMs !== undefined &&
        atMs <= this.lastCallerAcceptedAtMs + FRAME_MS * 2
      ) {
        discarded = offset + 2;
        // Preserve even a within-chunk first sample of new speech after the selected boundary.
        try {
          this.appendPlayable(audio.subarray(discarded), atMs);
        } catch (error) {
          this.counters.discardedIncomingBytes += discarded;
          throw error;
        }
        this.audit.push({
          type: 'resumed',
          epoch: suppression.epoch,
          turnId: suppression.turnId,
          atMs,
          recordingAtMs,
          discardedSourceStartByte: suppression.sourceStartByte,
          discardedSourceEndByte: sourceStartByte + discarded,
          recovery: 'observed_source_quiet',
        });
        this.suppression = undefined;
        break;
      }
    }
    this.counters.discardedIncomingBytes += discarded;
  }

  /** Propose one frame; the bridge must confirm or reject transport acceptance. */
  readFrame(atMs: number): AudioFrame {
    validateTime(atMs);
    this.checkRecovery(atMs);
    if (this.closed) {
      throw new Error('Target playback controller is closed.');
    }
    if (this.proposed) {
      throw new Error('Target playback frame must be accepted or rejected before reading another.');
    }
    this.proposed = this.suppression
      ? { frame: Buffer.alloc(FRAME_BYTES), audioBytes: 0 }
      : this.queue.read(FRAME_BYTES);
    this.proposedSuppressed = this.suppression !== undefined;
    return this.proposed;
  }

  /** Recording positions locate PCM; acceptance time shares the asynchronous decision clock. */
  frameAccepted(frameAtMs: number, acceptedAtMs = frameAtMs): void {
    validateTime(frameAtMs);
    validateTime(acceptedAtMs);
    const proposed = this.proposed;
    if (!proposed) {
      throw new Error('Target playback acceptance requires an outstanding frame.');
    }
    this.counters.deliveredSourceBytes += proposed.audioBytes;
    if (this.proposedSuppressed) {
      this.counters.suppressedPlaybackMs += FRAME_MS;
    }
    for (let offset = proposed.audioBytes - 2; offset >= 0; offset -= 2) {
      if (Math.abs(proposed.frame.readInt16LE(offset)) > QUIET_SAMPLE_PEAK) {
        this.lastDeliveredActiveAtMs = frameAtMs + offset / BYTES_PER_MS;
        this.lastActiveFrameAcceptedAtMs = acceptedAtMs;
        break;
      }
    }
    this.proposed = undefined;
  }

  /** Preserve failed delivery as a separate accounting category, never as heard speech. */
  frameRejected(): void {
    if (!this.proposed) {
      throw new Error('Target playback rejection requires an outstanding frame.');
    }
    this.counters.transportRejectedSourceBytes += this.proposed.audioBytes;
    this.proposed = undefined;
  }

  checkRecovery(atMs: number): void {
    validateTime(atMs);
    if (this.failure) {
      throw this.failure;
    }
    if (
      !this.closed &&
      this.suppression &&
      atMs - this.suppression.startedAtMs >= this.policy.recoveryTimeoutMs
    ) {
      this.audit.push({
        type: 'recovery_timeout',
        epoch: this.suppression.epoch,
        turnId: this.suppression.turnId,
        atMs,
        discardedSourceStartByte: this.suppression.sourceStartByte,
        discardedSourceEndByte: this.counters.sourceBytes,
      });
      this.failure = new Error(
        'Target application playback did not recover at an observed quiet boundary.',
      );
      this.recoveryTimedOut = true;
      throw this.failure;
    }
  }

  /** Fence late decisions and acknowledgments while retaining pending byte accounting. */
  close(atMs: number, recordingAtMs?: number): void {
    validateTime(atMs);
    if (recordingAtMs !== undefined) {
      validateTime(recordingAtMs);
    }
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.audit.push({
      type: 'closed',
      epoch: this.epoch,
      atMs,
      recordingAtMs,
      ...(this.suppression
        ? {
            turnId: this.suppression.turnId,
            discardedSourceStartByte: this.suppression.sourceStartByte,
            discardedSourceEndByte: this.counters.sourceBytes,
          }
        : {}),
    });
  }

  private appendPlayable(audio: Buffer, atMs: number): void {
    try {
      this.queue.append(audio, atMs);
    } catch (error) {
      this.counters.bufferingRejectedSourceBytes += audio.length;
      // Buffer failure ends this stream. Continuing after an omitted source chunk
      // would make the queued suffix noncontiguous and invalidate discard offsets.
      this.failure =
        error instanceof Error ? error : new Error('Target playback buffering failed.');
      throw error;
    }
  }
}
