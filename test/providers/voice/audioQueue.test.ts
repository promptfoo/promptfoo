import { describe, expect, it } from 'vitest';
import { PcmAudioQueue } from '../../../src/providers/voice/audioQueue';

describe('PcmAudioQueue', () => {
  it('preserves sample order across chunk/frame boundaries and pads only missing samples', () => {
    const queue = new PcmAudioQueue(20);
    queue.append(Buffer.from([1, 0, 2, 0, 3, 0]));
    expect(queue.read(4)).toEqual({ frame: Buffer.from([1, 0, 2, 0]), audioBytes: 4 });
    queue.append(Buffer.from([4, 0, 5, 0]));
    expect(queue.read(4)).toEqual({ frame: Buffer.from([3, 0, 4, 0]), audioBytes: 4 });
    expect(queue.read(4)).toEqual({ frame: Buffer.from([5, 0, 0, 0]), audioBytes: 2 });
    expect(queue.bytes).toBe(0);
    expect(queue.peakBytes).toBe(6);
  });
  it('rejects partial samples and overflow without corrupting buffered audio', () => {
    const queue = new PcmAudioQueue(4);
    queue.append(Buffer.from([1, 0, 2, 0]));
    expect(() => queue.append(Buffer.from([3]))).toThrow(/PCM16/);
    expect(() => queue.append(Buffer.from([3, 0]))).toThrow(/buffering/);
    expect(queue.read(4)).toEqual({ frame: Buffer.from([1, 0, 2, 0]), audioBytes: 4 });
  });

  it('preserves fragmented PCM through partial reads, compaction, drain, and refill', () => {
    const queue = new PcmAudioQueue(24000);
    const source = Buffer.alloc(18000);
    for (let sample = 0; sample < source.length / 2; sample++) {
      source.writeInt16LE(sample, sample * 2);
    }
    for (let offset = 0; offset < source.length; offset += 6) {
      queue.append(source.subarray(offset, offset + 6));
    }
    expect(queue.peakBytes).toBe(source.length);
    expect(queue.read(10)).toEqual({ frame: source.subarray(0, 10), audioBytes: 10 });
    expect(queue.bytes).toBe(source.length - 10);
    // Consume thousands of fragments while leaving a partially read chunk at the head.
    expect(queue.read(12000)).toEqual({
      frame: source.subarray(10, 12010),
      audioBytes: 12000,
    });
    const tail = Buffer.from([1, 0, 2, 0, 3, 0]);
    queue.append(tail);
    const remaining = Buffer.concat([source.subarray(12010), tail]);
    expect(queue.bytes).toBe(remaining.length);
    expect(queue.read(remaining.length + 6)).toEqual({
      frame: Buffer.concat([remaining, Buffer.alloc(6)]),
      audioBytes: remaining.length,
    });
    expect(queue.bytes).toBe(0);
    queue.append(Buffer.from([9, 0]));
    queue.append(Buffer.from([10, 0]));
    expect(queue.read(6)).toEqual({ frame: Buffer.from([9, 0, 10, 0, 0, 0]), audioBytes: 4 });
    expect(queue.bytes).toBe(0);
    expect(queue.peakBytes).toBe(source.length);
  });
});
