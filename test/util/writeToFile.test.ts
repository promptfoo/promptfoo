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

function createMockWriteStream() {
  const stream = Object.assign(new EventEmitter(), {
    end: vi.fn(),
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

  it('resolves after the final flush completes and swallows a late close error', async () => {
    const stream = createMockWriteStream();
    stream.end.mockImplementation((callback?: () => void) => {
      callback?.();
      return stream;
    });

    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    await writer.write({ a: 1 });
    await expect(writer.close()).resolves.toBeUndefined();
    // The rejecting listener is replaced (not left attached), and a late fd-close error
    // emitted after 'finish' is swallowed rather than thrown as an unhandled 'error' event.
    expect(stream.listenerCount('error')).toBe(1);
    expect(() => stream.emit('error', new Error('late close error'))).not.toThrow();
  });

  it('rejects final flush errors with the output path', async () => {
    const stream = createMockWriteStream();
    stream.end.mockImplementation(() => {
      stream.emit('error', new Error('disk full'));
      return stream;
    });

    const writer = new JsonlFileWriter('/tmp/results.jsonl');
    await writer.write({ a: 1 });
    await expect(writer.close()).rejects.toThrow(
      'Failed to close JSONL output /tmp/results.jsonl: disk full',
    );
  });
});
