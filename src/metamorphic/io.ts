import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, open, unlink } from 'node:fs/promises';
import path from 'node:path';

function positiveLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('File byte limit must be a positive safe integer');
  }
}

/**
 * Read from the opened descriptor, not a separate stat/read pair. The extra
 * byte detects growth after stat; nonblocking open prevents FIFO hangs.
 */
export async function readJsonFile(filename: string, maxBytes: number): Promise<unknown> {
  positiveLimit(maxBytes);
  const handle = await open(filename, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error('Input must be a regular JSON file');
    }
    if (stat.size > maxBytes) {
      throw new Error('Input exceeds the file byte limit');
    }
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maxBytes) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) {
        break;
      }
      total += bytesRead;
      if (total > maxBytes) {
        throw new Error('Input exceeds the file byte limit');
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total));
    } catch {
      throw new Error('Input must contain valid UTF-8');
    }
    try {
      return JSON.parse(text);
    } catch {
      // JSON.parse errors can embed source content. Never echo them.
      throw new Error('Input is not valid JSON');
    }
  } finally {
    await handle.close();
  }
}

/**
 * Publish a complete file using a same-directory hard link. link() fails if the
 * destination already exists, including a symlink; no check-then-overwrite race.
 */
export async function writeReportFile(
  filename: string,
  text: string,
  maxBytes: number,
): Promise<void> {
  positiveLimit(maxBytes);
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new Error('Rendered report exceeds the output byte limit');
  }
  const target = path.resolve(filename);
  const temporary = path.join(path.dirname(target), `.metamorphic-${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  let closed = false;
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    closed = true;
    try {
      await link(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('Report output already exists; choose a new output path');
      }
      throw error;
    }
  } finally {
    if (!closed) {
      await handle.close();
    }
    await unlink(temporary);
  }
}
