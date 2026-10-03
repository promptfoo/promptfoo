import { once } from 'node:events';
import type { ChildProcess, ExecFileOptions } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSysExecutable,
  state as pythonState,
  validatePythonPath,
} from '../../src/python/pythonUtils';

const fixture = vi.hoisted(() => ({
  records: [] as Array<{
    command: string;
    args: string[];
    options?: ExecFileOptions;
    child: ChildProcess;
    closed: boolean;
    watchdogKilled: boolean;
  }>,
  hangCommand: 'python3',
}));

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(actual.execFile);
  const run = (command: string, args: string[], options?: ExecFileOptions) => {
    const hangs = command === fixture.hangCommand;
    const output = args[0] === '--version' ? 'not an interpreter' : '/fixture/python';
    const childPromise = exec(
      process.execPath,
      [
        '-e',
        hangs
          ? "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"
          : `console.log(${JSON.stringify(output)})`,
      ],
      {
        ...options,
        // Keep actual process termination; shorten only the supplied production budget.
        ...(hangs && options?.timeout !== undefined ? { timeout: 100 } : {}),
      },
    );
    const record = {
      command,
      args,
      options,
      child: childPromise.child,
      closed: false,
      watchdogKilled: false,
    };
    fixture.records.push(record);
    // The original unbounded discovery must fail promptly without leaving a child behind.
    const watchdog = hangs
      ? setTimeout(() => {
          record.watchdogKilled = true;
          record.child.kill('SIGKILL');
        }, 1000)
      : undefined;
    record.child.once('close', () => {
      clearTimeout(watchdog);
      record.closed = true;
    });
    return childPromise;
  };
  return {
    ...actual,
    execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: run }),
  };
});

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => {
  fixture.records.length = 0;
  pythonState.cachedPythonPath = null;
  pythonState.validationPromise = null;
});
afterEach(async () => {
  Object.defineProperty(process, 'platform', originalPlatform);
  for (const record of fixture.records) {
    if (!record.closed) {
      const exited = once(record.child, 'close');
      record.child.kill('SIGKILL');
      await exited;
    }
  }
  pythonState.cachedPythonPath = null;
  pythonState.validationPromise = null;
  vi.restoreAllMocks();
});

function expectTerminatedProbe(command: string) {
  const record = fixture.records.find((item) => item.command === command)!;
  expect(record.closed).toBe(true);
  expect(
    record.watchdogKilled,
    'production must terminate discovery before the external watchdog',
  ).toBe(false);
  expect(record.options).toEqual({ timeout: 2500, killSignal: 'SIGKILL' });
}

describe('Python discovery subprocess lifetime', () => {
  it.each([
    { platform: 'linux', command: 'python3', fallback: 'python' },
    { platform: 'win32', command: 'where', fallback: 'py' },
  ])(
    'bounds $command and continues $platform discovery in order',
    async ({ platform, command, fallback }) => {
      Object.defineProperty(process, 'platform', { value: platform });
      fixture.hangCommand = command;
      expect(await getSysExecutable()).toBe('/fixture/python');
      expect(fixture.records.map((record) => record.command)).toEqual([command, fallback]);
      expectTerminatedProbe(command);
      expect(fixture.records[1].options).toEqual({ timeout: 2500, killSignal: 'SIGKILL' });
    },
  );

  it('shares pending validation and keeps its successful result after discovery times out', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    fixture.hangCommand = 'python3';
    const first = validatePythonPath('python', false);
    const second = validatePythonPath('python', false);
    expect(await Promise.all([first, second])).toEqual(['/fixture/python', '/fixture/python']);
    expect(fixture.records.map(({ command, args }) => [command, args])).toEqual([
      ['python', ['--version']],
      ['python3', ['-c', 'import sys; print(sys.executable)']],
      ['python', ['-c', 'import sys; print(sys.executable)']],
    ]);
    expectTerminatedProbe('python3');
    expect(pythonState.validationPromise).toBeNull();
    expect(await validatePythonPath('python', false)).toBe('/fixture/python');
    expect(fixture.records).toHaveLength(3);
  });
});
