import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInstalledBinVersion } from '../../scripts/testPackageArtifact';

vi.mock('node:child_process', () => ({ execFile: vi.fn(), execFileSync: vi.fn() }));

const platform = process.platform;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  Object.defineProperty(process, 'platform', { value: platform });
});

describe('installed package bin check', () => {
  it.each(['promptfoo', 'pf'] as const)(
    'keeps the Windows install directory out of the %s shell command',
    (binName) => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.mocked(execFileSync).mockReturnValue('1.2.3\r\n');
      const consumerDir = 'C:\\temp\\%PATH% & (package test)';
      const configDir = 'C:\\temp\\config';

      expect(runInstalledBinVersion(consumerDir, configDir, binName)).toBe('1.2.3\r\n');
      const [command, args, options] = vi.mocked(execFileSync).mock.calls[0];
      expect(command).toBeTypeOf('string');
      expect(args).toEqual([
        '/d',
        '/s',
        '/c',
        `.\\node_modules\\.bin\\${binName}.cmd`,
        '--version',
      ]);
      expect(options?.cwd).toBe(consumerDir);
      expect(options?.env?.PROMPTFOO_CONFIG_DIR).toBe(configDir);
    },
  );

  it('executes Unix bins directly with a separate version argument', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.mocked(execFileSync).mockReturnValue('1.2.3\n');

    expect(runInstalledBinVersion('/tmp/package with spaces', '/tmp/config', 'pf')).toBe('1.2.3\n');
    const [command, args, options] = vi.mocked(execFileSync).mock.calls[0];
    expect(command).toBe(path.join('/tmp/package with spaces', 'node_modules', '.bin', 'pf'));
    expect(args).toEqual(['--version']);
    expect(options?.cwd).toBe('/tmp/package with spaces');
  });

  it('rejects a missing installed bin before starting a process', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(() => runInstalledBinVersion('/tmp/package', '/tmp/config', 'promptfoo')).toThrow(
      'Missing installed promptfoo bin',
    );
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
