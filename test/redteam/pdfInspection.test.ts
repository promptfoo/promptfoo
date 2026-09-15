import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPdf, inspectPdf, scanPdf } from '../../src/redteam/pdf';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

const operations = [
  { name: 'inspection', operation: inspectPdf },
  { name: 'scanning', operation: scanPdf },
  { name: 'creation', operation: () => createPdf('Invoice') },
  { name: 'appending', operation: (bytes: Buffer) => createPdf('Review notes', bytes) },
];

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
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('keeps uploaded template parsing out of the parent process', async () => {
    vi.stubEnv('NODE_OPTIONS', '--max-old-space-size=8192');
    const load = vi
      .spyOn(PDFDocument, 'load')
      .mockRejectedValue(new Error('Parent parsing forbidden'));
    const rendered = Buffer.from('%PDF-rendered');
    const text = 'Review notes: `process.exit(1)`';
    const result = createPdf(text, Buffer.from('%PDF-template'));
    child.emit('message', { result: rendered.toString('base64') });
    await expect(result).resolves.toEqual(rendered);
    expect(load).not.toHaveBeenCalled();
    expect(JSON.parse(child.stdin.end.mock.calls[0][0])).toEqual({
      bytes: Buffer.from('%PDF-template').toString('base64'),
      text,
    });
    expect(vi.mocked(spawn).mock.calls[0][1]).toEqual(
      expect.arrayContaining(['--max-old-space-size=256', '--max-semi-space-size=16']),
    );
    expect(vi.mocked(spawn).mock.calls[0][2]?.env?.NODE_OPTIONS).toBe('');
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it.each(operations)('kills $name when the process never responds', async ({ operation }) => {
    const result = operation(Buffer.from('%PDF-1.7'));
    const assertion = expect(result).rejects.toThrow('15-second limit');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it.each(operations)('reports a $name memory failure without hanging', async ({ operation }) => {
    const result = operation(Buffer.from('%PDF-1.7'));
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
