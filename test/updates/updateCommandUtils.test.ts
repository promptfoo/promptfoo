import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
const launchEnvironment = { PATH: path.dirname(process.execPath) };
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
    expect(context.env).toEqual({ ...source, PATH: realpathSync(source.PATH) });
    expect(context.env).not.toBe(source);
  });

  it('filters project directories even when PATH uses a symlink outside the project', () => {
    const project = path.join(directory, 'project');
    const projectBin = path.join(project, 'bin');
    const alias = path.join(directory, 'alias');
    mkdirSync(projectBin, { recursive: true });
    writeFileSync(path.join(project, 'package.json'), '{}');
    symlinkSync(projectBin, alias, 'junction');
    const runtimeBin = path.dirname(process.execPath);
    const context = createUpdateContext(
      { PATH: ['.', projectBin, alias, runtimeBin].join(path.delimiter) },
      project,
    );
    expect(context.env.PATH).toBe(realpathSync(runtimeBin));
  });

  it('preserves version-manager shims when invoked from a home directory', () => {
    const shims = path.join(directory, '.asdf', 'shims');
    mkdirSync(shims, { recursive: true });
    expect(createUpdateContext({ PATH: shims }, directory).env.PATH).toBe(realpathSync(shims));
  });

  it('preserves a symlink to the active runtime when invoked from its home directory', () => {
    const runtimeBin = realpathSync(path.dirname(process.execPath));
    const alias = path.join(directory, 'runtime');
    symlinkSync(runtimeBin, alias, 'junction');
    expect(createUpdateContext({ PATH: alias }, path.dirname(runtimeBin)).env.PATH).toBe(
      runtimeBin,
    );
  });

  it('fails closed when no launch PATH entries are eligible', () => {
    writeFileSync(path.join(directory, 'package.json'), '{}');
    expect(() =>
      createUpdateContext({ PATH: ['.', directory].join(path.delimiter) }, directory),
    ).toThrow('No trusted npm');
  });
});

describe('npm update lifecycle', () => {
  it('pins the requested version and keeps the launch cwd', async () => {
    const result = runNpmUpdate('1.2.3', launchEnvironment, directory);
    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['install', '--global', 'promptfoo@1.2.3'],
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
    const result = runNpmUpdate('latest', launchEnvironment, directory);
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
    const result = runNpmUpdate('latest', launchEnvironment, directory);
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
    const result = runNpmUpdate('latest', launchEnvironment, directory);
    const rejection = expect(result).rejects.toThrow('Update');
    child.emit('close', code, signal);
    await rejection;
  });

  it('removes signal listeners when a spawn error is followed by close', async () => {
    const listeners = process.listeners('SIGTERM');
    const result = runNpmUpdate('latest', launchEnvironment, directory);
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
    await expect(runNpmUpdate('latest', launchEnvironment, directory)).rejects.toThrow(
      'spawn failed',
    );
    expect(process.listeners('SIGTERM')).toEqual(listeners);
  });

  it('rejects an invalid version before creating a process', async () => {
    await expect(runNpmUpdate('invalid-version', launchEnvironment, directory)).rejects.toThrow(
      'Invalid',
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});
