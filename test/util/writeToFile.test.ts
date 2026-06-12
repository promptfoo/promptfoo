import { EventEmitter } from 'events';
import type { WriteStream } from 'fs';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonlFileWriter } from '../../src/util/exportToFile/writeToFile';

const mocks = vi.hoisted(() => ({
  createWriteStream: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  createWriteStream: mocks.createWriteStream,
}));

function createMockWriteStream({ destroyed = false }: { destroyed?: boolean } = {}) {
  const stream = Object.assign(new EventEmitter(), {
    closed: false,
    destroyed,
    end: vi.fn(),
    // Mirror Node semantics: destroy() marks the stream destroyed and emits 'close'.
    destroy: vi.fn(() => {
      stream.destroyed = true;
      stream.emit('close');
      return stream;
    }),
    write: vi.fn((_data: string, callback?: (error?: Error | null) => void) => {
      callback?.();
      return true;
    }),
  });
  mocks.createWriteStream.mockReturnValue(stream as unknown as WriteStream);
  return stream;
}

describe('JsonlFileWriter', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('opens the stream lazily and truncates by default, appending only when requested', async () => {
    createMockWriteStream();
    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    // Constructing the writer must not open (and thus truncate) the destination file.
    expect(mocks.createWriteStream).not.toHaveBeenCalled();

    await writer.write({ a: 1 });
    expect(mocks.createWriteStream).toHaveBeenCalledWith('/tmp/results.jsonl', { flags: 'w' });

    mocks.createWriteStream.mockClear();
    createMockWriteStream();
    const appender = new JsonlFileWriter('/tmp/results.jsonl', { append: true });
    await appender.write({ a: 1 });
    expect(mocks.createWriteStream).toHaveBeenCalledWith('/tmp/results.jsonl', { flags: 'a' });
  });

  it('leaves the destination untouched when nothing is written', async () => {
    createMockWriteStream();
    await expect(new JsonlFileWriter('/tmp/results.jsonl').close()).resolves.toBeUndefined();
    expect(mocks.createWriteStream).not.toHaveBeenCalled();
  });

  it('waits for the underlying file descriptor to close', async () => {
    const stream = createMockWriteStream();
    stream.end.mockImplementation(() => stream);

    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    await writer.write({ a: 1 });
    const closePromise = writer.close();
    let settled = false;
    closePromise.finally(() => {
      settled = true;
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    stream.emit('close');
    await expect(closePromise).resolves.toBeUndefined();
    // Only the persistent recorder remains; close()'s temporary error listener was removed.
    expect(stream.listenerCount('error')).toBe(1);
  });

  it('rejects errors emitted while the file descriptor is closing', async () => {
    const stream = createMockWriteStream();
    stream.end.mockImplementation(() => stream);

    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    await writer.write({ a: 1 });
    const closePromise = writer.close();

    // The flush never completed ('finish' was not emitted), so data may be missing.
    stream.emit('error', new Error('late close error'));
    stream.emit('close');

    await expect(closePromise).rejects.toThrow(
      'Failed to close JSONL output /tmp/results.jsonl: late close error',
    );
  });

  it('reports and resolves when an error arrives after the final flush', async () => {
    const onPostFlushError = vi.fn();
    const stream = createMockWriteStream();
    stream.end.mockImplementation(() => stream);

    const writer = new JsonlFileWriter('/tmp/results.jsonl', { onPostFlushError });
    await writer.write({ a: 1 });
    const closePromise = writer.close();

    // Simulate a failure from the fd close(2) itself: the flush completed ('finish',
    // writableFinished=true), then the error fires. The bytes are on disk, so close()
    // must not fail an otherwise-successful run.
    (stream as { writableFinished?: boolean }).writableFinished = true;
    stream.emit('error', new Error('EIO: i/o error, close'));
    stream.emit('close');

    await expect(closePromise).resolves.toBeUndefined();
    expect(onPostFlushError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Error while closing JSONL output /tmp/results.jsonl after the final flush',
      ),
    );
  });

  it('resolves immediately when the stream already closed cleanly', async () => {
    const stream = createMockWriteStream();
    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    await writer.write({ a: 1 });

    stream.closed = true;
    await expect(writer.close()).resolves.toBeUndefined();
    expect(stream.end).not.toHaveBeenCalled();
  });

  it('rejects with a previously recorded error when the stream already closed', async () => {
    const stream = createMockWriteStream();
    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    await writer.write({ a: 1 });

    // A real stream that fails mid-run auto-destroys: 'error' and 'close' fire
    // before close() is ever called. The recorded error must still reject close()
    // rather than be swallowed (the output file is truncated/incomplete).
    stream.emit('error', new Error('EBADF: bad file descriptor'));
    stream.closed = true;

    await expect(writer.close()).rejects.toThrow(
      'Failed to close JSONL output /tmp/results.jsonl: EBADF: bad file descriptor',
    );
    expect(stream.end).not.toHaveBeenCalled();
  });

  it('waits for a destroyed stream to close without calling end()', async () => {
    const stream = createMockWriteStream();
    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    await writer.write({ a: 1 });

    stream.destroyed = true;
    const closePromise = writer.close();
    let settled = false;
    closePromise.finally(() => {
      settled = true;
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(stream.end).not.toHaveBeenCalled();

    stream.emit('close');
    await expect(closePromise).resolves.toBeUndefined();
  });

  it('destroys the stream and rejects when end() throws synchronously', async () => {
    const stream = createMockWriteStream();
    stream.end.mockImplementation(() => {
      throw new Error('end failed');
    });

    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    await writer.write({ a: 1 });

    await expect(writer.close()).rejects.toThrow(
      'Failed to close JSONL output /tmp/results.jsonl: end failed',
    );
    expect(stream.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects final flush errors with the output path', async () => {
    const stream = createMockWriteStream();
    stream.end.mockImplementation(() => {
      stream.emit('error', new Error('disk full'));
      stream.emit('close');
      return stream;
    });

    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    await writer.write({ a: 1 });
    await expect(writer.close()).rejects.toThrow(
      'Failed to close JSONL output /tmp/results.jsonl: disk full',
    );
  });
});
