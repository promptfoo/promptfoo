import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstallationInfo } from '../../src/updates/installationInfo';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(), spawn: vi.fn() }));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: vi.fn(),
  realpathSync: vi.fn(),
}));
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-install-test-'));
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  vi.mocked(existsSync).mockReset().mockReturnValue(false);
  vi.mocked(realpathSync)
    .mockReset()
    .mockImplementation((value) =>
      value === process.argv[1]
        ? '/usr/local/lib/node_modules/promptfoo/dist/src/main.js'
        : String(value),
    );
  vi.mocked(execFileSync).mockReset().mockReturnValue('/usr/local/lib/node_modules\n');
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe('global npm verification', () => {
  it('requires the CLI path to belong to the reported global package root', () => {
    expect(getInstallationInfo('/workspace', { TMPDIR: directory }).canUpdate).toBe(true);
    expect(execFileSync).toHaveBeenCalledWith(
      'npm',
      ['root', '--global'],
      expect.objectContaining({ timeout: 1000 }),
    );
    expect(readdirSync(directory)).toEqual([]);
  });

  it.each([
    '/workspace/node_modules/promptfoo/dist/main.js',
    '/usr/local/lib/node_modules/promptfoo-extra/dist/main.js',
  ])('rejects a different package root: %s', (cliPath) => {
    vi.mocked(realpathSync).mockImplementation((value) =>
      value === process.argv[1] ? cliPath : String(value),
    );
    expect(getInstallationInfo('/workspace', { TMPDIR: directory }).canUpdate).toBe(false);
  });

  it('compares canonical package paths when the global npm prefix is symlinked', () => {
    vi.mocked(execFileSync).mockReturnValue('/linked/lib/node_modules\n');
    vi.mocked(realpathSync).mockImplementation((value) =>
      value === process.argv[1]
        ? '/real/lib/node_modules/promptfoo/dist/src/main.js'
        : '/real/lib/node_modules/promptfoo',
    );
    expect(getInstallationInfo('/workspace', { TMPDIR: directory }).canUpdate).toBe(true);
  });

  it('fails closed when npm cannot confirm the root', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(getInstallationInfo('/workspace', { TMPDIR: directory }).canUpdate).toBe(false);
    expect(readdirSync(directory)).toEqual([]);
  });
});

describe('manual installation guidance', () => {
  it.each([
    ['/home/user/.npm/_npx/id/node_modules/promptfoo/dist/main.js', 'npx'],
    ['/home/user/.pnpm/_pnpx/id/node_modules/promptfoo/dist/main.js', 'pnpm dlx'],
    ['/home/user/.cache/pnpm/dlx/id/node_modules/promptfoo/dist/main.js', 'pnpm dlx'],
    ['/home/user/.local/share/pnpm/dlx/id/node_modules/promptfoo/dist/main.js', 'pnpm dlx'],
    [
      '/opt/homebrew/Cellar/promptfoo/1.0/libexec/lib/node_modules/promptfoo/dist/main.js',
      'brew upgrade',
    ],
    ['/home/user/.bun/install/cache/promptfoo/dist/main.js', 'bunx'],
    ['/home/user/.local/share/pnpm/global/node_modules/promptfoo/dist/main.js', 'package manager'],
    ['/home/user/.config/yarn/global/node_modules/promptfoo/dist/main.js', 'package manager'],
    ['/home/user/.bun/install/global/node_modules/promptfoo/dist/main.js', 'package manager'],
    ['/workspace/promptfoo/dist/src/main.js', 'source checkout'],
  ])('does not probe a global npm root for %s', (cliPath, message) => {
    vi.mocked(realpathSync).mockImplementation((value) =>
      value === process.argv[1] ? cliPath : String(value),
    );
    expect(
      getInstallationInfo('/workspace', {
        TMPDIR: directory,
        PNPM_HOME: '/home/user/.local/share/pnpm',
      }),
    ).toEqual({ canUpdate: false, message: expect.stringContaining(message) });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('uses official image instructions', () => {
    expect(getInstallationInfo('/workspace', { PROMPTFOO_OFFICIAL_DOCKER_IMAGE: 'true' })).toEqual({
      canUpdate: false,
      message: expect.stringContaining('ghcr.io/promptfoo/promptfoo'),
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('asks custom container users to rebuild', () => {
    vi.mocked(existsSync).mockImplementation((file) => file === '/.dockerenv');
    expect(getInstallationInfo('/workspace', {}).message).toContain('rebuild and redeploy');
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('does not execute a package manager on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    expect(getInstallationInfo('/workspace', {}).canUpdate).toBe(false);
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
