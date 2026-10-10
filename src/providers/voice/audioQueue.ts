/** Bounded PCM16 FIFO. Silence fills underflow, so the media clock never waits for a speaker. */
export class PcmAudioQueue {
  private chunks: Buffer[] = [];
  private offset = 0;
  bytes = 0;
  deliveredBytes = 0;
  peakBytes = 0;

  constructor(private readonly maxBytes: number) {}

  append(audio: Buffer): void {
    if (audio.length % 2 !== 0) {
      throw new Error('Voice audio contains an incomplete PCM16 sample.');
    }
    if (this.bytes + audio.length > this.maxBytes) {
      throw new Error('Voice audio exceeded the configured buffering limit.');
    }
    if (audio.length > 0) {
      this.chunks.push(audio);
      this.bytes += audio.length;
      this.peakBytes = Math.max(this.peakBytes, this.bytes);
    }
  }

  /** Return exactly one frame, consuming each source sample once. */
  read(size: number): Buffer {
    const frame = Buffer.alloc(size);
    let written = 0;
    while (written < size && this.chunks.length > 0) {
      const chunk = this.chunks[0];
      const length = Math.min(chunk.length - this.offset, size - written);
      chunk.copy(frame, written, this.offset, this.offset + length);
      this.offset += length;
      written += length;
      this.bytes -= length;
      this.deliveredBytes += length;
      if (this.offset === chunk.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }
    return frame;
  }
}
