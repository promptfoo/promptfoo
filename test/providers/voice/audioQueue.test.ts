import { describe, expect, it } from 'vitest';
import { PcmAudioQueue } from '../../../src/providers/voice/audioQueue';

describe('PcmAudioQueue', () => {
  it('preserves sample order across chunk/frame boundaries and pads only missing samples', () => {
    const queue = new PcmAudioQueue(20);
    queue.append(Buffer.from([1, 0, 2, 0, 3, 0]));
    expect(queue.read(4)).toEqual(Buffer.from([1, 0, 2, 0]));
    queue.append(Buffer.from([4, 0, 5, 0]));
    expect(queue.read(4)).toEqual(Buffer.from([3, 0, 4, 0]));
    expect(queue.read(4)).toEqual(Buffer.from([5, 0, 0, 0]));
    expect(queue.deliveredBytes).toBe(10);
    expect(queue.bytes).toBe(0);
    expect(queue.peakBytes).toBe(6);
  });
  it('rejects partial samples and overflow without corrupting buffered audio', () => {
    const queue = new PcmAudioQueue(4);
    queue.append(Buffer.from([1, 0, 2, 0]));
    expect(() => queue.append(Buffer.from([3]))).toThrow(/PCM16/);
    expect(() => queue.append(Buffer.from([3, 0]))).toThrow(/buffering/);
    expect(queue.read(4)).toEqual(Buffer.from([1, 0, 2, 0]));
  });
});
