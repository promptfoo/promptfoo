import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getExecutableSourceHash, getFileSourceHash } from '../../src/util/sourceHash';

describe('source provenance', () => {
  const directories: string[] = [];
  const directory = () => {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-source-hash-'));
    directories.push(value);
    return value;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    for (const value of directories.splice(0)) {
      fs.rmSync(value, { recursive: true, force: true });
    }
  });

  it('hashes empty files and changes beyond the read-buffer boundary', () => {
    const file = path.join(directory(), 'source.js');
    fs.writeFileSync(file, '');
    expect(getFileSourceHash(file)).toBe(getFileSourceHash(file));
    const content = 'x'.repeat(128 * 1024) + 'a';
    fs.writeFileSync(file, content);
    const before = getFileSourceHash(file);
    fs.writeFileSync(file, content.slice(0, -1) + 'b');
    expect(getFileSourceHash(file)).not.toBe(before);
    expect(getFileSourceHash(file, 'first')).not.toBe(getFileSourceHash(file, 'second'));
  });

  it.each(['missing', 'directory'])(
    'does not establish stable provenance for a %s source',
    (kind) => {
      const root = directory();
      const file = kind === 'directory' ? root : path.join(root, 'missing');
      expect(getFileSourceHash(file)).not.toBe(getFileSourceHash(file));
      expect(getExecutableSourceHash([file])).not.toBe(getExecutableSourceHash([file]));
    },
  );

  it('closes the file if a source read fails', () => {
    const file = path.join(directory(), 'source.js');
    fs.writeFileSync(file, 'source');
    vi.spyOn(fs, 'readSync').mockImplementation(() => {
      throw new Error('read failed');
    });
    const close = vi.spyOn(fs, 'closeSync');
    expect(getFileSourceHash(file)).not.toBe(getFileSourceHash(file));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('resolves PATH candidates and fingerprints file arguments while ignoring flags and directories', () => {
    const root = directory();
    const first = path.join(root, 'first');
    const second = path.join(root, 'second');
    fs.mkdirSync(path.join(first, 'runner'), { recursive: true });
    fs.mkdirSync(second);
    fs.writeFileSync(path.join(second, 'runner'), 'executable', { mode: 0o755 });
    const script = path.join(root, 'script.js');
    fs.writeFileSync(script, 'first');
    vi.stubEnv('PATH', [first, second].join(path.delimiter));
    const parts = ['runner', 'script.js', '--flag', 'first'];
    const before = getExecutableSourceHash(parts, root);
    expect(getExecutableSourceHash(parts, root)).toBe(before);
    fs.writeFileSync(script, 'other');
    expect(getExecutableSourceHash(parts, root)).not.toBe(before);
  });

  it('rejects inaccessible executable candidates and argument files', () => {
    const root = directory();
    const executable = path.join(root, 'runner');
    fs.writeFileSync(executable, 'executable', { mode: 0o755 });
    vi.stubEnv('PATH', root);
    vi.spyOn(fs, 'accessSync').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getExecutableSourceHash(['runner'])).not.toBe(getExecutableSourceHash(['runner']));
    const stat = fs.statSync;
    vi.spyOn(fs, 'statSync').mockImplementation((...args) => {
      if (String(args[0]).endsWith('private.js')) {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      }
      return stat(...args);
    });
    expect(getExecutableSourceHash([executable, 'private.js'], root)).not.toBe(
      getExecutableSourceHash([executable, 'private.js'], root),
    );
  });
});
