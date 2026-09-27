import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: mocks.spawn,
  };
});

import {
  startFilesystemMcpServer,
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

describe('filesystem MCP Windows launcher', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const originalExecPath = Object.getOwnPropertyDescriptor(process, 'execPath')!;
  let fixture: string;
  let rootDir: string;
  let nodeDir: string;
  let restoreEnv: () => void;

  const installNpx = (directory: string) => {
    const cli = path.join(directory, 'node_modules', 'npm', 'bin', 'npx-cli.js');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, '// npm entrypoint fixture');
    fs.writeFileSync(path.join(directory, 'npx.cmd'), '@echo off');
    return fs.realpathSync(cli);
  };

  beforeEach(() => {
    vi.resetAllMocks();
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-npx-launcher-'));
    rootDir = path.join(fixture, 'repo with spaces & percent%');
    nodeDir = path.join(fixture, 'trusted-node');
    fs.mkdirSync(rootDir);
    fs.mkdirSync(nodeDir);
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    Object.defineProperty(process, 'execPath', {
      value: path.join(nodeDir, 'node.exe'),
      configurable: true,
    });
    restoreEnv = mockProcessEnv({ PATH: '' });
    mocks.spawn.mockReturnValue(createFakeProcess());
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    Object.defineProperty(process, 'execPath', originalExecPath);
    restoreEnv();
    vi.restoreAllMocks();
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  it('starts npm through Node without a shell and preserves the literal repository argument', () => {
    const cli = installNpx(nodeDir);
    startFilesystemMcpServer(rootDir);

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [cli, '-y', '@modelcontextprotocol/server-filesystem', rootDir],
      expect.objectContaining({ cwd: rootDir, windowsHide: true, shell: false }),
    );
  });

  it('finds a separate npm install on an absolute PATH', () => {
    const npmDir = path.join(fixture, 'trusted-npm');
    const cli = installNpx(npmDir);
    const restorePath = mockProcessEnv({ PATH: npmDir });
    try {
      startFilesystemMcpServer(rootDir);
      expect(mocks.spawn.mock.calls[0]?.[1]?.[0]).toBe(cli);
    } finally {
      restorePath();
    }
  });

  it('ignores relative and repository-owned PATH installs', () => {
    installNpx(rootDir);
    const cli = installNpx(path.join(fixture, 'trusted-npm'));
    const restorePath = mockProcessEnv({
      PATH: ['.', rootDir, path.dirname(path.dirname(path.dirname(path.dirname(cli))))].join(
        path.delimiter,
      ),
    });
    try {
      startFilesystemMcpServer(rootDir);
      expect(mocks.spawn.mock.calls[0]?.[1]?.[0]).toBe(cli);
    } finally {
      restorePath();
    }
  });

  it('rejects an npm entrypoint symlink into the scanned repository', () => {
    const cli = installNpx(rootDir);
    const npmDir = path.join(fixture, 'untrusted-npm');
    fs.mkdirSync(npmDir);
    fs.writeFileSync(path.join(npmDir, 'npx.cmd'), '@echo off');
    const redirectedNpm = path.join(npmDir, 'node_modules', 'npm');
    fs.mkdirSync(path.dirname(redirectedNpm), { recursive: true });
    fs.symlinkSync(path.dirname(path.dirname(cli)), redirectedNpm, 'junction');
    const restorePath = mockProcessEnv({ PATH: npmDir });
    try {
      expect(() => startFilesystemMcpServer(rootDir)).toThrow(/npm.*not found/i);
      expect(mocks.spawn).not.toHaveBeenCalled();
    } finally {
      restorePath();
    }
  });

  it('preserves a trusted native npx executable without an npm script layout', () => {
    const npmDir = path.join(fixture, 'native-npx');
    fs.mkdirSync(npmDir);
    const executable = path.join(npmDir, 'npx.exe');
    fs.writeFileSync(executable, 'native executable fixture');
    const restorePath = mockProcessEnv({ PATH: npmDir });
    try {
      startFilesystemMcpServer(rootDir);
      expect(mocks.spawn).toHaveBeenCalledWith(
        executable,
        ['-y', '@modelcontextprotocol/server-filesystem', rootDir],
        expect.objectContaining({ shell: false, windowsHide: true }),
      );
    } finally {
      restorePath();
    }
  });

  it('reports a missing npm install before spawning', () => {
    expect(() => startFilesystemMcpServer(rootDir)).toThrow(/npm.*not found/i);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('keeps the POSIX npx invocation unchanged', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    startFilesystemMcpServer(rootDir);
    expect(mocks.spawn).toHaveBeenCalledWith(
      'npx',
      ['-y', '@modelcontextprotocol/server-filesystem', rootDir],
      expect.objectContaining({ cwd: rootDir }),
    );
  });
});
