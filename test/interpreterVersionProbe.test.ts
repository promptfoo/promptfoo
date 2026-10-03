import { once } from 'node:events';
import type { ChildProcess, ExecFileOptions } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryPath as tryPython } from '../src/python/pythonUtils';
import { tryPath as tryRuby } from '../src/ruby/rubyUtils';

const state = vi.hoisted(() => ({
  children: [] as Array<{ child: ChildProcess; closed: boolean; options?: ExecFileOptions }>,
}));

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(actual.execFile);
  const run = (_file: string, args: string[], options?: ExecFileOptions) => {
    expect(args).toEqual(['--version']);
    // Keep the real subprocess lifecycle, substituting Node so CI needs neither
    // interpreter. Shorten only a timeout explicitly supplied by production.
    if (options?.timeout !== undefined) {
      expect(options.timeout).toBe(2500);
    }
    const pending = execFileAsync(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      ...options,
      ...(options?.timeout === undefined ? {} : { timeout: 50 }),
    });
    const record = { child: pending.child, closed: false, options };
    pending.child.once('close', () => {
      record.closed = true;
    });
    state.children.push(record);
    return pending;
  };
  return {
    ...actual,
    execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: run }),
  };
});

beforeEach(() => {
  state.children.length = 0;
  vi.useFakeTimers();
});

afterEach(async () => {
  try {
    for (const record of state.children) {
      if (!record.closed) {
        const closed = once(record.child, 'close');
        record.child.kill('SIGKILL');
        await closed;
      }
    }
  } finally {
    vi.useRealTimers();
    vi.resetAllMocks();
  }
});

describe('interpreter version probe lifetime', () => {
  it.each([
    ['Python', tryPython],
    ['Ruby', tryRuby],
  ] as const)(
    '%s has terminated its subprocess before returning on timeout',
    async (_name, probe) => {
      const result = probe('fixture-interpreter');
      const record = state.children[0];
      expect(record).toBeDefined();
      await once(record.child, 'spawn');
      // Also exercise the old outer timeout: it returned while the child lived.
      await vi.advanceTimersByTimeAsync(2500);
      expect(await result).toBeNull();
      expect(record.closed, 'a timed-out version probe must await child termination').toBe(true);
      expect(record.child.killed).toBe(true);
      expect(record.options).toEqual({ timeout: 2500, killSignal: 'SIGKILL' });
    },
  );
});
