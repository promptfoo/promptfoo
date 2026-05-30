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

  it('resolves after the final flush completes', async () => {
    const stream = createMockWriteStream();
    stream.end.mockImplementation((callback?: () => void) => {
      callback?.();
      return stream;
    });

    await expect(new JsonlFileWriter('/tmp/results.jsonl').close()).resolves.toBeUndefined();
    expect(stream.listenerCount('error')).toBe(0);
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
