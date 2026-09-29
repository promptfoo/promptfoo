import { EventEmitter } from 'events';
import path from 'path';
import type { ChildProcess } from 'child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  realpathSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  realpathSync: mocks.realpathSync,
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: mocks.execFile,
    spawn: mocks.spawn,
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
  kill = vi.fn();
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
    mocks.realpathSync.mockImplementation((file) => file);
    restoreEnv = mockProcessEnv(originalEnv, { clear: true });
  });

  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('strips npm before config when spawning the filesystem MCP server', () => {
    const restoreNpmConfig = mockProcessEnv({
      NPM_CONFIG_BEFORE: '2026-03-29T00:00:00.000Z',
      npm_config_before: '2026-03-29T00:00:00.000Z',
    });
    try {
      mocks.spawn.mockReturnValue(createFakeProcess());

      startFilesystemMcpServer(process.cwd());

      const spawnOptions = mocks.spawn.mock.calls[0]?.[2];
      expect(spawnOptions?.env?.NPM_CONFIG_BEFORE).toBeUndefined();
      expect(spawnOptions?.env?.npm_config_before).toBeUndefined();
    } finally {
      restoreNpmConfig();
    }
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
  const { execPath, platform } = process;
  const nodeDir = path.resolve('/nodejs');
  const npmDir = path.resolve('/npm-global');
  const rootDir = path.resolve('/repo');
  const npxCli = (dir: string) => path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js');
  const npxArgs = ['-y', '@modelcontextprotocol/server-filesystem', rootDir];
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.spawn.mockReturnValue(createFakeProcess());
    mocks.realpathSync.mockImplementation((file) => file);
    Object.defineProperty(process, 'platform', { value: 'win32' });
    Object.defineProperty(process, 'execPath', { value: path.join(nodeDir, 'node.exe') });
    restoreEnv = mockProcessEnv({ PATH: ['', 'relative', npmDir].join(path.delimiter) });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform });
    Object.defineProperty(process, 'execPath', { value: execPath });
    restoreEnv();
  });

  it('prefers the npx entrypoint installed with Node over PATH on Windows', () => {
    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [npxCli(nodeDir), ...npxArgs],
      expect.objectContaining({ cwd: path.dirname(npxCli(nodeDir)) }),
    );
  });

  it('falls back to npm on an absolute PATH entry on Windows', () => {
    // Empty and relative entries resolve against the cwd and must be skipped.
    mocks.realpathSync.mockImplementation((file) => {
      if (file === npxCli(nodeDir)) {
        throw new Error('ENOENT');
      }
      return file;
    });

    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [npxCli(npmDir), ...npxArgs],
      expect.objectContaining({ cwd: path.dirname(npxCli(npmDir)) }),
    );
    expect(mocks.realpathSync.mock.calls.map(([file]) => file)).toEqual([
      rootDir,
      npxCli(nodeDir),
      npxCli(npmDir),
    ]);
  });

  it.each([
    ['a repository PATH entry', rootDir, rootDir],
    ['a PATH entry resolving into the repository', npmDir, rootDir],
    ['a canonical repository alias', npmDir, path.resolve('/actual-repo')],
  ])('rejects %s on Windows', (_name, candidateDir, canonicalRoot) => {
    const restorePath = mockProcessEnv({ PATH: candidateDir });
    mocks.realpathSync.mockImplementation((file) => {
      if (file === rootDir) {
        return canonicalRoot;
      }
      if (file === npxCli(candidateDir)) {
        return npxCli(canonicalRoot);
      }
      throw new Error('ENOENT');
    });
    try {
      expect(() => startFilesystemMcpServer(rootDir)).toThrow(
        'npx not found outside the scanned repository',
      );
      expect(mocks.spawn).not.toHaveBeenCalled();
    } finally {
      restorePath();
    }
  });

  it('uses canonical npm paths outside the repository while preserving the MCP root', () => {
    const canonicalNpx = npxCli(path.resolve('/repo-sibling'));
    mocks.realpathSync.mockImplementation((file) =>
      file === npxCli(nodeDir) ? canonicalNpx : file,
    );

    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [canonicalNpx, ...npxArgs],
      expect.objectContaining({ cwd: path.dirname(canonicalNpx) }),
    );
  });

  it('fails before spawning when npm cannot be found on Windows', () => {
    mocks.realpathSync.mockImplementation((file) => {
      if (file === rootDir) {
        return file;
      }
      throw new Error('ENOENT');
    });

    expect(() => startFilesystemMcpServer(rootDir)).toThrow('npx not found');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('prefers the running Node directory for downstream Windows shims', () => {
    const inheritedPath = [rootDir, npmDir].join(path.delimiter);
    const restorePath = mockProcessEnv({ PATH: inheritedPath, Path: inheritedPath });
    try {
      startFilesystemMcpServer(rootDir);

      const env = mocks.spawn.mock.calls[0]?.[2].env;
      expect(env.PATH).toBe([nodeDir, inheritedPath].join(path.delimiter));
      expect(Object.keys(env).filter((key) => key.toLowerCase() === 'path')).toEqual(['PATH']);
    } finally {
      restorePath();
    }
  });

  it('runs npx directly on other platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn).toHaveBeenCalledWith(
      'npx',
      npxArgs,
      expect.objectContaining({ cwd: rootDir }),
    );
    expect(mocks.realpathSync).not.toHaveBeenCalled();
    expect(mocks.spawn.mock.calls[0]?.[2].env.PATH).toBe(process.env.PATH);
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

  it('waits for Windows process-tree termination even if npm exits first', async () => {
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
  });

  it('preserves the POSIX force-kill timeout', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const child = createFakeProcess();
    const stopped = stopFilesystemMcpServer(child);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(stopped).resolves.toBeUndefined();
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
  });
});
