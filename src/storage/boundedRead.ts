import { open } from 'node:fs/promises';

export class BoundedReadError extends Error {
  constructor(readonly code: 'too-large' | 'unsupported') {
    super(
      code === 'too-large'
        ? 'Managed video exceeds the grading size budget'
        : 'This storage provider does not support bounded video reads',
    );
    this.name = 'BoundedReadError';
  }
}

export async function readFileBounded(filePath: string, maxBytes: number): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('Read budget must be a non-negative integer');
  }
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new BoundedReadError('unsupported');
    }
    if (stat.size > maxBytes) {
      throw new BoundedReadError('too-large');
    }
    // One extra byte detects a file growing between stat and read without an unbounded allocation.
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) {
        return buffer.subarray(0, offset);
      }
      offset += bytesRead;
    }
    throw new BoundedReadError('too-large');
  } finally {
    await handle.close();
  }
}
