import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runInstallProfileCommand,
  terminateProcessTree,
} from '../../scripts/installProfileProcess';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('terminateProcessTree', () => {
  it('kills the entire detached POSIX process group', () => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const exec = vi.spyOn(childProcess, 'execFileSync');

    expect(terminateProcessTree(1234, 'linux')).toBeUndefined();
    expect(kill).toHaveBeenCalledExactlyOnceWith(-1234, 'SIGKILL');
    expect(exec).not.toHaveBeenCalled();
  });

  it('ignores a POSIX process group that already exited', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('already exited'), { code: 'ESRCH' });
    });

    expect(() => terminateProcessTree(1234, 'darwin')).not.toThrow();
  });

  it.each([' 1234 Z\n 1234 Z+\n 5678 S\n', ' 5678 S\n'])(
    'accepts Darwin EPERM only when no live group members remain: %j',
    (processes) => {
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw Object.assign(new Error('no signalable members'), { code: 'EPERM' });
      });
      const inspect = vi.spyOn(childProcess, 'execFileSync').mockReturnValue(processes);

      expect(() => terminateProcessTree(1234, 'darwin')).not.toThrow();
      expect(inspect).toHaveBeenCalledExactlyOnceWith('/bin/ps', ['-axo', 'pgid=,stat='], {
        encoding: 'utf8',
        timeout: 10000,
      });
    },
  );

  it.each([' 1234 S\n', ' 1234 Z\n 1234 R+\n', 'unrecognized output\n', '', '\n'])(
    'preserves Darwin EPERM when cleanup cannot be verified: %j',
    (processes) => {
      const error = Object.assign(new Error('permission denied'), { code: 'EPERM' });
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw error;
      });
      vi.spyOn(childProcess, 'execFileSync').mockReturnValue(processes);

      expect(() => terminateProcessTree(1234, 'darwin')).toThrow(error);
    },
  );

  it('preserves Darwin EPERM when process inspection fails', () => {
    const error = Object.assign(new Error('permission denied'), { code: 'EPERM' });
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw error;
    });
    vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      throw new Error('ps failed');
    });

    expect(() => terminateProcessTree(1234, 'darwin')).toThrow(error);
  });

  it.each(['EPERM', 'EINVAL', undefined])('preserves POSIX cleanup errors: %s', (code) => {
    const error = Object.assign(new Error('cleanup failed'), { code });
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw error;
    });

    expect(() => terminateProcessTree(1234, 'linux')).toThrow(error);
  });

  it('synchronously terminates the Windows process tree with a bounded taskkill', () => {
    const exec = vi.spyOn(childProcess, 'execFileSync').mockReturnValue(Buffer.alloc(0));
    const kill = vi.spyOn(process, 'kill');

    expect(terminateProcessTree(1234, 'win32')).toBeUndefined();
    expect(exec).toHaveBeenCalledExactlyOnceWith('taskkill', ['/PID', '1234', '/T', '/F'], {
      stdio: 'ignore',
      timeout: 10000,
    });
    expect(kill).not.toHaveBeenCalled();
  });

  it('propagates Windows taskkill failures so incomplete cleanup cannot be trusted', () => {
    const error = Object.assign(new Error('taskkill failed'), { status: 1 });
    vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      throw error;
    });

    expect(() => terminateProcessTree(1234, 'win32')).toThrow(error);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid process ids: %s',
    (pid) => {
      const kill = vi.spyOn(process, 'kill');
      const exec = vi.spyOn(childProcess, 'execFileSync');

      expect(() => terminateProcessTree(pid, 'linux')).toThrow('positive integer process id');
      expect(() => terminateProcessTree(pid, 'win32')).toThrow('positive integer process id');
      expect(kill).not.toHaveBeenCalled();
      expect(exec).not.toHaveBeenCalled();
    },
  );
});

describe('install profile commands', () => {
  let root: string;
  let child: ReturnType<typeof childProcess.spawn>;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-profile-command-'));
    child = new childProcess.ChildProcess();
    Object.defineProperty(child, 'pid', { value: 1234 });
    vi.spyOn(child, 'kill').mockReturnValue(true);
    vi.spyOn(childProcess, 'spawn').mockReturnValue(child);
    vi.spyOn(process, 'kill').mockReturnValue(true);
    vi.spyOn(childProcess, 'execFileSync').mockReturnValue(Buffer.alloc(0));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const run = () => runInstallProfileCommand('fixture', [], root, {}, path.join(root, 'command'));

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'terminates the active tree and waits for close on %s',
    async (signal) => {
      const listeners = process.listeners(signal);
      const pending = run();
      const settled = vi.fn();
      void pending.then(settled, settled);
      const handler = process.listeners(signal).find((listener) => !listeners.includes(listener));
      expect(handler).toBeDefined();
      handler!.call(process, signal);
      if (process.platform === 'win32') {
        expect(childProcess.execFileSync).toHaveBeenCalledWith(
          'taskkill',
          ['/PID', '1234', '/T', '/F'],
          expect.any(Object),
        );
      } else {
        expect(process.kill).toHaveBeenCalledWith(-1234, 'SIGKILL');
      }
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      child.emit('close', null, 'SIGKILL');
      await expect(pending).rejects.toThrow(`Measurement interrupted by ${signal}`);
      expect(process.listeners(signal)).toEqual(listeners);
    },
  );

  it.each([0, 1])('retains exit code %s and removes interruption handlers', async (code) => {
    const listeners = (['SIGINT', 'SIGTERM'] as const).map((signal) => process.listeners(signal));
    const pending = run();
    child.emit('close', code, null);
    await expect(pending).resolves.toMatchObject({ code, signal: null, timedOut: false });
    expect(process.listeners('SIGINT')).toEqual(listeners[0]);
    expect(process.listeners('SIGTERM')).toEqual(listeners[1]);
    if (process.platform !== 'win32') {
      expect(process.kill).toHaveBeenCalledExactlyOnceWith(-1234, 'SIGKILL');
    }
  });

  it('removes handlers when spawning fails', async () => {
    const listeners = (['SIGINT', 'SIGTERM'] as const).map((signal) => process.listeners(signal));
    const pending = run();
    child.emit('error', new Error('spawn fixture failure'));
    await expect(pending).rejects.toThrow('spawn fixture failure');
    expect(process.listeners('SIGINT')).toEqual(listeners[0]);
    expect(process.listeners('SIGTERM')).toEqual(listeners[1]);
  });

  it('waits for close after a timeout and preserves the timeout result', async () => {
    vi.useFakeTimers();
    const pending = run();
    const settled = vi.fn();
    void pending.then(settled, settled);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).not.toHaveBeenCalled();
    child.emit('close', null, 'SIGKILL');
    await expect(pending).resolves.toMatchObject({ code: null, timedOut: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
