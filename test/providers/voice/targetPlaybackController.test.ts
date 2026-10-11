import { describe, expect, it } from 'vitest';
import { PcmAudioPlayout } from '../../../src/providers/voice/audioPlayout';
import { TargetPlaybackController } from '../../../src/providers/voice/targetPlaybackController';

import type { TargetPlaybackControllerOptions } from '../../../src/providers/voice/targetPlaybackController';

const BYTES_PER_MS = 48;
const FRAME_BYTES = 960;

function pcm(value: number, durationMs = 20): Buffer {
  const result = Buffer.alloc(durationMs * BYTES_PER_MS);
  for (let offset = 0; offset < result.length; offset += 2) {
    result.writeInt16LE(value, offset);
  }
  return result;
}

function setup(options: TargetPlaybackControllerOptions = {}, maxBytes = 3000 * BYTES_PER_MS) {
  const queue = new PcmAudioPlayout(maxBytes);
  const controller = new TargetPlaybackController(queue, options);
  return { controller, queue };
}

function assertAccounting(controller: TargetPlaybackController) {
  const metrics = controller.metrics;
  expect(metrics.sourceBytes).toBe(
    metrics.deliveredSourceBytes +
      metrics.transportRejectedSourceBytes +
      metrics.bufferingRejectedSourceBytes +
      metrics.discardedQueuedBytes +
      metrics.discardedSelectedBytes +
      metrics.discardedIncomingBytes +
      metrics.pendingQueuedBytes +
      metrics.pendingSelectedBytes,
  );
}

function startSuppression(options: TargetPlaybackControllerOptions = {}) {
  const result = setup(options);
  result.controller.appendSource(pcm(1000, 400), 0);
  expect(result.controller.readFrame(0).audioBytes).toBe(FRAME_BYTES);
  result.controller.frameAccepted(0);
  result.controller.observeAcceptedCaller(pcm(1500), 0);
  result.controller.beginCallerTurn('turn-1', 0);
  const epoch = result.controller.requestStop({
    turnId: 'turn-1',
    callerOnsetAtMs: 0,
    decisionAtMs: 20,
  });
  expect(epoch).toBe(1);
  return { ...result, epoch: epoch! };
}

function callerQuiet(controller: TargetPlaybackController, startMs = 20, durationMs = 200) {
  for (let atMs = startMs; atMs < startMs + durationMs; atMs += 20) {
    controller.observeAcceptedCaller(pcm(0), atMs);
  }
}

describe('TargetPlaybackController', () => {
  it('preserves every native frame and playout metric without stop decisions', () => {
    const native = new PcmAudioPlayout(3000 * BYTES_PER_MS);
    const { controller, queue } = setup();
    const arrivals = [0, 100, 300, 400, 540, 640, 840, 940];
    let next = 0;
    for (let atMs = 0; atMs < 1400; atMs += 20) {
      if (arrivals[next] === atMs) {
        const audio = pcm(next === 4 ? 0 : 1000 + next, 100);
        native.append(audio, atMs);
        controller.appendSource(audio, atMs);
        next++;
      }
      controller.observeAcceptedCaller(pcm(atMs < 200 ? 1200 : 0), atMs);
      expect(controller.readFrame(atMs)).toEqual(native.read(FRAME_BYTES));
      controller.frameAccepted(atMs);
      expect(queue.metrics).toEqual(native.metrics);
      expect(queue.bytes).toEqual(native.bytes);
      assertAccounting(controller);
    }
    expect(controller.events).toEqual([]);
    expect(controller.metrics.stops).toBe(0);
  });

  it('requires actually accepted active target audio rather than queued or proposed speech', () => {
    const { controller } = setup();
    controller.appendSource(pcm(1200, 400), 0);
    controller.beginCallerTurn('turn-1', 0);
    controller.readFrame(0);
    const decision = { turnId: 'turn-1', callerOnsetAtMs: 0, decisionAtMs: 20 };
    expect(controller.requestStop(decision)).toBeUndefined();
    controller.frameRejected();
    expect(controller.requestStop(decision)).toBeUndefined();
    controller.readFrame(20);
    controller.frameAccepted(20);
    expect(controller.requestStop({ ...decision, decisionAtMs: 21 })).toBe(1);
    expect(controller.metrics).toMatchObject({
      decisionsWithoutOverlap: 2,
      transportRejectedSourceBytes: FRAME_BYTES,
    });
    assertAccounting(controller);
  });

  it('clears queued speech immediately and separates selected source from delivered source', () => {
    const { controller } = setup();
    controller.appendSource(pcm(1200, 400), 0);
    controller.readFrame(0);
    controller.frameAccepted(0);
    const proposed = controller.readFrame(20);
    controller.beginCallerTurn('turn-1', 0);
    expect(controller.requestStop({ turnId: 'turn-1', callerOnsetAtMs: 0, decisionAtMs: 20 })).toBe(
      1,
    );
    expect(proposed).toEqual({ frame: pcm(0), audioBytes: 0 });
    controller.frameAccepted(20);
    expect(controller.metrics).toMatchObject({
      deliveredSourceBytes: FRAME_BYTES,
      discardedSelectedBytes: FRAME_BYTES,
      discardedQueuedBytes: 360 * BYTES_PER_MS,
      suppressedPlaybackMs: 20,
    });
    expect(controller.events[0]).toMatchObject({
      type: 'suppressed',
      discardedSourceStartByte: FRAME_BYTES,
      discardedSourceEndByte: 400 * BYTES_PER_MS,
    });
    assertAccounting(controller);
  });

  it('never mistakes a packet stall or local silence padding for source quiet', () => {
    const { controller } = startSuppression();
    callerQuiet(controller);
    for (let atMs = 20; atMs <= 3000; atMs += 20) {
      expect(controller.readFrame(atMs)).toEqual({ frame: pcm(0), audioBytes: 0 });
      controller.frameAccepted(atMs);
    }
    expect(controller.active).toBe(true);
    expect(controller.events.some((event) => event.type === 'resumed')).toBe(false);
    expect(controller.metrics.discardedIncomingBytes).toBe(0);
    assertAccounting(controller);
  });

  it('recovers across arbitrary PCM chunks and preserves the first post-boundary speech sample', () => {
    const { controller, queue } = startSuppression();
    callerQuiet(controller);
    const beforeBoundary = pcm(0, 200).subarray(0, 200 * BYTES_PER_MS - 2);
    controller.appendSource(beforeBoundary.subarray(0, 1002), 210);
    controller.appendSource(beforeBoundary.subarray(1002), 211);
    expect(controller.active).toBe(true);
    const fresh = pcm(2400, 400);
    fresh.writeInt16LE(-2345, 0);
    controller.appendSource(Buffer.concat([Buffer.alloc(2), fresh]), 212);
    expect(controller.active).toBe(false);
    expect(queue.bytes).toBe(fresh.length);
    const output = controller.readFrame(220);
    expect(output.frame).toEqual(fresh.subarray(0, FRAME_BYTES));
    controller.frameAccepted(220);
    expect(controller.events.at(-1)).toMatchObject({
      type: 'resumed',
      atMs: 212,
      discardedSourceStartByte: 400 * BYTES_PER_MS,
      discardedSourceEndByte: 600 * BYTES_PER_MS,
      recovery: 'observed_source_quiet',
    });
    assertAccounting(controller);
  });

  it('resets source quiet on soft voiced PCM above the declared RMS floor', () => {
    const { controller } = startSuppression();
    callerQuiet(controller);
    // A synthetic low-amplitude voiced tone: peak 50 would pass a peak-64 gate,
    // but RMS about 35 exceeds the declared -60 dBFS threshold of 32.768.
    const softSpeech = Buffer.alloc(FRAME_BYTES);
    for (let sample = 0; sample < FRAME_BYTES / 2; sample++) {
      softSpeech.writeInt16LE(
        Math.round(50 * Math.sin((2 * Math.PI * 300 * sample) / 24000)),
        sample * 2,
      );
    }
    controller.appendSource(pcm(24, 180), 210);
    controller.appendSource(softSpeech, 211);
    controller.appendSource(pcm(24, 180), 212);
    expect(controller.active).toBe(true);
    controller.appendSource(pcm(24, 20), 213);
    expect(controller.active).toBe(false);
    assertAccounting(controller);
  });

  it('requires accepted caller quiet before recovering even if the source is silent', () => {
    const { controller } = startSuppression();
    controller.appendSource(pcm(0, 500), 100);
    expect(controller.active).toBe(true);
    callerQuiet(controller);
    controller.appendSource(pcm(0), 210);
    expect(controller.active).toBe(false);
    assertAccounting(controller);
  });

  it('does not infer current caller quiet from old frames or missing accepted media', () => {
    const { controller } = startSuppression();
    callerQuiet(controller);
    controller.appendSource(pcm(0, 300), 1000);
    expect(controller.active).toBe(true);
    // Missing frame intervals reset the accepted caller-silence run.
    controller.observeAcceptedCaller(pcm(0), 1000);
    controller.appendSource(pcm(0, 20), 1001);
    expect(controller.active).toBe(true);
    callerQuiet(controller, 1020, 180);
    controller.appendSource(pcm(0, 20), 1200);
    expect(controller.active).toBe(false);
    assertAccounting(controller);
  });

  it('holds output when the caller resumes during source quiet recovery', () => {
    const { controller } = startSuppression();
    callerQuiet(controller);
    controller.appendSource(pcm(0, 100), 210);
    controller.observeAcceptedCaller(pcm(1500), 220);
    controller.appendSource(pcm(0, 100), 221);
    expect(controller.active).toBe(true);
    assertAccounting(controller);
  });

  it('rejects stale turns, onset substitutions, and decisions before their causal onset', () => {
    const { controller } = setup();
    controller.appendSource(pcm(1000, 400), 0);
    controller.readFrame(0);
    controller.frameAccepted(0);
    controller.beginCallerTurn('turn-1', 0);
    controller.beginCallerTurn('turn-2', 10);
    for (const decision of [
      { turnId: 'turn-1', callerOnsetAtMs: 0, decisionAtMs: 20 },
      { turnId: 'turn-2', callerOnsetAtMs: 0, decisionAtMs: 20 },
      { turnId: 'turn-2', callerOnsetAtMs: 10, decisionAtMs: 5 },
    ]) {
      expect(controller.requestStop(decision)).toBeUndefined();
    }
    expect(controller.metrics).toMatchObject({ staleDecisions: 3, stops: 0 });
    assertAccounting(controller);
  });

  it('abstains when delivered target activity is older than the overlap window', () => {
    const { controller } = setup();
    controller.appendSource(pcm(1000, 400), 0);
    controller.readFrame(0);
    controller.frameAccepted(0);
    controller.beginCallerTurn('turn-1', 150);
    expect(
      controller.requestStop({ turnId: 'turn-1', callerOnsetAtMs: 150, decisionAtMs: 160 }),
    ).toBeUndefined();
    expect(controller.metrics.decisionsWithoutOverlap).toBe(1);
    assertAccounting(controller);
  });

  it('counts a rejected proposed silence frame as no heard suppression', () => {
    const { controller } = startSuppression();
    controller.readFrame(20);
    controller.frameRejected();
    expect(controller.metrics.suppressedPlaybackMs).toBe(0);
    assertAccounting(controller);
  });

  it('does not let an acknowledgment or duplicate decision authorize recovery', () => {
    const { controller, epoch } = startSuppression();
    expect(controller.acknowledgeRedirect(epoch, 21)).toBe(true);
    expect(controller.active).toBe(true);
    expect(controller.acknowledgeRedirect(epoch, 22)).toBe(false);
    expect(controller.acknowledgeRedirect(epoch + 1, 22)).toBe(false);
    expect(
      controller.requestStop({ turnId: 'turn-1', callerOnsetAtMs: 0, decisionAtMs: 22 }),
    ).toBeUndefined();
    expect(controller.metrics).toMatchObject({ stops: 1, duplicateDecisions: 1 });
  });

  it('fences old asynchronous acknowledgments after recovery and across another suppression', () => {
    const { controller, epoch } = startSuppression();
    callerQuiet(controller);
    controller.appendSource(Buffer.concat([pcm(0, 200), pcm(1500, 400)]), 210);
    expect(controller.acknowledgeRedirect(epoch, 211)).toBe(false);
    controller.readFrame(220);
    controller.frameAccepted(220);
    controller.beginCallerTurn('turn-2', 230);
    const nextEpoch = controller.requestStop({
      turnId: 'turn-2',
      callerOnsetAtMs: 230,
      decisionAtMs: 240,
    });
    expect(nextEpoch).toBe(2);
    expect(controller.acknowledgeRedirect(epoch, 241)).toBe(false);
    expect(controller.acknowledgeRedirect(nextEpoch!, 241)).toBe(true);
    expect(controller.active).toBe(true);
    assertAccounting(controller);
  });

  it('retires a new turn decision during suppression instead of stopping its new answer later', () => {
    const { controller } = startSuppression();
    controller.beginCallerTurn('turn-2', 40);
    const decision = { turnId: 'turn-2', callerOnsetAtMs: 40, decisionAtMs: 50 };
    expect(controller.requestStop(decision)).toBeUndefined();
    callerQuiet(controller);
    controller.appendSource(Buffer.concat([pcm(0, 200), pcm(1500, 400)]), 210);
    controller.readFrame(220);
    controller.frameAccepted(220);
    expect(controller.requestStop({ ...decision, decisionAtMs: 240 })).toBeUndefined();
    expect(controller.metrics.stops).toBe(1);
  });

  it('fails bounded recovery once and stays failed instead of silently unmuting later', () => {
    const { controller } = startSuppression({ recoveryTimeoutMs: 500 });
    controller.checkRecovery(519);
    expect(() => controller.checkRecovery(520)).toThrow(/did not recover/);
    expect(() => controller.checkRecovery(521)).toThrow(/did not recover/);
    expect(() => controller.appendSource(pcm(0, 400), 522)).toThrow(/did not recover/);
    expect(controller.acknowledgeRedirect(1, 523)).toBe(false);
    expect(controller.active).toBe(true);
    expect(controller.events.filter((event) => event.type === 'recovery_timeout')).toHaveLength(1);
    expect(controller.metrics.recoveryFailed).toBe(true);
    assertAccounting(controller);
  });

  it('retains censored suppression and pending bytes on close and fences late work', () => {
    const { controller } = startSuppression();
    controller.appendSource(pcm(1000, 100), 30);
    controller.close(40);
    controller.close(50);
    controller.appendSource(pcm(0, 400), 60);
    expect(controller.acknowledgeRedirect(1, 60)).toBe(false);
    expect(
      controller.requestStop({ turnId: 'turn-1', callerOnsetAtMs: 0, decisionAtMs: 60 }),
    ).toBeUndefined();
    expect(() => controller.readFrame(60)).toThrow(/closed/);
    expect(controller.events.filter((event) => event.type === 'closed')).toHaveLength(1);
    expect(controller.events.at(-1)).toMatchObject({
      discardedSourceStartByte: 400 * BYTES_PER_MS,
      discardedSourceEndByte: 500 * BYTES_PER_MS,
    });
    assertAccounting(controller);
  });

  it('accounts a queue overflow without pretending the rejected source was delivered', () => {
    const { controller } = setup({}, FRAME_BYTES);
    controller.appendSource(pcm(1000), 0);
    expect(() => controller.appendSource(pcm(2000), 20)).toThrow(/buffering limit/);
    expect(controller.metrics).toMatchObject({
      sourceBytes: FRAME_BYTES * 2,
      pendingQueuedBytes: FRAME_BYTES,
      bufferingRejectedSourceBytes: FRAME_BYTES,
      deliveredSourceBytes: 0,
      recoveryFailed: false,
    });
    expect(() => controller.readFrame(40)).toThrow(/buffering limit/);
    assertAccounting(controller);
  });

  it('accounts the quiet prefix if new response buffering fails at a recovery boundary', () => {
    const { controller } = startSuppression();
    callerQuiet(controller);
    expect(() =>
      controller.appendSource(Buffer.concat([pcm(0, 200), pcm(1000, 3020)]), 210),
    ).toThrow(/buffering limit/);
    expect(controller.metrics).toMatchObject({
      discardedIncomingBytes: 200 * BYTES_PER_MS,
      bufferingRejectedSourceBytes: 3020 * BYTES_PER_MS,
    });
    assertAccounting(controller);
  });

  it('enforces the interruption count bound', () => {
    const { controller } = startSuppression({ maxInterruptions: 1 });
    callerQuiet(controller);
    controller.appendSource(Buffer.concat([pcm(0, 200), pcm(1500, 400)]), 210);
    controller.readFrame(220);
    controller.frameAccepted(220);
    controller.beginCallerTurn('turn-2', 230);
    expect(() =>
      controller.requestStop({ turnId: 'turn-2', callerOnsetAtMs: 230, decisionAtMs: 240 }),
    ).toThrow(/interruption limit/);
    assertAccounting(controller);
  });

  it('rejects invalid PCM, clocks, and out-of-order caller frames before accepting them', () => {
    const { controller } = setup();
    expect(() => controller.appendSource(Buffer.alloc(1), 0)).toThrow(/complete PCM16/);
    expect(() => controller.appendSource(pcm(0), -1)).toThrow(/media clock/);
    expect(() => controller.observeAcceptedCaller(Buffer.alloc(2), 0)).toThrow(/20 ms caller/);
    controller.observeAcceptedCaller(pcm(0), 20);
    expect(() => controller.observeAcceptedCaller(pcm(0), 20)).toThrow(/advance/);
    expect(() => controller.beginCallerTurn('', 0)).toThrow(/turn IDs/);
    controller.beginCallerTurn('turn-2', 20);
    controller.beginCallerTurn('turn-2', 20);
    expect(() => controller.beginCallerTurn('turn-1', 0)).toThrow(/increasing/);
    expect(controller.metrics.sourceBytes).toBe(0);
  });

  it('requires a delivery outcome for every frame before another read', () => {
    const { controller } = setup();
    expect(() => controller.frameAccepted(0)).toThrow(/outstanding frame/);
    expect(() => controller.frameRejected()).toThrow(/outstanding frame/);
    controller.readFrame(0);
    expect(() => controller.readFrame(20)).toThrow(/accepted or rejected/);
    controller.frameRejected();
    expect(controller.readFrame(20)).toEqual({ frame: pcm(0), audioBytes: 0 });
  });

  it('returns defensive event snapshots', () => {
    const { controller } = startSuppression();
    const events = controller.events;
    events[0].atMs = 12345;
    events.length = 0;
    expect(controller.events).toHaveLength(1);
    expect(controller.events[0].atMs).toBe(20);
  });

  it('declares the source RMS policy while preserving the strict caller silence gate', () => {
    const { controller } = startSuppression();
    expect(controller.policy).toMatchObject({
      callerQuietMethod: 'peak',
      callerQuietSamplePeak: 8,
      sourceQuietMethod: 'rms',
      sourceQuietRmsDbfs: -60,
      sourceQuietWindowMs: 20,
      sourceQuietWindowAlignment: 'suppression_start',
      sourceQuietMs: 200,
      callerQuietMs: 200,
    });
    // Low DC/noise is a source pause, but does not change the caller's peak gate.
    for (let atMs = 20; atMs <= 200; atMs += 20) {
      controller.observeAcceptedCaller(pcm(24), atMs);
    }
    controller.appendSource(pcm(24, 200), 210);
    expect(controller.active).toBe(true);
    callerQuiet(controller, 220);
    controller.appendSource(pcm(24), 410);
    expect(controller.active).toBe(false);
    assertAccounting(controller);
  });

  it.each([0, 24, 32])('recovers through complete low-energy windows with DC level %s', (level) => {
    const { controller, queue } = startSuppression();
    callerQuiet(controller);
    const fresh = pcm(2000, 400);
    controller.appendSource(Buffer.concat([pcm(level, 200), fresh]), 210);
    expect(controller.active).toBe(false);
    expect(queue.bytes).toBe(fresh.length);
    expect(controller.readFrame(220).frame).toEqual(fresh.subarray(0, FRAME_BYTES));
    controller.frameAccepted(220);
    assertAccounting(controller);
  });

  it('preserves RMS window state across irregular source chunks', () => {
    const one = startSuppression().controller;
    const fragmented = startSuppression().controller;
    callerQuiet(one);
    callerQuiet(fragmented);
    const quiet = Buffer.alloc(200 * BYTES_PER_MS);
    for (let sample = 0; sample < quiet.length / 2; sample++) {
      quiet.writeInt16LE(24 + (sample % 5) - 2, sample * 2);
    }
    const fresh = pcm(1800, 400);
    fresh.writeInt16LE(-7123, 0);
    const source = Buffer.concat([quiet, fresh]);
    one.appendSource(source, 210);
    const splitBytes = [2, 66, 478, 1002, 1600, 2402, 9598, 9600, 9614, source.length];
    let begin = 0;
    for (const end of splitBytes) {
      fragmented.appendSource(source.subarray(begin, end), 210);
      begin = end;
    }
    expect(fragmented.events).toEqual(one.events);
    expect(fragmented.metrics).toEqual(one.metrics);
    expect(fragmented.readFrame(220)).toEqual(one.readFrame(220));
    fragmented.frameAccepted(220);
    one.frameAccepted(220);
    assertAccounting(fragmented);
    assertAccounting(one);
  });

  it('does not count a partial RMS window or a packet stall as complete source silence', () => {
    const { controller } = startSuppression();
    callerQuiet(controller);
    controller.appendSource(pcm(24, 200).subarray(0, 200 * BYTES_PER_MS - 2), 210);
    expect(controller.active).toBe(true);
    controller.checkRecovery(1000);
    expect(controller.active).toBe(true);
    callerQuiet(controller, 1000);
    controller.appendSource(Buffer.from([24, 0]), 1200);
    expect(controller.active).toBe(false);
    assertAccounting(controller);
  });

  it('starts windows after suppression even when the source position is not frame-aligned', () => {
    const { controller } = setup();
    controller.appendSource(Buffer.concat([pcm(1200, 400), Buffer.from([12, 0]), pcm(24, 200)]), 0);
    controller.readFrame(0);
    controller.frameAccepted(0);
    controller.observeAcceptedCaller(pcm(1500), 0);
    controller.beginCallerTurn('turn-1', 0);
    controller.requestStop({ turnId: 'turn-1', callerOnsetAtMs: 0, decisionAtMs: 20 });
    callerQuiet(controller);
    // Already received quiet was cleared with the old queue and cannot prime recovery.
    controller.appendSource(pcm(24, 180), 210);
    expect(controller.active).toBe(true);
    controller.appendSource(Buffer.concat([pcm(24, 20), pcm(1500, 400)]), 211);
    expect(controller.events.at(-1)).toMatchObject({
      discardedSourceStartByte: 600 * BYTES_PER_MS + 2,
      discardedSourceEndByte: 800 * BYTES_PER_MS + 2,
    });
    expect(controller.readFrame(220).frame).toEqual(pcm(1500));
    controller.frameAccepted(220);
    assertAccounting(controller);
  });

  it('rounds a minimum quiet duration up to the next complete source window', () => {
    const { controller } = startSuppression({ sourceQuietMs: 41 });
    callerQuiet(controller);
    controller.appendSource(pcm(24, 40), 210);
    expect(controller.active).toBe(true);
    controller.appendSource(pcm(24, 20), 211);
    expect(controller.active).toBe(false);
    expect(controller.metrics.discardedIncomingBytes).toBe(60 * BYTES_PER_MS);
    assertAccounting(controller);
  });

  it('reports an acoustic boundary without claiming that an old response was cancelled', () => {
    const { controller } = startSuppression();
    callerQuiet(controller);
    // An ongoing old utterance can contain a pause indistinguishable from a new
    // response boundary. PCM alone cannot label this tail as semantically stale.
    const oldTail = pcm(2700, 400);
    controller.appendSource(Buffer.concat([pcm(24, 200), oldTail]), 210);
    expect(controller.events.at(-1)).toMatchObject({ recovery: 'observed_source_quiet' });
    expect(controller.readFrame(220).frame).toEqual(oldTail.subarray(0, FRAME_BYTES));
    controller.frameAccepted(220);
    assertAccounting(controller);
  });

  it('rejects invalid policy settings and attachment to a nonempty queue', () => {
    for (const options of [
      { sourceQuietMs: 0 },
      { callerQuietMs: NaN },
      { recoveryTimeoutMs: Infinity },
      { recentTargetActivityMs: 1.5 },
      { maxInterruptions: 101 },
    ]) {
      expect(() => setup(options)).toThrow(/setting/);
    }
    const queue = new PcmAudioPlayout(FRAME_BYTES);
    queue.append(pcm(1000), 0);
    expect(() => new TargetPlaybackController(queue)).toThrow(/before any source audio/);
  });
});
