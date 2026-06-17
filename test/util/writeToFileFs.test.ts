import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonlFileWriter } from '../../src/util/exportToFile/writeToFile';

// Unmocked counterpart to writeToFile.test.ts: pins the real-stream assumptions the
// writer relies on — createWriteStream's default emitClose means 'close' always fires
// (close() can never hang), and the file descriptor is released before close() resolves
// so the file and its directory can be removed immediately (the Windows ENOTEMPTY race).
describe('JsonlFileWriter (real filesystem)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-jsonl-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('releases the file descriptor before close() resolves', async () => {
    const file = path.join(dir, 'out.jsonl');
    const writer = new JsonlFileWriter(file);
    await writer.write({ a: 1 });
    await writer.write({ b: 2 });
    await writer.close();

    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ a: 1 }, { b: 2 }]);

    // Non-recursive removal fails (EBUSY/ENOTEMPTY on Windows) if the fd is still held.
    fs.rmSync(file);
    fs.rmdirSync(dir);
    fs.mkdirSync(dir);
  });

  it('resolves a second close() call on an already-closed stream', async () => {
    const writer = new JsonlFileWriter(path.join(dir, 'out.jsonl'));
    await writer.write({ a: 1 });
    await writer.close();
    await expect(writer.close()).resolves.toBeUndefined();
  });

  it('leaves the destination untouched when nothing was written', async () => {
    const file = path.join(dir, 'never.jsonl');
    await expect(new JsonlFileWriter(file).close()).resolves.toBeUndefined();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('rejects close() when the stream failed mid-run', async () => {
    const file = path.join(dir, 'broken.jsonl');
    const writer = new JsonlFileWriter(file);
    await writer.write({ a: 1 });
    // Destroy with an error to simulate an fd failure between writes; the recorded
    // pre-flush error must reject close() rather than be swallowed.
    (writer as unknown as { writeStream: { destroy: (error: Error) => void } }).writeStream.destroy(
      new Error('EBADF: bad file descriptor'),
    );

    await expect(writer.close()).rejects.toThrow(
      `Failed to close JSONL output ${file}: EBADF: bad file descriptor`,
    );
  });
});
