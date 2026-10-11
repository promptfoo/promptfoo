import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInstalledBinVersion } from '../../scripts/testPackageArtifact';

vi.mock('node:child_process', () => ({ execFile: vi.fn(), execFileSync: vi.fn() }));

const platform = process.platform;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
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

  it.each(['promptfoo', 'pf'] as const)(
    'preserves the Windows %s exit status and SQLite diagnostic when optional dependencies are absent',
    (binName) => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const diagnostic =
        'could not load its SQLite dependency\nRequired package: @libsql/win32-x64-msvc';
      const processError = Object.assign(new Error('Command failed'), {
        status: 1,
        stderr: diagnostic,
      });
      vi.mocked(execFileSync).mockImplementation(() => {
        throw processError;
      });

      expect(() =>
        runInstalledBinVersion('C:\\temp\\package', 'C:\\temp\\config', binName),
      ).toThrow(
        expect.objectContaining({
          cause: processError,
          message: expect.stringContaining(diagnostic),
        }),
      );
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

  it.each(['promptfoo', 'pf'] as const)(
    'executes the real %s shim from a directory with shell metacharacters',
    async (binName) => {
      const actual =
        await vi.importActual<typeof import('node:child_process')>('node:child_process');
      vi.mocked(execFileSync).mockImplementation(actual.execFileSync);
      vi.stubEnv('PROMPTFOO_TEST_NODE', process.execPath);
      const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-bin-shim-'));
      const consumerDir = path.join(temporaryRoot, '%PATH% & (package test)');
      const configDir = path.join(temporaryRoot, 'config');
      const binDir = path.join(consumerDir, 'node_modules', '.bin');
      const fixtureDir = path.join(consumerDir, 'node_modules', 'fixture');
      const script = `console.log(JSON.stringify({
        args: process.argv.slice(2),
        cwd: process.cwd(),
        configDir: process.env.PROMPTFOO_CONFIG_DIR,
      }));
`;
      try {
        fs.mkdirSync(binDir, { recursive: true });
        fs.mkdirSync(fixtureDir, { recursive: true });
        fs.writeFileSync(path.join(fixtureDir, 'cli.cjs'), script);
        if (platform === 'win32') {
          fs.writeFileSync(
            path.join(binDir, `${binName}.cmd`),
            '@ECHO off\r\n"%PROMPTFOO_TEST_NODE%" "%~dp0\\..\\fixture\\cli.cjs" %*\r\n',
          );
        } else {
          fs.writeFileSync(
            path.join(binDir, binName),
            `#!/usr/bin/env node
${script}`,
            {
              mode: 0o755,
            },
          );
        }

        const output = JSON.parse(runInstalledBinVersion(consumerDir, configDir, binName));
        expect(output.args).toEqual(['--version']);
        expect(fs.realpathSync(output.cwd)).toBe(fs.realpathSync(consumerDir));
        expect(output.configDir).toBe(configDir);
      } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
      }
    },
  );

  it('rejects a missing installed bin before starting a process', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(() => runInstalledBinVersion('/tmp/package', '/tmp/config', 'promptfoo')).toThrow(
      'Missing installed promptfoo bin',
    );
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
