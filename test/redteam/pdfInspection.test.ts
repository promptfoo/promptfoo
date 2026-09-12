import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectPdf, scanPdf } from '../../src/redteam/pdf';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

describe('PDF inspection process lifecycle', () => {
  let child: EventEmitter & {
    stdin: EventEmitter & { end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    child = Object.assign(new EventEmitter(), {
      stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
      kill: vi.fn(() => {
        child.emit('close');
        return true;
      }),
    });
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it.each([
    { name: 'inspection', operation: inspectPdf },
    { name: 'scanning', operation: scanPdf },
  ])('kills $name when the process never responds', async ({ operation }) => {
    const result = operation(Buffer.from('%PDF-1.7'));
    const assertion = expect(result).rejects.toThrow('15-second limit');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('reports a parser memory failure without hanging', async () => {
    const result = inspectPdf(Buffer.from('%PDF-1.7'));
    child.emit('exit', null, 'SIGABRT');
    await expect(result).rejects.toThrow('document may exceed parser memory limits');
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('stops the process and clears its timeout after success', async () => {
    const result = inspectPdf(Buffer.from('%PDF-1.7'));
    child.emit('message', { result: { text: 'Invoice', pageCount: 1 } });
    await expect(result).resolves.toEqual({ text: 'Invoice', pageCount: 1 });
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
