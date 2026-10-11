import { describe, expect, it } from 'vitest';
import { PcmAudioPlayout } from '../../../src/providers/voice/audioPlayout';
import { VoiceInterventionPlayback } from '../../../src/providers/voice/interventionPlayback';

import type { VoiceIntervention } from '../../../src/providers/voice/types';

const FRAME_BYTES = 960;
const QUIET_BYTES = 9600;

function pcm(samples: number, value: number): Buffer {
  const audio = Buffer.alloc(samples * 2);
  for (let offset = 0; offset < audio.length; offset += 2) {
    audio.writeInt16LE(value, offset);
  }
  return audio;
}

function setup(audio = pcm(480, 123)) {
  const queue = new PcmAudioPlayout(48000);
  const playback = new VoiceInterventionPlayback(queue);
  const record: VoiceIntervention = { scheduledAtMs: 100, sentAtMs: 101, eventId: 'context-1' };
  const prepared = { atMs: 100, text: 'A scheduled question.', audio };
  return { queue, playback, record, prepared };
}

function accept(playback: VoiceInterventionPlayback, atMs = 100) {
  const frame = playback.readFrame()!;
  playback.frameAccepted(frame.audioBytes, atMs, atMs + 3);
  return frame;
}

describe('VoiceInterventionPlayback', () => {
  it('passes source audio through while inactive', () => {
    const { playback } = setup();
    const source = pcm(480, 42);
    expect(playback.active).toBe(false);
    expect(playback.readFrame()).toBeUndefined();
    expect(playback.filterCallerAudio(source, 500)).toBe(source);
    expect(() => playback.checkRecovery(99999)).not.toThrow();
  });

  it('clears and audits caller backlog while bypassing playout startup buffering', () => {
    const { queue, playback, prepared, record } = setup();
    queue.append(pcm(960, 999), 0);
    playback.begin(prepared, record);
    expect(queue.bytes).toBe(0);
    expect(queue.metrics.discardedBytes).toBe(1920);
    expect(record.discardedCallerAudioBytes).toBe(1920);
    expect(playback.readFrame()?.frame).toEqual(prepared.audio);
    expect(playback.active).toBe(true);
  });

  it('does not advance or record delivery until acceptance, and pads the final partial frame', () => {
    const { playback, prepared, record } = setup(pcm(482, 123));
    playback.begin(prepared, record);
    const first = playback.readFrame()!;
    expect(playback.readFrame()).toBe(first);
    expect(record).not.toHaveProperty('firstFrameAtMs');
    expect(record.deliveredAudioBytes).toBe(0);
    playback.frameAccepted(FRAME_BYTES, 100, 107);
    expect(record.firstFrameAtMs).toBe(100);
    expect(record.firstFrameSentAtMs).toBe(107);
    expect(record.deliveredAudioBytes).toBe(FRAME_BYTES);
    expect(record).not.toHaveProperty('completedAtMs');
    const last = playback.readFrame()!;
    expect(last.audioBytes).toBe(4);
    expect(last.frame.subarray(0, 4)).toEqual(prepared.audio.subarray(FRAME_BYTES));
    expect(last.frame.subarray(4)).toEqual(Buffer.alloc(FRAME_BYTES - 4));
    playback.frameAccepted(4, 120, 127);
    expect(record.deliveredAudioBytes).toBe(prepared.audio.length);
    expect(record.completedAtMs).toBeCloseTo(120 + 4 / 48);
    expect(accept(playback, 140)).toEqual({ frame: Buffer.alloc(FRAME_BYTES), audioBytes: 0 });
    expect(record.deliveredAudioBytes).toBe(964);
  });

  it('rejects mismatched or duplicate acceptance without advancing accounting', () => {
    const { playback, prepared, record } = setup();
    playback.begin(prepared, record);
    expect(() => playback.frameAccepted(FRAME_BYTES, 100, 103)).toThrow(/proposed frame/);
    playback.readFrame();
    expect(() => playback.frameAccepted(FRAME_BYTES - 2, 100, 103)).toThrow(/proposed frame/);
    expect(record.deliveredAudioBytes).toBe(0);
    playback.frameAccepted(FRAME_BYTES, 100, 103);
    expect(() => playback.frameAccepted(FRAME_BYTES, 120, 123)).toThrow(/proposed frame/);
    expect(record.deliveredAudioBytes).toBe(FRAME_BYTES);
  });

  it('does not mistake a network stall for source silence or leak its late old tail', () => {
    const { playback, prepared, record } = setup();
    playback.begin(prepared, record);
    accept(playback);
    expect(() => playback.checkRecovery(800)).not.toThrow();
    expect(playback.active).toBe(true);
    expect(playback.filterCallerAudio(pcm(2400, 700), 800)).toBeUndefined();
    expect(record.discardedCallerAudioBytes).toBe(4800);
    expect(playback.active).toBe(true);
    expect(record).not.toHaveProperty('callerResumedAtMs');
  });

  it('requires contiguous observed quiet samples and returns fresh speech after the exact boundary', () => {
    const { playback, prepared, record } = setup();
    playback.begin(prepared, record);
    accept(playback);
    expect(playback.filterCallerAudio(Buffer.alloc(QUIET_BYTES - 2), 150)).toBeUndefined();
    const fresh = pcm(600, 456);
    expect(playback.filterCallerAudio(Buffer.concat([Buffer.alloc(2), fresh]), 200)).toEqual(fresh);
    expect(record.discardedCallerAudioBytes).toBe(QUIET_BYTES);
    expect(record.callerResumedAtMs).toBe(200);
    expect(playback.active).toBe(false);
    expect(playback.readFrame()).toBeUndefined();
  });

  it('resets the quiet boundary on even one active sample', () => {
    const { playback, prepared } = setup();
    playback.begin(prepared, preparedRecord());
    accept(playback);
    playback.filterCallerAudio(Buffer.alloc(QUIET_BYTES - 2), 200);
    playback.filterCallerAudio(pcm(1, 9), 220);
    playback.filterCallerAudio(Buffer.alloc(QUIET_BYTES - 2), 400);
    expect(playback.active).toBe(true);
    playback.filterCallerAudio(pcm(1, -8), 420);
    expect(playback.active).toBe(false);
  });

  it('suppresses all source audio during the clip even after an earlier quiet boundary', () => {
    const { playback, prepared, record } = setup(pcm(960, 123));
    playback.begin(prepared, record);
    const source = Buffer.concat([Buffer.alloc(QUIET_BYTES), pcm(480, 999)]);
    expect(playback.filterCallerAudio(source, 110)).toBeUndefined();
    expect(record.discardedCallerAudioBytes).toBe(source.length);
    accept(playback, 100);
    accept(playback, 120);
    expect(playback.active).toBe(true);
    playback.filterCallerAudio(Buffer.alloc(QUIET_BYTES), 350);
    expect(playback.active).toBe(false);
  });

  it('can resume immediately at clip completion if the most recent source samples were quiet', () => {
    const { playback, prepared, record } = setup();
    playback.begin(prepared, record);
    playback.filterCallerAudio(Buffer.alloc(QUIET_BYTES), 105);
    expect(playback.active).toBe(true);
    accept(playback, 100);
    expect(record.callerResumedAtMs).toBe(103);
    expect(playback.active).toBe(false);
  });

  it('bounds recovery from the accepted final frame, including a completely silent network', () => {
    const { playback, prepared } = setup();
    playback.begin(prepared, preparedRecord());
    expect(() => playback.checkRecovery(99999)).not.toThrow();
    accept(playback, 100);
    expect(() => playback.checkRecovery(3103)).not.toThrow();
    expect(() => playback.checkRecovery(3104)).toThrow(/observed silence/);
  });

  it('rejects overlapping takeovers until recovery completes, then clears new backlog', () => {
    const { queue, playback, prepared, record } = setup();
    playback.begin(prepared, record);
    expect(() => playback.begin(prepared, preparedRecord())).toThrow(/not recovered/);
    accept(playback);
    expect(() => playback.begin(prepared, preparedRecord())).toThrow(/not recovered/);
    playback.filterCallerAudio(Buffer.alloc(QUIET_BYTES), 400);
    queue.append(pcm(20, 17), 420);
    const second = preparedRecord();
    playback.begin(prepared, second);
    expect(second.discardedCallerAudioBytes).toBe(40);
    expect(second.deliveredAudioBytes).toBe(0);
  });

  it('rejects partial PCM samples without releasing suppression', () => {
    const { playback, prepared, record } = setup();
    expect(() => playback.begin({ ...prepared, audio: Buffer.alloc(1) }, record)).toThrow(/PCM16/);
    expect(playback.active).toBe(false);
    playback.begin(prepared, record);
    expect(() => playback.filterCallerAudio(Buffer.alloc(1), 200)).toThrow(/PCM16/);
    expect(playback.active).toBe(true);
  });
});

function preparedRecord(): VoiceIntervention {
  return { scheduledAtMs: 100, sentAtMs: 101, eventId: 'context-test' };
}
