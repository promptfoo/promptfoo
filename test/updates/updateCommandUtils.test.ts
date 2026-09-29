import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateContext, runNpmUpdate } from '../../src/updates/updateCommandUtils';
import { mockProcessEnv } from '../util/utils';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

let directory: string;
let restoreEnvironment: (() => void) | undefined;
let child: EventEmitter & { unref: ReturnType<typeof vi.fn> };
beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-update-test-'));
  child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  vi.mocked(spawn)
    .mockReset()
    .mockReturnValue(child as any);
});
afterEach(() => {
  restoreEnvironment?.();
  restoreEnvironment = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe('update execution context', () => {
  it('uses a private directory under the launch temp root and preserves explicit npm configuration', () => {
    writeFileSync(path.join(directory, '.npmrc'), 'progress=false');
    restoreEnvironment = mockProcessEnv({
      TMPDIR: '/later-project-setting',
      NODE_OPTIONS: '--trace-warnings',
    });
    const context = createUpdateContext(
      {
        TMPDIR: directory,
        PATH: '/usr/bin:.:/workspace/bin:/unused/../workspace/bin:/workspace/node_modules/.bin:/opt/node/bin',
        HOME: '/home/fixture',
        npm_config_userconfig: 'user.npmrc',
        npm_config_prefix: '/opt/prefix',
        NODE_OPTIONS: '--trace-warnings',
        FIXTURE_API_KEY: 'unused',
      },
      '/workspace',
    );
    try {
      expect(path.dirname(context.cwd)).toBe(directory);
      expect(context.cwd).not.toBe(directory);
      expect(statSync(context.cwd).mode & 0o777).toBe(0o700);
      expect(readdirSync(context.cwd)).toEqual([]);
      expect(context.env).toEqual({
        TMPDIR: directory,
        PATH: '/usr/bin:/opt/node/bin',
        HOME: '/home/fixture',
        npm_config_userconfig: '/workspace/user.npmrc',
        npm_config_prefix: '/opt/prefix',
      });
    } finally {
      context.cleanup();
    }
    expect(existsSync(context.cwd)).toBe(false);
  });

  it('does not use an empty search path after filtering local entries', () => {
    const context = createUpdateContext(
      { TMPDIR: directory, PATH: '.:/workspace/bin' },
      '/workspace',
    );
    try {
      expect(context.env.PATH).toBe('/usr/bin:/bin');
    } finally {
      context.cleanup();
    }
  });
});

describe('npm update lifecycle', () => {
  it('pins the requested version and cleans up after successful completion', async () => {
    const result = runNpmUpdate('1.2.3', { TMPDIR: directory }, '/workspace');
    const [command, args, options] = vi.mocked(spawn).mock.calls[0];
    expect(command).toBe('npm');
    expect(args).toEqual(['install', '--global', 'promptfoo@1.2.3']);
    expect(options).toMatchObject({ shell: false, detached: false, stdio: 'inherit' });
    child.emit('close', 0, null);
    await expect(result).resolves.toBe('complete');
    expect(readdirSync(directory)).toEqual([]);
  });

  it.each([
    [1, null],
    [null, 'SIGTERM'],
    [null, null],
  ])('rejects unsuccessful close (%s, %s)', async (code, signal) => {
    const result = runNpmUpdate('latest', { TMPDIR: directory }, '/workspace');
    const rejection = expect(result).rejects.toThrow('Update');
    child.emit('close', code, signal);
    await rejection;
    expect(readdirSync(directory)).toEqual([]);
  });

  it('settles once when an error is followed by close', async () => {
    const result = runNpmUpdate('latest', { TMPDIR: directory }, '/workspace');
    const rejection = expect(result).rejects.toThrow('spawn failed');
    child.emit('error', new Error('spawn failed'));
    child.emit('close', -2, null);
    await rejection;
    expect(readdirSync(directory)).toEqual([]);
  });

  it('cleans up if spawn throws synchronously', async () => {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error('spawn failed');
    });
    await expect(runNpmUpdate('latest', { TMPDIR: directory }, '/workspace')).rejects.toThrow(
      'spawn failed',
    );
    expect(readdirSync(directory)).toEqual([]);
  });

  it('leaves an unfinished installer running and retains its cwd until close', async () => {
    vi.useFakeTimers();
    const result = runNpmUpdate('1.2.3', { TMPDIR: directory }, '/workspace', 60_000);
    const options = vi.mocked(spawn).mock.calls[0][2];
    expect(options).toMatchObject({ detached: true, stdio: 'ignore' });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(result).resolves.toBe('background');
    expect(child.unref).toHaveBeenCalledOnce();
    expect(readdirSync(directory)).toHaveLength(1);
    child.emit('close', 0, null);
    expect(readdirSync(directory)).toEqual([]);
  });

  it('rejects an invalid version before creating a process', async () => {
    await expect(
      runNpmUpdate('invalid-version', { TMPDIR: directory }, '/workspace'),
    ).rejects.toThrow('Invalid');
    expect(spawn).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual([]);
  });
});
