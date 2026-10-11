import { describe, expect, it } from 'vitest';
import { PcmAudioPlayout } from '../../../src/providers/voice/audioPlayout';
import { PcmAudioQueue } from '../../../src/providers/voice/audioQueue';

const FRAME_BYTES = 960;
const BYTES_PER_MS = 48;

function frame(value: number): Buffer {
  const pcm = Buffer.alloc(FRAME_BYTES);
  for (let offset = 0; offset < pcm.length; offset += 2) {
    pcm.writeInt16LE(value, offset);
  }
  return pcm;
}

describe('PcmAudioPlayout', () => {
  it('absorbs an unseen startup arrival spike without losing voiced samples or exceeding 200ms startup', () => {
    // Synthetic cold-start schedule using the maximum excess delay observed in a
    // real failing run. This is not a packet replay: that run retained no arrival trace.
    const arrivals = [0, 274.617221, 374.617221, 474.617221, 574.617221, 674.617221];
    const source = Buffer.alloc(arrivals.length * 4800);
    for (let offset = 0; offset < source.length; offset += 2) {
      source.writeInt16LE(1000 + offset / 2, offset);
    }
    const queue = new PcmAudioPlayout(3000 * BYTES_PER_MS);
    const played: Buffer[] = [];
    let nextArrival = 0;
    let firstAudioAtMs: number | undefined;
    for (let atMs = 0; atMs < 2000; atMs += 20) {
      while (nextArrival < arrivals.length && arrivals[nextArrival] <= atMs) {
        queue.append(
          source.subarray(nextArrival * 4800, (nextArrival + 1) * 4800),
          arrivals[nextArrival],
        );
        nextArrival++;
      }
      const output = queue.read(FRAME_BYTES);
      if (output.audioBytes) {
        firstAudioAtMs ??= atMs;
        played.push(output.frame.subarray(0, output.audioBytes));
      }
      if (nextArrival === arrivals.length && queue.bytes === 0) {
        break;
      }
    }
    expect(queue.metrics).toMatchObject({
      underflowMs: 0,
      underflowAfterActiveAudioMs: 0,
      silenceReplenishmentMs: 0,
      maximumReserveMs: 400,
    });
    expect(firstAudioAtMs).toBe(200);
    expect(Buffer.concat(played)).toEqual(source);
    expect(queue.bytes).toBe(0);
  });

  it('does not consume source audio while building its bounded startup reserve', () => {
    const queue = new PcmAudioPlayout(3000 * BYTES_PER_MS);
    expect(queue.read(FRAME_BYTES)).toEqual({ frame: Buffer.alloc(FRAME_BYTES), audioBytes: 0 });
    queue.append(Buffer.concat(Array.from({ length: 5 }, (_, index) => frame(index + 100))), 0);
    for (let tick = 0; tick < 5; tick++) {
      expect(queue.read(FRAME_BYTES).audioBytes).toBe(0);
    }
    queue.append(Buffer.concat(Array.from({ length: 5 }, (_, index) => frame(index + 200))), 100);
    for (let tick = 0; tick < 5; tick++) {
      expect(queue.read(FRAME_BYTES).audioBytes).toBe(0);
    }
    expect(queue.bytes).toBe(200 * BYTES_PER_MS);
    expect(queue.read(FRAME_BYTES)).toEqual({ frame: frame(100), audioBytes: FRAME_BYTES });
    expect(queue.metrics).toMatchObject({
      waitingForSourceMs: 20,
      startupBufferingMs: 200,
      silenceReplenishmentMs: 0,
      underflowMs: 0,
      reserveMs: 200,
    });
  });

  it('releases a short final source chunk after the startup wait instead of holding it forever', () => {
    const queue = new PcmAudioPlayout(3000 * BYTES_PER_MS);
    queue.append(frame(1234), 0);
    for (let tick = 0; tick < 10; tick++) {
      expect(queue.read(FRAME_BYTES).audioBytes).toBe(0);
    }
    expect(queue.read(FRAME_BYTES)).toEqual({ frame: frame(1234), audioBytes: FRAME_BYTES });
    expect(queue.read(FRAME_BYTES).audioBytes).toBe(0);
    expect(queue.metrics).toMatchObject({ underflowMs: 20, underflowAfterActiveAudioMs: 20 });
  });

  it('removes the captured 303 ms arrival-stall gap without changing or replaying source samples', () => {
    // Arrival offsets and conservative source-silence windows from a real GPT-Live
    // packet capture (2026-10-10). No recorded voice is stored: non-silent PCM below
    // contains unique synthetic frames. The same capture exposed a 200 ms hole in
    // the immediate FIFO after its one-time startup buffer had drained.
    const arrivals = [
      0, 101.277, 200.352, 299.983, 401.026, 499.787, 601.856, 700.111, 799.646, 900.072, 1011.284,
      1112.598, 1215.144, 1311.458, 1415.325, 1515.686, 1616.389, 1716.528, 1815.532, 1916.007,
      2015.486, 2115.615, 2215.337, 2315.569, 2416.068, 2516.254, 2616.559, 2715.502, 2815.793,
      2919.599, 3089.14, 3188.49, 3398.781, 3498.261, 3598.993, 3698.724, 3798.463, 3897.989,
      3998.26, 4098.581, 4198.377, 4298.431, 4398.315, 4498.134, 4598.441, 4698.005, 4798.7,
      4898.418, 4998.433, 5099.096, 5402.034, 5502.382, 5602.277, 5702.5, 5835.541, 5901.969,
      6002.31, 6101.923, 6202.001, 6313.377, 6402.79, 6505.284, 6601.992, 6702.602, 6819.579,
    ];
    const quietWindows = [
      [11, 12],
      [16, 52],
      [140, 175],
      [276, 292],
    ];
    const source = Buffer.concat(
      Array.from({ length: arrivals.length * 5 }, (_, index) =>
        frame(
          quietWindows.some(([start, end]) => index >= start && index < end) ? 0 : 1000 + index,
        ),
      ),
    );
    const immediate = new PcmAudioQueue(3000 * BYTES_PER_MS);
    const buffered = new PcmAudioPlayout(3000 * BYTES_PER_MS);
    let nextArrival = 0;
    let immediateActiveUnderflowMs = 0;
    let lastImmediateActive = false;
    const played: Buffer[] = [];
    for (let atMs = 0; atMs < 6900; atMs += 20) {
      while (nextArrival < arrivals.length && arrivals[nextArrival] <= atMs) {
        const chunk = source.subarray(nextArrival * 4800, (nextArrival + 1) * 4800);
        immediate.append(chunk);
        buffered.append(chunk, arrivals[nextArrival]);
        nextArrival++;
      }
      const raw = immediate.read(FRAME_BYTES);
      if (lastImmediateActive && !raw.audioBytes) {
        immediateActiveUnderflowMs += 20;
      }
      if (raw.audioBytes) {
        lastImmediateActive = raw.frame.readInt16LE(0) !== 0;
      }
      const delivered = buffered.read(FRAME_BYTES);
      played.push(delivered.frame.subarray(0, delivered.audioBytes));
    }
    const actualSource = Buffer.concat(played);
    expect(immediateActiveUnderflowMs).toBeGreaterThanOrEqual(200);
    expect(buffered.metrics).toMatchObject({ underflowMs: 0, underflowEvents: 0 });
    expect(buffered.metrics.silenceReplenishmentMs).toBeGreaterThan(0);
    expect(buffered.metrics.maximumExcessArrivalMs).toBeCloseTo(202.938, 3);
    expect(buffered.metrics.reserveMs).toBe(400);
    expect(actualSource).toEqual(source.subarray(0, actualSource.length));
    expect(actualSource.length + buffered.bytes).toBe(source.length);
    expect(buffered.bytes / BYTES_PER_MS).toBeLessThanOrEqual(500);
  });

  it('reports an unbufferable stall honestly and never replenishes between active frames', () => {
    const queue = new PcmAudioPlayout(3000 * BYTES_PER_MS);
    const source = Buffer.concat(Array.from({ length: 20 }, (_, index) => frame(1000 + index)));
    queue.append(source, 0);
    const played: Buffer[] = [];
    for (let tick = 0; tick < 25; tick++) {
      const result = queue.read(FRAME_BYTES);
      played.push(result.frame.subarray(0, result.audioBytes));
    }
    queue.append(frame(2000), 5000);
    expect(queue.read(FRAME_BYTES)).toEqual({ frame: frame(2000), audioBytes: FRAME_BYTES });
    expect(Buffer.concat(played)).toEqual(source);
    expect(queue.metrics).toMatchObject({
      underflowMs: 100,
      underflowAfterActiveAudioMs: 100,
      underflowEvents: 1,
      maximumUnderflowMs: 100,
      silenceReplenishmentMs: 0,
      reserveMs: 400,
    });
  });

  it('respects a one-frame queue limit without waiting for an impossible reserve', () => {
    const queue = new PcmAudioPlayout(FRAME_BYTES);
    queue.append(frame(100), 0);
    expect(queue.read(FRAME_BYTES)).toEqual({ frame: frame(100), audioBytes: FRAME_BYTES });
    queue.append(frame(200), 1000);
    expect(queue.read(FRAME_BYTES)).toEqual({ frame: frame(200), audioBytes: FRAME_BYTES });
    expect(queue.metrics).toMatchObject({ reserveMs: 0, maximumReserveMs: 0 });
    expect(() => queue.append(Buffer.alloc(FRAME_BYTES + 2), 2000)).toThrow(/buffering limit/);
  });

  it('counts partial-frame padding using the actual final source samples', () => {
    const queue = new PcmAudioPlayout(FRAME_BYTES);
    queue.append(Buffer.from([255, 127]), 0);
    expect(queue.read(FRAME_BYTES).audioBytes).toBe(2);
    expect(queue.metrics.underflowMs).toBeCloseTo(958 / BYTES_PER_MS);
    expect(queue.metrics.underflowAfterActiveAudioMs).toBeCloseTo(958 / BYTES_PER_MS);
    queue.append(Buffer.from([0, 0]), 20);
    queue.read(FRAME_BYTES);
    expect(queue.metrics.underflowMs).toBeCloseTo((958 * 2) / BYTES_PER_MS);
    expect(queue.metrics.underflowAfterActiveAudioMs).toBeCloseTo(958 / BYTES_PER_MS);
  });

  it('audits intervention discards and resets stale source and arrival state', () => {
    const queue = new PcmAudioPlayout(3000 * BYTES_PER_MS);
    queue.append(frame(100), 0);
    expect(queue.clear()).toBe(FRAME_BYTES);
    queue.append(frame(200), 10000);
    for (let tick = 0; tick < 10; tick++) {
      expect(queue.read(FRAME_BYTES).audioBytes).toBe(0);
    }
    expect(queue.read(FRAME_BYTES)).toEqual({ frame: frame(200), audioBytes: FRAME_BYTES });
    expect(queue.metrics).toMatchObject({
      discardedBytes: FRAME_BYTES,
      maximumExcessArrivalMs: 0,
      reserveMs: 200,
    });
    expect(queue.clear()).toBe(0);
    expect(queue.metrics.discardedBytes).toBe(FRAME_BYTES);
  });

  it('rejects a non-frame playout read before consuming source audio', () => {
    const queue = new PcmAudioPlayout(3000 * BYTES_PER_MS);
    queue.append(frame(100), 0);
    expect(() => queue.read(2)).toThrow(/20 ms PCM16 frame/);
    expect(queue.bytes).toBe(FRAME_BYTES);
  });
});
