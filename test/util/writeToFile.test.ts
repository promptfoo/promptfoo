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
  const stream = Object.assign(new EventEmitter(), { end: vi.fn() });
  mocks.createWriteStream.mockReturnValue(stream as unknown as WriteStream);
  return stream;
}

describe('JsonlFileWriter', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('resolves after the final flush completes and swallows a late close error', async () => {
    const stream = createMockWriteStream();
    stream.end.mockImplementation((callback?: () => void) => {
      callback?.();
      return stream;
    });

    await expect(new JsonlFileWriter('/tmp/results.jsonl').close()).resolves.toBeUndefined();
    // The rejecting listener is replaced (not left attached), and a late fd-close error
    // emitted after 'finish' is swallowed rather than thrown as an unhandled 'error' event.
    expect(stream.listenerCount('error')).toBe(1);
    expect(() => stream.emit('error', new Error('late close error'))).not.toThrow();
  });

  it('truncates by default and appends only when requested', async () => {
    createMockWriteStream();
    new JsonlFileWriter('/tmp/results.jsonl');
    expect(mocks.createWriteStream).toHaveBeenCalledWith('/tmp/results.jsonl', { flags: 'w' });

    mocks.createWriteStream.mockClear();
    createMockWriteStream();
    new JsonlFileWriter('/tmp/results.jsonl', { append: true });
    expect(mocks.createWriteStream).toHaveBeenCalledWith('/tmp/results.jsonl', { flags: 'a' });
  });

  it('rejects final flush errors with the output path', async () => {
    const stream = createMockWriteStream();
    stream.end.mockImplementation(() => {
      stream.emit('error', new Error('disk full'));
      return stream;
    });

    await expect(new JsonlFileWriter('/tmp/results.jsonl').close()).rejects.toThrow(
      'Failed to close JSONL output /tmp/results.jsonl: disk full',
    );
  });
});
