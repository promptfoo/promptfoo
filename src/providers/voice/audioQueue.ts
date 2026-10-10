/** Bounded PCM16 FIFO. Silence fills underflow, so the media clock never waits for a speaker. */
export class PcmAudioQueue {
  private chunks: Buffer[] = [];
  private head = 0;
  private offset = 0;
  bytes = 0;
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

  /** Return a padded frame and its source-byte count; transport acceptance is tracked by the caller. */
  read(size: number): { frame: Buffer; audioBytes: number } {
    const frame = Buffer.alloc(size);
    let written = 0;
    while (written < size && this.head < this.chunks.length) {
      const chunk = this.chunks[this.head];
      const length = Math.min(chunk.length - this.offset, size - written);
      chunk.copy(frame, written, this.offset, this.offset + length);
      this.offset += length;
      written += length;
      this.bytes -= length;
      if (this.offset === chunk.length) {
        this.head++;
        this.offset = 0;
      }
    }
    // Release consumed buffers in batches without shifting the array for every tiny chunk.
    if (this.head === this.chunks.length) {
      this.chunks = [];
      this.head = 0;
    } else if (this.head >= 1024 && this.head * 2 >= this.chunks.length) {
      this.chunks = this.chunks.slice(this.head);
      this.head = 0;
    }
    return { frame, audioBytes: written };
  }
}
