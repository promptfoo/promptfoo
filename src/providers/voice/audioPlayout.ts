import { PcmAudioQueue } from './audioQueue';

const SAMPLE_RATE = 24000;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000;
const FRAME_MS = 20;
const FRAME_BYTES = BYTES_PER_MS * FRAME_MS;
// The first arrival spike can precede any jitter estimate. Reserve 200 ms up front
// to cover that cold-start case; later growth remains bounded by the same 400 ms cap.
const MINIMUM_RESERVE_MS = 200;
const MAXIMUM_RESERVE_MS = 400;
// At most -72 dBFS, including every individual sample. Ordinary quiet speech does not
// qualify: growing the reserve must not insert silence into a word or change its PCM.
const QUIET_SAMPLE_PEAK = 8;

function isQuiet(frame: Buffer, audioBytes: number): boolean {
  for (let offset = 0; offset < audioBytes; offset += 2) {
    if (Math.abs(frame.readInt16LE(offset)) > QUIET_SAMPLE_PEAK) {
      return false;
    }
  }
  return true;
}

/**
 * Pace continuous GPT-Live PCM without draining its jitter reserve during source silence.
 *
 * A one-time startup delay runs out when output-chunk arrivals drift later. This buffer
 * learns a bounded reserve from excess inter-arrival delay and rebuilds it only between
 * consecutive near-silent source frames. Voiced source samples are never dropped,
 * repeated, stretched, or replaced. Stalls beyond the reserve still produce explicitly
 * counted underflow; padding is not evidence of model-generated silence.
 */
export class PcmAudioPlayout extends PcmAudioQueue {
  private readonly maximumReserveMs: number;
  private reserveMs: number;
  private previousArrivalAtMs?: number;
  private previousChunkMs = 0;
  private playedSource = false;
  private lastSourceQuiet = true;
  private startupWaitMs = 0;
  private consecutiveUnderflowMs = 0;
  private readonly counters = {
    waitingForSourceMs: 0,
    startupBufferingMs: 0,
    silenceReplenishmentMs: 0,
    underflowMs: 0,
    underflowAfterActiveAudioMs: 0,
    underflowEvents: 0,
    maximumUnderflowMs: 0,
    maximumExcessArrivalMs: 0,
    discardedBytes: 0,
  };

  constructor(maxBytes: number) {
    super(maxBytes);
    // Keep room for one complete frame. A deliberately tiny queue degrades to the
    // unbuffered FIFO instead of deadlocking or violating its configured byte limit.
    this.maximumReserveMs = Math.max(
      0,
      Math.min(MAXIMUM_RESERVE_MS, Math.floor(maxBytes / FRAME_BYTES) * FRAME_MS - FRAME_MS),
    );
    this.reserveMs = Math.min(MINIMUM_RESERVE_MS, this.maximumReserveMs);
  }

  get metrics() {
    return { ...this.counters, reserveMs: this.reserveMs, maximumReserveMs: this.maximumReserveMs };
  }

  override append(audio: Buffer, atMs = performance.now()): void {
    super.append(audio);
    if (!audio.length) {
      return;
    }
    if (this.previousArrivalAtMs !== undefined) {
      const excessMs = Math.max(0, atMs - this.previousArrivalAtMs - this.previousChunkMs);
      this.counters.maximumExcessArrivalMs = Math.max(
        this.counters.maximumExcessArrivalMs,
        excessMs,
      );
      // Two observed jitter excursions plus a frame of headroom. The hard cap bounds
      // conversational delay, and adaptation waits for source silence before adding it.
      this.reserveMs = Math.min(
        this.maximumReserveMs,
        Math.max(this.reserveMs, Math.ceil((2 * excessMs + FRAME_MS) / FRAME_MS) * FRAME_MS),
      );
    }
    this.previousArrivalAtMs = atMs;
    this.previousChunkMs = audio.length / BYTES_PER_MS;
  }

  override read(size: number): { frame: Buffer; audioBytes: number } {
    if (size !== FRAME_BYTES) {
      throw new Error('Voice playout requires one 20 ms PCM16 frame at 24000 Hz.');
    }
    const next = super.peek(size);
    const quiet = next.audioBytes === size && isQuiet(next.frame, next.audioBytes);
    const needsReserve = this.bytes < this.reserveMs * BYTES_PER_MS + size;
    const canWaitForStartup = !this.bytes || this.startupWaitMs < this.reserveMs;
    if (
      needsReserve &&
      ((!this.playedSource && canWaitForStartup) ||
        (this.playedSource && this.lastSourceQuiet && quiet))
    ) {
      if (this.playedSource) {
        this.counters.silenceReplenishmentMs += FRAME_MS;
      } else {
        if (this.bytes) {
          this.counters.startupBufferingMs += FRAME_MS;
          this.startupWaitMs += FRAME_MS;
        } else {
          this.counters.waitingForSourceMs += FRAME_MS;
        }
      }
      this.consecutiveUnderflowMs = 0;
      return { frame: Buffer.alloc(size), audioBytes: 0 };
    }

    const result = super.read(size);
    const underflowMs = (size - result.audioBytes) / BYTES_PER_MS;
    const sourceQuiet = result.audioBytes
      ? isQuiet(result.frame, result.audioBytes)
      : this.lastSourceQuiet;
    if ((this.playedSource || result.audioBytes > 0) && underflowMs) {
      if (!this.consecutiveUnderflowMs) {
        this.counters.underflowEvents++;
      }
      this.counters.underflowMs += underflowMs;
      if (!sourceQuiet) {
        this.counters.underflowAfterActiveAudioMs += underflowMs;
      }
      this.consecutiveUnderflowMs += underflowMs;
      this.counters.maximumUnderflowMs = Math.max(
        this.counters.maximumUnderflowMs,
        this.consecutiveUnderflowMs,
      );
    } else {
      this.consecutiveUnderflowMs = 0;
    }
    if (result.audioBytes) {
      this.playedSource = true;
      this.lastSourceQuiet = sourceQuiet;
    }
    return result;
  }

  /** Explicit intervention replacement is audited separately from transport underflow. */
  override clear(): number {
    const discarded = super.clear();
    this.counters.discardedBytes += discarded;
    this.playedSource = false;
    this.lastSourceQuiet = true;
    this.startupWaitMs = 0;
    this.previousArrivalAtMs = undefined;
    this.previousChunkMs = 0;
    this.consecutiveUnderflowMs = 0;
    return discarded;
  }
}
