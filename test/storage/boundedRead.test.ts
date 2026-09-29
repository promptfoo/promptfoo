import { open } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileBounded } from '../../src/storage/boundedRead';

vi.mock('node:fs/promises', () => ({ open: vi.fn() }));

afterEach(() => vi.resetAllMocks());

describe('bounded managed-file reads', () => {
  beforeEach(() => vi.resetAllMocks());

  it('rejects an oversized file before reading its contents and closes the handle', async () => {
    const handle = {
      stat: vi.fn().mockResolvedValue({ size: 101, isFile: () => true }),
      read: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(open).mockResolvedValue(handle as unknown as Awaited<ReturnType<typeof open>>);
    await expect(readFileBounded('fixture.mp4', 100)).rejects.toMatchObject({ code: 'too-large' });
    expect(handle.read).not.toHaveBeenCalled();
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it('uses a bounded read when a file grows after stat', async () => {
    const handle = {
      stat: vi.fn().mockResolvedValue({ size: 2, isFile: () => true }),
      read: vi.fn().mockImplementation(async (buffer: Buffer, offset: number, length: number) => {
        expect(buffer.length).toBe(3);
        expect(length).toBe(3);
        buffer.fill(1, offset);
        return { bytesRead: length };
      }),
      close: vi.fn(),
    };
    vi.mocked(open).mockResolvedValue(handle as unknown as Awaited<ReturnType<typeof open>>);
    await expect(readFileBounded('fixture.mp4', 2)).rejects.toMatchObject({ code: 'too-large' });
    expect(handle.close).toHaveBeenCalledOnce();
  });
});
