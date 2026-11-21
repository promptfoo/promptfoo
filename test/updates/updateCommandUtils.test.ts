import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateContext, runNpmUpdate } from '../../src/updates/updateCommandUtils';
import { mockProcessEnv } from '../util/utils';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

let directory: string;
let restoreEnvironment: (() => void) | undefined;
let originalExitCode: typeof process.exitCode;
let child: EventEmitter & { pid: number };
const runtime = path.dirname(realpathSync(process.execPath));
const launchEnvironment = { PATH: runtime };
beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-update-test-'));
  originalExitCode = process.exitCode;
  child = Object.assign(new EventEmitter(), { pid: 12345 });
  vi.spyOn(process, 'kill').mockReturnValue(true);
  vi.mocked(spawn)
    .mockReset()
    .mockReturnValue(child as any);
});
afterEach(() => {
  restoreEnvironment?.();
  restoreEnvironment = undefined;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe('update execution context', () => {
  it('preserves launch auth, installer settings, and npm path semantics', () => {
    restoreEnvironment = mockProcessEnv({ CODEARTIFACT_AUTH_TOKEN: 'later-project-value' });
    const source = {
      PATH: path.dirname(process.execPath),
      HOME: '/home/fixture',
      npm_config_userconfig: '~/.config/npm/npmrc',
      npm_config_globalconfig: 'global.npmrc',
      NPM_CONFIG_CAFILE: 'certs/registry.pem',
      npm_config_registry: 'https://registry.fixture.invalid',
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      CODEARTIFACT_AUTH_TOKEN: 'fixture-launch-value',
      PLAYWRIGHT_BROWSERS_PATH: 'browsers',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 'true',
    };
    const context = createUpdateContext(source, directory);
    expect(context.cwd).toBe(directory);
    expect(context.env).toEqual({
      ...source,
      PATH: [...new Set([runtime, '/usr/bin', '/bin'])].join(path.delimiter),
    });
    expect(context.env).not.toBe(source);
  });

  it('ignores project paths and loader settings even without a project marker', () => {
    const context = createUpdateContext(
      { PATH: directory, LD_PRELOAD: 'untrusted', NODE_OPTIONS: '--require=untrusted' },
      directory,
    );
    expect(context.npm).toBe(path.join(runtime, 'npm'));
    expect(context.env.PATH?.split(path.delimiter)).not.toContain(directory);
    expect(context.env.NODE_OPTIONS).toBeUndefined();
    expect(context.env.LD_PRELOAD).toBeUndefined();
  });
});

describe('npm update lifecycle', () => {
  it('uses the npm latest tag and keeps the launch cwd', async () => {
    const result = runNpmUpdate(createUpdateContext(launchEnvironment, directory));
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [path.join(runtime, 'npm'), 'install', '--global', 'promptfoo@latest'],
      expect.objectContaining({
        cwd: directory,
        shell: false,
        detached: true,
        stdio: ['ignore', 'inherit', 'inherit'],
      }),
    );
    child.emit('close', 0, null);
    await expect(result).resolves.toBeUndefined();
  });

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('forwards %s and waits for the child before cleanup', async (signal, exitCode) => {
    const existing = process.listeners(signal);
    const result = runNpmUpdate(createUpdateContext(launchEnvironment, directory));
    const added = process.listeners(signal).find((listener) => !existing.includes(listener));
    expect(added).toBeDefined();
    process.emit(signal, signal);
    expect(process.kill).toHaveBeenCalledWith(-child.pid, signal);
    process.emit(signal, signal);
    expect(process.kill).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(exitCode);
    expect(process.listeners(signal)).toContain(added);
    const rejection = expect(result).rejects.toThrow(`Update stopped by ${signal}`);
    child.emit('close', null, signal);
    await rejection;
    expect(process.listeners(signal)).toEqual(existing);
  });

  it('does not report success if the child exits cleanly after interruption', async () => {
    const existing = process.listeners('SIGINT');
    const result = runNpmUpdate(createUpdateContext(launchEnvironment, directory));
    process.listeners('SIGINT').find((listener) => !existing.includes(listener))!('SIGINT');
    const rejection = expect(result).rejects.toThrow('Update stopped by SIGINT');
    child.emit('close', 0, null);
    await rejection;
  });

  it.each([
    [1, null],
    [null, 'SIGTERM'],
    [null, null],
  ])('rejects unsuccessful close (%s, %s)', async (code, signal) => {
    const result = runNpmUpdate(createUpdateContext(launchEnvironment, directory));
    const rejection = expect(result).rejects.toThrow('Update');
    child.emit('close', code, signal);
    await rejection;
  });

  it('removes signal listeners when a spawn error is followed by close', async () => {
    const listeners = process.listeners('SIGTERM');
    const result = runNpmUpdate(createUpdateContext(launchEnvironment, directory));
    const rejection = expect(result).rejects.toThrow('spawn failed');
    child.emit('error', new Error('spawn failed'));
    child.emit('close', -2, null);
    await rejection;
    expect(process.listeners('SIGTERM')).toEqual(listeners);
  });

  it('adds no signal handlers if spawn throws synchronously', async () => {
    const listeners = process.listeners('SIGTERM');
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error('spawn failed');
    });
    await expect(runNpmUpdate(createUpdateContext(launchEnvironment, directory))).rejects.toThrow(
      'spawn failed',
    );
    expect(process.listeners('SIGTERM')).toEqual(listeners);
  });
});
