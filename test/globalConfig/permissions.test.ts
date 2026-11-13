import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readGlobalConfig,
  writeGlobalConfig,
  writeGlobalConfigPartial,
} from '../../src/globalConfig/globalConfig';
import { setConfigDirectoryPath } from '../../src/util/config/manage';

describe('global config permissions', () => {
  let tempDir: string;
  let configDir: string;
  let file: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-global-config-'));
    configDir = path.join(tempDir, 'config');
    file = path.join(configDir, 'promptfoo.yaml');
    setConfigDirectoryPath(configDir);
  });

  afterEach(() => {
    setConfigDirectoryPath(undefined);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates and persists an ID on first read', () => {
    const { id } = readGlobalConfig();
    expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    expect(readGlobalConfig()).toEqual({ id });
    if (process.platform !== 'win32') {
      expect(fs.statSync(configDir).mode & 0o077).toBe(0);
      expect(fs.statSync(file).mode & 0o077).toBe(0);
    }
  });

  it('reads legacy credentials and preserves the shared directory', () => {
    fs.mkdirSync(configDir);
    fs.writeFileSync(file, 'id: test-id\ncloud:\n  apiKey: old-fixture-key\n');
    if (process.platform !== 'win32') {
      fs.chmodSync(configDir, 0o755);
      fs.chmodSync(file, 0o444);
    }

    expect(readGlobalConfig().cloud?.apiKey).toBe('old-fixture-key');
    if (process.platform !== 'win32') {
      expect(fs.statSync(file).mode & 0o777).toBe(0o400);
      expect(fs.statSync(configDir).mode & 0o777).toBe(0o755);
    }
  });

  describe.skipIf(process.platform === 'win32')('POSIX credential targets', () => {
    it('keeps a dangling config symlink intact', () => {
      fs.mkdirSync(configDir);
      fs.symlinkSync('missing.yaml', file);

      expect(() => writeGlobalConfig({ cloud: { apiKey: 'fixture-key' } })).toThrow(
        'Create the global config symlink target',
      );
      expect(fs.readlinkSync(file)).toBe('missing.yaml');
      expect(fs.readdirSync(configDir)).toEqual(['promptfoo.yaml']);
    });

    it.each(['writeFileSync', 'renameSync'] as const)(
      'rolls back after a failed %s',
      (operation) => {
        fs.mkdirSync(configDir);
        const original = 'id: original\n';
        const target = path.join(configDir, 'target.yaml');
        fs.writeFileSync(target, original);
        fs.symlinkSync('target.yaml', file);

        const close = vi.spyOn(fs, 'closeSync');
        const failure = vi.spyOn(fs, operation).mockImplementationOnce(() => {
          throw new Error('injected credential write failure');
        });
        syncBuiltinESMExports();
        try {
          expect(() => writeGlobalConfig({ cloud: { apiKey: 'fixture-key' } })).toThrow(
            'injected credential write failure',
          );
          expect(close).toHaveBeenCalledTimes(1);
          const [fd] = close.mock.calls[0];
          expect(() => fs.fstatSync(fd)).toThrow(expect.objectContaining({ code: 'EBADF' }));
        } finally {
          failure.mockRestore();
          close.mockRestore();
          syncBuiltinESMExports();
        }

        expect(fs.readFileSync(target, 'utf8')).toBe(original);
        expect(fs.readlinkSync(file)).toBe('target.yaml');
        expect(fs.readdirSync(configDir).sort()).toEqual(['promptfoo.yaml', 'target.yaml']);
      },
    );

    it('leaves a linked FIFO untouched', () => {
      fs.mkdirSync(configDir);
      const fifo = path.join(tempDir, 'pipe');
      execFileSync('mkfifo', [fifo]);
      fs.symlinkSync(fifo, file);

      // A regressed in-place writer must fail the test rather than block opening the FIFO.
      const reader = fs.openSync(fifo, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
      try {
        expect(() => writeGlobalConfig({ cloud: { apiKey: 'fixture-key' } })).toThrow(
          'regular file',
        );
        expect(fs.statSync(fifo).isFIFO()).toBe(true);
      } finally {
        fs.closeSync(reader);
      }
    });
  });

  it('saves a key to an existing config', () => {
    fs.mkdirSync(configDir);
    // A linked target can already use the entire POSIX filename component limit.
    const target = process.platform === 'win32' ? file : path.join(tempDir, 'a'.repeat(255));
    fs.writeFileSync(target, 'id: test-id\n');
    if (process.platform !== 'win32') {
      fs.chmodSync(target, 0o644);
      fs.symlinkSync(target, file);
    }

    const previous = fs.openSync(file, 'r');
    try {
      writeGlobalConfigPartial({ cloud: { apiKey: 'new-fixture-key' } });
      expect(readGlobalConfig().cloud?.apiKey).toBe('new-fixture-key');
      if (process.platform !== 'win32') {
        expect(fs.readFileSync(previous, 'utf8')).not.toContain('new-fixture-key');
        expect(fs.statSync(target).mode & 0o777).toBe(0o600);
        expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
      }
    } finally {
      fs.closeSync(previous);
    }
  });
});
