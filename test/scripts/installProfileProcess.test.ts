import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  npmInvocation,
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

describe('npmInvocation', () => {
  const nodePath = 'C:\\Program Files\\nodejs\\node.exe';

  function existingPaths(...paths: string[]) {
    return vi
      .spyOn(fs, 'existsSync')
      .mockImplementation((candidate) => paths.includes(String(candidate)));
  }

  it('uses npm directly on POSIX without probing the Windows installation', () => {
    const exists = vi.spyOn(fs, 'existsSync');
    const exec = vi.spyOn(childProcess, 'execFileSync');

    expect(npmInvocation({ platform: 'linux' })).toEqual({
      command: 'npm',
      prefix: ['--workspaces=false'],
    });
    expect(exists).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('runs an existing npm_execpath CLI with the Node executable', () => {
    const npmExecPath = 'D:\\npm\\bin\\npm-cli.js';
    existingPaths(npmExecPath);
    const exec = vi.spyOn(childProcess, 'execFileSync');

    expect(npmInvocation({ platform: 'win32', nodePath, npmExecPath })).toEqual({
      command: nodePath,
      prefix: [npmExecPath, '--workspaces=false'],
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it('locates a CLI from where.exe results without executing npm.cmd or a shell', () => {
    const cli = 'D:\\npm tools\\node_modules\\npm\\bin\\npm-cli.js';
    existingPaths(cli);
    const exec = vi
      .spyOn(childProcess, 'execFileSync')
      .mockReturnValue('C:\\old\\npm\r\nC:\\old\\npm.cmd\r\nD:\\npm tools\\npm.cmd\r\n');

    expect(npmInvocation({ platform: 'win32', nodePath, npmExecPath: '' })).toEqual({
      command: nodePath,
      prefix: [cli, '--workspaces=false'],
    });
    expect(exec).toHaveBeenCalledExactlyOnceWith('where.exe', ['npm'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    });
  });

  it.each(['D:\\npm.cmd', 'D:\\yarn.js', 'D:\\missing\\npm-cli.js'])(
    'does not execute a wrapper, different package manager, or missing npm_execpath: %s',
    (npmExecPath) => {
      const cli = 'D:\\valid\\node_modules\\npm\\bin\\npm-cli.js';
      existingPaths(cli, 'D:\\npm.cmd', 'D:\\yarn.js');
      const exec = vi.spyOn(childProcess, 'execFileSync').mockReturnValue('D:\\valid\\npm.cmd\r\n');

      expect(npmInvocation({ platform: 'win32', nodePath, npmExecPath })).toEqual({
        command: nodePath,
        prefix: [cli, '--workspaces=false'],
      });
      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec.mock.calls[0][0]).toBe('where.exe');
    },
  );

  it('uses the Node sibling npm installation when where.exe fails', () => {
    const cli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
    existingPaths(cli);
    vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      throw new Error('where.exe failed');
    });

    expect(npmInvocation({ platform: 'win32', nodePath, npmExecPath: '' })).toEqual({
      command: nodePath,
      prefix: [cli, '--workspaces=false'],
    });
  });

  it('does not treat other where.exe filenames as npm wrappers', () => {
    existingPaths('D:\\unrelated\\node_modules\\npm\\bin\\npm-cli.js');
    vi.spyOn(childProcess, 'execFileSync').mockReturnValue('D:\\unrelated\\npm.exe\r\n');

    expect(() => npmInvocation({ platform: 'win32', nodePath, npmExecPath: '' })).toThrow(
      'Cannot locate the npm JavaScript CLI',
    );
  });

  it('reports missing npm without exposing environment values or discovered paths', () => {
    existingPaths();
    vi.spyOn(childProcess, 'execFileSync').mockReturnValue('D:\\private-path\\npm.cmd\r\n');

    expect(() => npmInvocation({ platform: 'win32', nodePath, npmExecPath: '' })).toThrow(
      new Error(
        'Cannot locate the npm JavaScript CLI. Install npm alongside Node.js or run this script with npm.',
      ),
    );
  });
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

it('keeps npm lockfiles inside consumers matched by an ancestor workspace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-profile-workspace-'));
  try {
    const consumer = path.join(root, 'packages', 'consumer');
    fs.mkdirSync(consumer, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'untouched-host',
        private: true,
        workspaces: ['packages/**'],
      }),
    );
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({
        name: 'fixture-consumer',
        private: true,
      }),
    );
    const npm = npmInvocation();
    childProcess.execFileSync(
      npm.command,
      [...npm.prefix, 'install', '--package-lock-only', '--ignore-scripts', '--offline'],
      {
        cwd: consumer,
        env: { ...process.env, npm_config_cache: path.join(root, 'cache') },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(fs.existsSync(path.join(root, 'package-lock.json'))).toBe(false);
    expect(fs.existsSync(path.join(consumer, 'package-lock.json'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
