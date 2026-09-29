import { EventEmitter } from 'events';
import path from 'path';
import type { ChildProcess } from 'child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  resolve: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: mocks.execFile,
    spawn: mocks.spawn,
  };
});

vi.mock('module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('module')>();
  return {
    ...actual,
    createRequire: (url: string | URL) =>
      Object.assign(actual.createRequire(url), { resolve: mocks.resolve }),
  };
});

import {
  startFilesystemMcpServer,
  stopFilesystemMcpServer,
  waitForFilesystemMcpServerReady,
} from '../../../src/codeScan/mcp/filesystem';

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  kill = vi.fn().mockReturnValue(true);
  pid = 1234;
  signalCode: NodeJS.Signals | null = null;
  stderr = new EventEmitter();
}

function createFakeProcess(): ChildProcess & { stderr: EventEmitter } {
  return new FakeChildProcess() as unknown as ChildProcess & { stderr: EventEmitter };
}

describe('filesystem MCP server management', () => {
  const originalEnv = { ...process.env };
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv(originalEnv, { clear: true });
  });

  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('resolves when the filesystem MCP server prints its ready marker', async () => {
    const mcpProcess = createFakeProcess();
    const ready = waitForFilesystemMcpServerReady(mcpProcess);

    mcpProcess.stderr.emit('data', Buffer.from('Secure MCP Filesystem Server running on stdio\n'));

    await expect(ready).resolves.toBeUndefined();
  });

  it('resolves when the ready marker is split across stderr chunks', async () => {
    const mcpProcess = createFakeProcess();
    const ready = waitForFilesystemMcpServerReady(mcpProcess);

    mcpProcess.stderr.emit('data', Buffer.from('Secure MCP Filesystem Server '));
    mcpProcess.stderr.emit('data', Buffer.from('running on stdio\n'));

    await expect(ready).resolves.toBeUndefined();
  });

  it('rejects when the filesystem MCP server exits before it is ready', async () => {
    const mcpProcess = createFakeProcess();
    const ready = waitForFilesystemMcpServerReady(mcpProcess);

    mcpProcess.emit('exit', 1, null);

    await expect(ready).rejects.toThrow('Filesystem MCP server exited before ready: code 1');
  });

  it('rejects immediately when the process has already exited', async () => {
    const mcpProcess = createFakeProcess();
    Object.defineProperty(mcpProcess, 'exitCode', { value: 1 });

    await expect(waitForFilesystemMcpServerReady(mcpProcess)).rejects.toThrow(
      'Filesystem MCP server exited before ready: code 1',
    );
  });

  it('rejects immediately when the process was already killed', async () => {
    const mcpProcess = createFakeProcess();
    Object.defineProperty(mcpProcess, 'killed', { value: true });

    await expect(waitForFilesystemMcpServerReady(mcpProcess)).rejects.toThrow(
      'Filesystem MCP server exited before ready: unknown reason',
    );
  });

  it('rejects when stderr is unavailable', async () => {
    const mcpProcess = createFakeProcess();
    Object.defineProperty(mcpProcess, 'stderr', { value: null });

    await expect(waitForFilesystemMcpServerReady(mcpProcess)).rejects.toThrow(
      'Filesystem MCP server stderr pipe unavailable',
    );
  });

  it('rejects when the filesystem MCP server readiness times out', async () => {
    const mcpProcess = createFakeProcess();
    const ready = waitForFilesystemMcpServerReady(mcpProcess, 1000);
    const expectation = expect(ready).rejects.toThrow(
      'Timed out waiting for filesystem MCP server to be ready after 1000ms',
    );

    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
  });
});

describe('filesystem MCP launcher', () => {
  const rootDir = path.resolve('/repo');
  const serverEntry = path.resolve(
    '/promptfoo/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js',
  );
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolve.mockReturnValue(serverEntry);
    mocks.spawn.mockReturnValue(createFakeProcess());
    restoreEnv = mockProcessEnv(
      {
        HOME: '/home/runner',
        Path: '/usr/bin',
        SystemRoot: 'C:\\Windows',
        GITHUB_TOKEN: 'test-token',
        PROMPTFOO_API_KEY: 'test-key',
        NODE_OPTIONS: '--max-old-space-size=4096',
        npm_config_before: '2026-03-29T00:00:00.000Z',
        NPM_CONFIG_BEFORE: '2026-03-29T00:00:00.000Z',
        Npm_Config_Before: '2026-03-29T00:00:00.000Z',
      },
      { clear: true },
    );
  });

  afterEach(() => {
    restoreEnv();
  });

  it('runs the installed server with the current Node executable', () => {
    startFilesystemMcpServer(rootDir);

    expect(mocks.resolve).toHaveBeenCalledWith(
      '@modelcontextprotocol/server-filesystem/dist/index.js',
    );
    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [serverEntry, rootDir],
      expect.objectContaining({ cwd: rootDir }),
    );
  });

  it('passes only a minimal environment to the server', () => {
    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn.mock.calls[0]?.[2]?.env).toEqual({
      HOME: '/home/runner',
      Path: '/usr/bin',
      SystemRoot: 'C:\\Windows',
    });
  });

  it('fails before spawning when the server package is not installed', () => {
    mocks.resolve.mockImplementation(() => {
      throw new Error("Cannot find module '@modelcontextprotocol/server-filesystem/dist/index.js'");
    });

    expect(() => startFilesystemMcpServer(rootDir)).toThrow(
      'The @modelcontextprotocol/server-filesystem package is required',
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});

describe('filesystem MCP cleanup', () => {
  const { platform } = process;
  const windowsDir = path.resolve('/windows');
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(process, 'platform', { value: 'win32' });
    restoreEnv = mockProcessEnv({ SystemRoot: windowsDir });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform });
    restoreEnv();
    vi.useRealTimers();
  });

  it('waits for Windows process-tree termination even if the server exits first', async () => {
    const child = createFakeProcess();
    const stopped = stopFilesystemMcpServer(child);
    let settled = false;
    void stopped.then(() => {
      settled = true;
    });

    expect(mocks.execFile).toHaveBeenCalledWith(
      path.join(windowsDir, 'System32', 'taskkill.exe'),
      ['/PID', '1234', '/T', '/F'],
      { windowsHide: true, timeout: 5000 },
      expect.any(Function),
    );
    child.emit('exit', null, 'SIGTERM');
    await Promise.resolve();
    expect(settled).toBe(false);
    mocks.execFile.mock.calls[0][3](null);
    await expect(stopped).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('reports Windows process-tree termination failures', async () => {
    const child = createFakeProcess();
    const stopped = stopFilesystemMcpServer(child);
    mocks.execFile.mock.calls[0][3](new Error('Access denied'));
    await expect(stopped).rejects.toThrow(
      'Failed to stop filesystem MCP process tree: Access denied',
    );
  });

  it('rejects a relative Windows system directory before launching cleanup', async () => {
    const restoreRoot = mockProcessEnv({ SystemRoot: 'relative' });
    try {
      await expect(stopFilesystemMcpServer(createFakeProcess())).rejects.toThrow(
        'Cannot locate the Windows system directory',
      );
      expect(mocks.execFile).not.toHaveBeenCalled();
    } finally {
      restoreRoot();
    }
  });

  it('does not launch cleanup for a process that already exited', async () => {
    const child = createFakeProcess();
    Object.defineProperty(child, 'exitCode', { value: 0 });
    await stopFilesystemMcpServer(child);
    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('preserves graceful POSIX termination', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const child = createFakeProcess();
    const stopped = stopFilesystemMcpServer(child);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(mocks.execFile).not.toHaveBeenCalled();
    child.emit('exit', 0, null);
    await expect(stopped).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.listenerCount('exit')).toBe(0);
    expect(child.listenerCount('error')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for POSIX exit after sending SIGKILL', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const child = createFakeProcess();
    const stopped = stopFilesystemMcpServer(child);
    const onStopped = vi.fn();
    void stopped.then(onStopped);

    await vi.advanceTimersByTimeAsync(5000);
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
    expect(onStopped).not.toHaveBeenCalled();

    child.emit('exit', null, 'SIGKILL');
    await expect(stopped).resolves.toBeUndefined();
    expect(onStopped).toHaveBeenCalledOnce();
    expect(child.listenerCount('exit')).toBe(0);
    expect(child.listenerCount('error')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for a previously signaled POSIX process that is still running', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const child = createFakeProcess();
    Object.defineProperty(child, 'killed', { value: true });
    const stopped = stopFilesystemMcpServer(child);
    const onStopped = vi.fn();
    void stopped.then(onStopped);

    await vi.advanceTimersByTimeAsync(0);
    expect(onStopped).not.toHaveBeenCalled();
    child.emit('exit', null, 'SIGTERM');
    await expect(stopped).resolves.toBeUndefined();
  });

  it('rejects when POSIX termination cannot be confirmed after SIGKILL', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const child = createFakeProcess();
    const onStopped = vi.fn();
    const stopped = stopFilesystemMcpServer(child);
    void stopped.then(onStopped, onStopped);

    await vi.advanceTimersByTimeAsync(5000);
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
    expect(onStopped).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(onStopped).toHaveBeenCalledOnce();
    await expect(stopped).rejects.toThrow('Timed out waiting for process 1234 to exit');
    expect(child.listenerCount('exit')).toBe(0);
    expect(child.listenerCount('error')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['SIGTERM', 'false'],
    ['SIGTERM', 'throw'],
    ['SIGTERM', 'error'],
    ['SIGKILL', 'false'],
    ['SIGKILL', 'throw'],
    ['SIGKILL', 'error'],
  ] as const)('rejects and cleans up when %s fails via %s', async (failedSignal, failure) => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const child = createFakeProcess();
    const existingExitListener = vi.fn();
    const existingErrorListener = vi.fn();
    child.on('exit', existingExitListener);
    child.on('error', existingErrorListener);
    vi.mocked(child.kill).mockImplementation((signal) => {
      if (signal !== failedSignal) {
        return true;
      }
      if (failure === 'throw') {
        throw new Error('Access denied');
      }
      if (failure === 'error') {
        child.emit('error', new Error('Access denied'));
      }
      return false;
    });

    const stopped = stopFilesystemMcpServer(child);
    const expectation = expect(stopped).rejects.toThrow('Failed to stop filesystem MCP server');
    if (failedSignal === 'SIGKILL') {
      await vi.advanceTimersByTimeAsync(5000);
    }
    await expectation;
    expect(child.listeners('exit')).toEqual([existingExitListener]);
    expect(child.listeners('error')).toEqual([existingErrorListener]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
