import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import logger from '../../src/logger';
import * as configManage from '../../src/util/config/manage';
import {
  getConfigDirectoryPath,
  refreshConfigDirectoryPathFromEnv,
  setConfigDirectoryPath,
} from '../../src/util/config/manage';
import { setupEnv } from '../../src/util/env';
import { createTempDir, mockProcessEnv, removeTempDir } from './utils';

// These tests exercise default loading against temporary files.
vi.mock('../../src/util/envFile', async (importOriginal) => importOriginal());

describe('setupEnv', () => {
  let directory: string;
  let restoreEnv: () => void;
  let loggerInfoSpy: MockInstance;

  function writeEnv(filename: string, contents: string): string {
    const filenamePath = path.join(directory, filename);
    fs.writeFileSync(filenamePath, contents);
    return filenamePath;
  }

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      DOTENV_PATH: undefined,
      DOTENV_CONFIG_PATH: undefined,
      DOTENV_ENCODING: undefined,
      DOTENV_CONFIG_ENCODING: undefined,
      DOTENV_OVERRIDE: undefined,
      DOTENV_CONFIG_OVERRIDE: undefined,
      PROMPTFOO_CONFIG_DIR: undefined,
      PROMPTFOO_ENV_TEST_VALUE: undefined,
      PROMPTFOO_ENV_TEST_MISSING: undefined,
      PROMPTFOO_ENV_TEST_EXISTING: undefined,
      PROMPTFOO_ENV_TEST_EMPTY: undefined,
      PROMPTFOO_ENV_TEST_UNDEFINED: undefined,
    });
    refreshConfigDirectoryPathFromEnv();
    setConfigDirectoryPath(undefined);
    directory = createTempDir('promptfoo-setup-env-');
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
    loggerInfoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    restoreEnv();
    refreshConfigDirectoryPathFromEnv();
    setConfigDirectoryPath(undefined);
    removeTempDir(directory);
  });

  it.each([undefined, [], '', ' , ', ['', '  ', '']])(
    'loads implicit .env without overriding host values (%j)',
    (envPath) => {
      mockProcessEnv({ PROMPTFOO_ENV_TEST_VALUE: 'host', PROMPTFOO_ENV_TEST_EMPTY: '' });
      writeEnv(
        '.env',
        'PROMPTFOO_ENV_TEST_VALUE=file\nPROMPTFOO_ENV_TEST_EMPTY=file\nPROMPTFOO_ENV_TEST_MISSING=default\n',
      );

      setupEnv(envPath);

      expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('host');
      expect(process.env.PROMPTFOO_ENV_TEST_EMPTY).toBe('');
      expect(process.env.PROMPTFOO_ENV_TEST_MISSING).toBe('default');
      expect(loggerInfoSpy).not.toHaveBeenCalled();
    },
  );

  it('allows a missing implicit .env file', () => {
    mockProcessEnv({ PROMPTFOO_ENV_TEST_VALUE: 'host' });

    expect(() => setupEnv(undefined)).not.toThrow();

    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('host');
    expect(loggerInfoSpy).not.toHaveBeenCalled();
  });

  it.each(['DOTENV_', 'DOTENV_CONFIG_'])('inherits %s defaults for implicit loading', (prefix) => {
    const file = path.join(directory, 'configured.env');
    fs.writeFileSync(file, 'PROMPTFOO_ENV_TEST_VALUE=file', 'utf16le');
    mockProcessEnv({
      [`${prefix}PATH`]: file,
      [`${prefix}ENCODING`]: 'utf16le',
      [`${prefix}OVERRIDE`]: 'true',
      PROMPTFOO_ENV_TEST_VALUE: 'host',
    });

    setupEnv(undefined);

    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('file');
    expect(loggerInfoSpy).not.toHaveBeenCalled();
  });

  it('lets explicit paths and override behavior win over configured defaults', () => {
    mockProcessEnv({
      DOTENV_PATH: writeEnv('ignored.env', 'PROMPTFOO_ENV_TEST_VALUE=ignored'),
      DOTENV_OVERRIDE: 'false',
      PROMPTFOO_ENV_TEST_VALUE: 'host',
    });
    const file = writeEnv('explicit.env', 'PROMPTFOO_ENV_TEST_VALUE=explicit');

    setupEnv(file);

    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('explicit');
  });

  it('keeps configured implicit overrides isolated and preserves host-only values', () => {
    mockProcessEnv({
      DOTENV_PATH: writeEnv(
        'configured.env',
        'PROMPTFOO_ENV_TEST_VALUE=file\nPROMPTFOO_ENV_TEST_MISSING=added',
      ),
      DOTENV_OVERRIDE: 'true',
      PROMPTFOO_ENV_TEST_VALUE: 'host',
      PROMPTFOO_ENV_TEST_MISSING: 'host-only',
    });
    const env: NodeJS.ProcessEnv = { PROMPTFOO_ENV_TEST_VALUE: 'local' };

    setupEnv(undefined, { processEnv: env });

    expect(env).toEqual({ PROMPTFOO_ENV_TEST_VALUE: 'file' });
    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('host');
    expect(process.env.PROMPTFOO_ENV_TEST_MISSING).toBe('host-only');
  });

  it('keeps implicit defaults isolated and defers to host and existing destination values', () => {
    mockProcessEnv({ PROMPTFOO_ENV_TEST_VALUE: 'host' });
    writeEnv(
      '.env',
      [
        'PROMPTFOO_ENV_TEST_VALUE=file',
        'PROMPTFOO_ENV_TEST_MISSING=default',
        'PROMPTFOO_ENV_TEST_EXISTING=file',
        'PROMPTFOO_ENV_TEST_EMPTY=file',
        'PROMPTFOO_ENV_TEST_UNDEFINED=file',
      ].join('\n'),
    );
    const env: NodeJS.ProcessEnv = {
      PROMPTFOO_ENV_TEST_EXISTING: 'local',
      PROMPTFOO_ENV_TEST_EMPTY: '',
      PROMPTFOO_ENV_TEST_UNDEFINED: undefined,
    };

    setupEnv(undefined, { processEnv: env });

    expect(env).toEqual({
      PROMPTFOO_ENV_TEST_MISSING: 'default',
      PROMPTFOO_ENV_TEST_EXISTING: 'local',
      PROMPTFOO_ENV_TEST_EMPTY: '',
      PROMPTFOO_ENV_TEST_UNDEFINED: undefined,
    });
    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('host');
    expect(process.env.PROMPTFOO_ENV_TEST_MISSING).toBeUndefined();
    expect(process.env.PROMPTFOO_ENV_TEST_EXISTING).toBeUndefined();
  });

  it.each([false, true])('trims explicit paths and overrides host values (array: %j)', (array) => {
    mockProcessEnv({ PROMPTFOO_ENV_TEST_VALUE: 'host' });
    const envFile = writeEnv('explicit.env', 'PROMPTFOO_ENV_TEST_VALUE=explicit\n');
    const envPath = array ? ['', ` ${envFile} `, '  '] : ` ${envFile} `;

    setupEnv(envPath);

    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('explicit');
    expect(loggerInfoSpy).toHaveBeenCalledExactlyOnceWith(
      `Loading environment variables from ${envFile}`,
    );
  });

  it('overrides values loaded from an earlier implicit .env', () => {
    writeEnv('.env', 'PROMPTFOO_ENV_TEST_VALUE=default\n');
    const explicit = writeEnv('explicit.env', 'PROMPTFOO_ENV_TEST_VALUE=explicit\n');

    setupEnv(undefined);
    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('default');
    setupEnv(explicit);

    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('explicit');
  });

  it('overrides an isolated destination without modifying process.env', () => {
    mockProcessEnv({ PROMPTFOO_ENV_TEST_VALUE: 'host' });
    const explicit = writeEnv(
      'explicit.env',
      'PROMPTFOO_ENV_TEST_VALUE=explicit\nPROMPTFOO_ENV_TEST_MISSING=new\n',
    );
    const env: NodeJS.ProcessEnv = { PROMPTFOO_ENV_TEST_VALUE: 'local' };

    setupEnv(explicit, { processEnv: env });

    expect(env).toEqual({
      PROMPTFOO_ENV_TEST_VALUE: 'explicit',
      PROMPTFOO_ENV_TEST_MISSING: 'new',
    });
    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('host');
    expect(process.env.PROMPTFOO_ENV_TEST_MISSING).toBeUndefined();
  });

  it.each(['array', 'comma-separated', 'mixed', 'repeated'])(
    'loads explicit files in order, including empty values (%s paths)',
    (mode) => {
      mockProcessEnv({ PROMPTFOO_ENV_TEST_VALUE: 'host' });
      const first = writeEnv(
        'first.env',
        'PROMPTFOO_ENV_TEST_VALUE=first\nPROMPTFOO_ENV_TEST_MISSING=first-only\n',
      );
      const second = writeEnv('second.env', 'PROMPTFOO_ENV_TEST_VALUE=second\n');
      const third = writeEnv('third.env', 'PROMPTFOO_ENV_TEST_VALUE=\n');
      const inputs: Record<string, string | string[]> = {
        array: [first, second, third],
        'comma-separated': ` ${first}, ${second}, ${third} `,
        mixed: [`${first}, ${second}`, '', ` ${third} `],
        repeated: [first, second, first, third],
      };
      const env: NodeJS.ProcessEnv = {};

      setupEnv(inputs[mode], { processEnv: env });

      expect(env).toEqual({
        PROMPTFOO_ENV_TEST_VALUE: '',
        PROMPTFOO_ENV_TEST_MISSING: 'first-only',
      });
      expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('host');
      expect(process.env.PROMPTFOO_ENV_TEST_MISSING).toBeUndefined();
      const loadedPaths =
        mode === 'repeated' ? [first, second, first, third] : [first, second, third];
      expect(loggerInfoSpy).toHaveBeenCalledExactlyOnceWith(
        `Loading environment variables from: ${loadedPaths.join(', ')}`,
      );
    },
  );

  it('lets the last repeated path override intervening files', () => {
    const first = writeEnv('first.env', 'PROMPTFOO_ENV_TEST_VALUE=first\n');
    const second = writeEnv('second.env', 'PROMPTFOO_ENV_TEST_VALUE=second\n');

    setupEnv([first, second, first]);

    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('first');
  });

  it('rejects a missing explicitly requested file', () => {
    const missing = path.join(directory, 'missing.env');

    expect(() => setupEnv(missing)).toThrow(`Environment file not found: ${missing}`);
    expect(loggerInfoSpy).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'validates all explicit paths before changing any environment values (isolated: %j)',
    (isolated) => {
      mockProcessEnv({ PROMPTFOO_ENV_TEST_VALUE: 'host' });
      const first = writeEnv('first.env', 'PROMPTFOO_ENV_TEST_VALUE=first\n');
      const missing = path.join(directory, 'missing.env');
      const env: NodeJS.ProcessEnv = { PROMPTFOO_ENV_TEST_VALUE: 'local' };
      const refreshSpy = vi.spyOn(configManage, 'refreshConfigDirectoryPathFromEnv');

      expect(() =>
        setupEnv([first, missing], {
          ...(isolated && { processEnv: env }),
          refreshConfigDirectory: true,
        }),
      ).toThrow(`Environment file not found: ${missing}`);

      expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('host');
      expect(env).toEqual({ PROMPTFOO_ENV_TEST_VALUE: 'local' });
      expect(loggerInfoSpy).not.toHaveBeenCalled();
      expect(refreshSpy).not.toHaveBeenCalled();
    },
  );

  it('ignores read errors for the implicit .env', () => {
    writeEnv('.env', 'PROMPTFOO_ENV_TEST_VALUE=unreadable\n');
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    });

    expect(() => setupEnv(undefined)).not.toThrow();

    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBeUndefined();
  });

  it('continues loading explicit files after a read error', () => {
    const unreadable = writeEnv('unreadable.env', 'PROMPTFOO_ENV_TEST_MISSING=unreadable\n');
    const readable = writeEnv('readable.env', 'PROMPTFOO_ENV_TEST_VALUE=readable\n');
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    });

    expect(() => setupEnv([unreadable, readable])).not.toThrow();

    expect(process.env.PROMPTFOO_ENV_TEST_VALUE).toBe('readable');
    expect(process.env.PROMPTFOO_ENV_TEST_MISSING).toBeUndefined();
  });

  it('refreshes the config directory after early loading and freezes later changes', () => {
    const earlyDirectory = path.join(directory, 'early-config');
    const lateDirectory = path.join(directory, 'late-config');
    const early = writeEnv('early.env', `PROMPTFOO_CONFIG_DIR=${earlyDirectory}\n`);
    const late = writeEnv('late.env', `PROMPTFOO_CONFIG_DIR=${lateDirectory}\n`);
    const refreshSpy = vi.spyOn(configManage, 'refreshConfigDirectoryPathFromEnv');

    setupEnv(early, { refreshConfigDirectory: true });

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(getConfigDirectoryPath()).toBe(earlyDirectory);

    setupEnv(late);

    expect(process.env.PROMPTFOO_CONFIG_DIR).toBe(lateDirectory);
    expect(getConfigDirectoryPath()).toBe(earlyDirectory);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('can refresh the config directory even when implicit .env is missing', () => {
    const configDirectory = path.join(directory, 'config');
    mockProcessEnv({ PROMPTFOO_CONFIG_DIR: configDirectory });

    setupEnv(undefined, { refreshConfigDirectory: true });

    expect(getConfigDirectoryPath()).toBe(configDirectory);
  });

  it('does not use an isolated environment to change the process config directory', () => {
    const hostDirectory = path.join(directory, 'host-config');
    const isolatedDirectory = path.join(directory, 'isolated-config');
    mockProcessEnv({ PROMPTFOO_CONFIG_DIR: hostDirectory });
    const explicit = writeEnv('explicit.env', `PROMPTFOO_CONFIG_DIR=${isolatedDirectory}\n`);
    const env: NodeJS.ProcessEnv = {};

    setupEnv(explicit, { processEnv: env, refreshConfigDirectory: true });

    expect(env.PROMPTFOO_CONFIG_DIR).toBe(isolatedDirectory);
    expect(process.env.PROMPTFOO_CONFIG_DIR).toBe(hostDirectory);
    expect(getConfigDirectoryPath()).toBe(hostDirectory);
  });
});
