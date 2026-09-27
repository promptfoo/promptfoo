import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { EvalJobService } from '../../../src/server/services/evalJobService';

describe('eval job result snapshots', () => {
  let Service: typeof EvalJobService;
  let service: EvalJobService;
  let directorySpy: MockInstance<typeof fs.mkdtempSync>;
  let cleanups: Array<() => void>;
  let movedDirectories: string[];

  beforeEach(async () => {
    vi.resetModules();
    ({ EvalJobService: Service } = await import('../../../src/server/services/evalJobService'));
    service = new Service();
    cleanups = [];
    movedDirectories = [];
    const once = process.once.bind(process);
    vi.spyOn(process, 'once').mockImplementation((event, listener) => {
      if (event === 'exit') {
        cleanups.push(listener as () => void);
      }
      return once(event, listener);
    });
    directorySpy = vi.spyOn(fs, 'mkdtempSync');
  });

  afterEach(() => {
    const ownedDirectories = directorySpy.mock.results
      .filter((entry) => entry.type === 'return')
      .map((entry) => entry.value as string);
    vi.restoreAllMocks();
    for (const cleanup of cleanups) {
      process.removeListener('exit', cleanup);
      cleanup();
    }
    // These paths belong to the test, including replacements the service must leave alone.
    for (const directory of [...ownedDirectories, ...movedDirectories]) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  const snapshot = (output: unknown) => ({ results: [{ output }] }) as never;
  const directory = () =>
    directorySpy.mock.results.find((result) => result.type === 'return')!.value as string;
  const files = () => fs.readdirSync(directory()).map((file) => path.join(directory(), file));

  it('allocates nothing for pending jobs, missing jobs, or null results', () => {
    expect(service.complete('missing', snapshot('ignored'), null)).toBe(false);
    service.create('pending');
    service.setProgress('pending', 1, 2);
    service.appendLog('pending', 'working');
    service.complete('pending', null, null);
    service.fail('pending', ['failed']);
    expect(service.get('pending')?.result).toBeNull();
    expect(directorySpy).not.toHaveBeenCalled();
    expect(cleanups).toHaveLength(0);
  });

  it('stores private snapshots with opaque filenames and one process cleanup across instances', () => {
    service.create('../untrusted-job-id');
    service.complete('../untrusted-job-id', snapshot('first'), null);
    const another = new Service();
    another.create('other');
    another.complete('other', snapshot('second'), null);

    expect(directorySpy).toHaveBeenCalledTimes(1);
    expect(cleanups).toHaveLength(1);
    expect(files()).toHaveLength(2);
    for (const file of files()) {
      expect(path.basename(file)).toMatch(/^[a-f0-9-]{36}\.json$/);
      if (process.platform !== 'win32') {
        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      }
    }
    if (process.platform !== 'win32') {
      expect(fs.statSync(directory()).mode & 0o777).toBe(0o700);
    }
    expect(service.get('../untrusted-job-id')).not.toHaveProperty('resultSnapshot');
    expect(service.get('../untrusted-job-id')?.result).toEqual(snapshot('first'));
    expect(another.get('other')?.result).toEqual(snapshot('second'));
    cleanups[0]();
    expect(fs.existsSync(directory())).toBe(false);
  });

  it('recovers in a fresh private directory after temporary-file cleanup', () => {
    service.create('old');
    service.complete('old', snapshot('old result'), 'old-eval');
    const previousDirectory = directory();
    fs.rmSync(previousDirectory, { recursive: true });

    const another = new Service();
    another.create('new');
    expect(another.complete('new', snapshot('new result'), 'new-eval')).toBe(true);
    const replacement = directorySpy.mock.results.at(-1)!.value as string;
    expect(replacement).not.toBe(previousDirectory);
    expect(fs.existsSync(previousDirectory)).toBe(false);
    expect(another.get('new')).toMatchObject({
      result: snapshot('new result'),
      evalId: 'new-eval',
    });
    expect(() => service.get('old')).toThrow();
    expect(directorySpy).toHaveBeenCalledTimes(2);
    expect(cleanups).toHaveLength(1);
    const [filename] = fs.readdirSync(replacement);
    if (process.platform !== 'win32') {
      expect(fs.statSync(replacement).mode & 0o777).toBe(0o700);
      expect(fs.statSync(path.join(replacement, filename)).mode & 0o777).toBe(0o600);
    }
    cleanups[0]();
    expect(fs.existsSync(replacement)).toBe(false);
  });

  const replaceDirectory = (kind: 'directory' | 'private directory' | 'symlink') => {
    const original = directory();
    const moved = `${original}-original`;
    fs.renameSync(original, moved);
    movedDirectories.push(moved);
    if (kind === 'symlink') {
      fs.symlinkSync(moved, original, 'junction');
    } else {
      fs.mkdirSync(original);
      fs.chmodSync(original, kind === 'private directory' ? 0o700 : 0o777);
    }
    return { original, moved };
  };

  it.each(['directory', 'private directory', 'symlink'] as const)(
    'does not write new results through a replaced %s',
    (kind) => {
      service.create('old');
      service.complete('old', snapshot('old result'), 'old-eval');
      const { original, moved } = replaceDirectory(kind);
      const before = fs.readdirSync(original);
      service.create('new');
      expect(service.complete('new', snapshot('new result'), 'new-eval')).toBe(true);
      expect(directorySpy).toHaveBeenCalledTimes(2);
      expect(fs.readdirSync(original)).toEqual(before);
      expect(fs.readdirSync(moved)).toHaveLength(1);
      expect(service.get('new')?.result).toEqual(snapshot('new result'));
      expect(() => service.get('old')).toThrow();
      expect(cleanups).toHaveLength(1);
      cleanups[0]();
      expect(fs.existsSync(original)).toBe(true);
    },
  );

  it.each(['directory', 'private directory', 'symlink'] as const)(
    'rejects old results and preserves a replaced %s during cleanup',
    (kind) => {
      for (const id of ['read', 'create', 'fail']) {
        service.create(id);
        service.complete(id, snapshot(id), null);
      }
      const originals = files().map((file) => path.basename(file));
      const { original } = replaceDirectory(kind);
      if (kind !== 'symlink') {
        for (const filename of originals) {
          fs.writeFileSync(path.join(original, filename), JSON.stringify(snapshot('forged')), {
            mode: 0o600,
          });
        }
      }
      expect(() => service.get('read')).toThrow();
      service.create('create');
      service.fail('fail', ['failed']);
      cleanups[0]();
      expect(fs.readdirSync(original).sort()).toEqual(originals.sort());
    },
  );

  it('rejects a directory with widened permissions even when its identity is unchanged', () => {
    if (process.platform !== 'win32') {
      service.create('old');
      service.complete('old', snapshot('private'), null);
      const original = directory();
      const identity = fs.statSync(original).ino;
      fs.chmodSync(original, 0o777);
      expect(fs.statSync(original).ino).toBe(identity);
      expect(() => service.get('old')).toThrow();
      service.create('new');
      service.complete('new', snapshot('new private result'), null);
      expect(directorySpy).toHaveBeenCalledTimes(2);
      expect(service.get('new')?.result).toEqual(snapshot('new private result'));
      cleanups[0]();
      expect(fs.existsSync(original)).toBe(true);
    }
  });

  it('rejects a directory owned by another user even if its mode and identity match', () => {
    if (process.platform !== 'win32') {
      service.create('job');
      service.complete('job', snapshot('original'), null);
      const stat = fs.lstatSync;
      vi.spyOn(fs, 'lstatSync').mockImplementationOnce((filename) => {
        const actual = stat(filename);
        return Object.assign(actual, { uid: actual.uid + 1 });
      });
      expect(() => service.get('job')).toThrow();
      expect(service.get('job')?.result).toEqual(snapshot('original'));
    }
  });

  it('rejects a snapshot symlink and never reads its target', () => {
    service.create('job');
    service.complete('job', snapshot('original'), null);
    const filename = files()[0];
    const target = `${filename}-target`;
    fs.writeFileSync(target, JSON.stringify(snapshot('forged')), { mode: 0o600 });
    fs.unlinkSync(filename);
    fs.symlinkSync(target, filename);
    expect(() => service.get('job')).toThrow();
  });

  it('reads a private owner-readable snapshot created with a restrictive umask', () => {
    if (process.platform !== 'win32') {
      const previous = process.umask(0o200);
      try {
        service.create('job');
        expect(service.complete('job', snapshot('private readable result'), null)).toBe(true);
        expect(fs.statSync(files()[0]).mode & 0o777).toBe(0o400);
        expect(service.get('job')?.result).toEqual(snapshot('private readable result'));
      } finally {
        process.umask(previous);
      }
    }
  });

  it('validates the opened file owner and permissions before reading it', () => {
    if (process.platform !== 'win32') {
      service.create('job');
      service.complete('job', snapshot('original'), null);
      const filename = files()[0];
      for (const mode of [0o700, 0o640, 0o644]) {
        fs.chmodSync(filename, mode);
        expect(() => service.get('job')).toThrow();
      }
      fs.chmodSync(filename, 0o600);
      const stat = fs.fstatSync;
      vi.spyOn(fs, 'fstatSync').mockImplementationOnce((fd) => {
        const actual = stat(fd);
        return Object.assign(actual, { uid: actual.uid + 1 });
      });
      const open = vi.spyOn(fs, 'openSync');
      expect(() => service.get('job')).toThrow();
      expect(() => fs.fstatSync(open.mock.results.at(-1)!.value as number)).toThrow();
      expect(service.get('job')?.result).toEqual(snapshot('original'));
    }
  });

  it('rejects parent substitution between validation and opening a result', () => {
    service.create('job');
    service.complete('job', snapshot('original'), null);
    const filename = path.basename(files()[0]);
    const open = fs.openSync;
    vi.spyOn(fs, 'openSync').mockImplementationOnce((file, flags, mode) => {
      const { original } = replaceDirectory('directory');
      fs.writeFileSync(path.join(original, filename), JSON.stringify(snapshot('forged')), {
        mode: 0o600,
      });
      return open(file, flags, mode);
    });
    expect(() => service.get('job')).toThrow();
  });

  it('does not write data if its parent is substituted during exclusive open', () => {
    service.create('job');
    service.complete('job', snapshot('original'), null);
    const open = fs.openSync;
    let replacementFile: fs.PathLike | undefined;
    vi.spyOn(fs, 'openSync').mockImplementationOnce((file, flags, mode) => {
      replaceDirectory('directory');
      replacementFile = file;
      return open(file, flags, mode);
    });
    expect(() => service.complete('job', snapshot('must stay private'), null)).toThrow(
      'Failed to store eval job result snapshot',
    );
    expect(fs.readFileSync(replacementFile!, 'utf8')).toBe('');
  });

  it('preserves the existing result when checking its directory fails', () => {
    service.create('job');
    service.complete('job', snapshot('original'), 'eval');
    const before = service.get('job');
    vi.spyOn(fs, 'lstatSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('Synthetic permission failure'), { code: 'EACCES' });
    });
    expect(() => service.complete('job', snapshot('replacement'), 'new-eval')).toThrow(
      'Failed to store eval job result snapshot',
    );
    expect(directorySpy).toHaveBeenCalledTimes(1);
    expect(service.get('job')).toEqual(before);
  });

  it('removes obsolete files when replacing, clearing, or recreating a job', () => {
    service.create('job');
    service.complete('job', snapshot('first'), 'eval-first');
    const first = files()[0];
    service.complete('job', snapshot('second'), 'eval-second');
    expect(fs.existsSync(first)).toBe(false);
    expect(files()).toHaveLength(1);
    expect(service.get('job')).toMatchObject({ evalId: 'eval-second', result: snapshot('second') });
    service.complete('job', null, null);
    expect(files()).toEqual([]);
    service.complete('job', snapshot('third'), 'eval-third');
    service.create('job');
    expect(files()).toEqual([]);
    expect(service.get('job')).toMatchObject({ status: 'in-progress', evalId: null, result: null });
  });

  it('retains a failed job snapshot only when resetResult is false', () => {
    service.create('job');
    service.complete('job', snapshot('completed'), 'eval');
    service.fail('job', ['cancelled'], { resetResult: false });
    expect(files()).toHaveLength(1);
    expect(service.get('job')).toMatchObject({
      status: 'error',
      result: snapshot('completed'),
      evalId: 'eval',
    });
    service.fail('job', ['reset'], { append: true });
    expect(files()).toEqual([]);
    expect(service.get('job')).toMatchObject({
      result: null,
      evalId: null,
      logs: ['cancelled', 'reset'],
    });
  });

  it('preserves the previous job and closes/removes a partially written replacement', () => {
    service.create('job');
    service.complete('job', snapshot('original'), 'eval');
    const before = service.get('job');
    const originalFiles = files();
    const write = fs.writeFileSync;
    let descriptor: number | undefined;
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce((file) => {
      descriptor = file as number;
      write(file, 'partial snapshot');
      throw new Error('ENOSPC synthetic private path');
    });

    expect(() => service.complete('job', snapshot('replacement'), 'new-eval')).toThrow(
      'Failed to store eval job result snapshot',
    );
    expect(service.get('job')).toEqual(before);
    expect(files()).toEqual(originalFiles);
    expect(() => fs.fstatSync(descriptor!)).toThrow();
  });

  it('does not delete a preexisting file when exclusive creation collides', () => {
    service.create('job');
    service.complete('job', snapshot('original'), 'eval');
    const before = service.get('job');
    const open = fs.openSync;
    let collision: fs.PathLike | undefined;
    vi.spyOn(fs, 'openSync').mockImplementationOnce((file, flags, mode) => {
      collision = file;
      fs.writeFileSync(file, 'owned by another snapshot');
      return open(file, flags, mode);
    });

    expect(() => service.complete('job', snapshot('replacement'), 'new-eval')).toThrow(
      'Failed to store eval job result snapshot',
    );
    expect(fs.readFileSync(collision!, 'utf8')).toBe('owned by another snapshot');
    expect(service.get('job')).toEqual(before);
    expect(files()).toHaveLength(2);
  });

  it('reports directory initialization failure without changing a pending job', () => {
    service.create('job');
    directorySpy.mockImplementationOnce(() => {
      throw new Error('EACCES private-directory');
    });
    expect(() => service.complete('job', snapshot('result'), 'eval')).toThrow(
      /^Failed to store eval job result snapshot$/,
    );
    expect(service.get('job')).toMatchObject({ status: 'in-progress', result: null, evalId: null });
    expect(cleanups).toHaveLength(0);
    expect(service.complete('job', snapshot('retry'), 'eval')).toBe(true);
  });

  it('cleans a new directory if securing its permissions fails', () => {
    service.create('job');
    if (process.platform !== 'win32') {
      vi.spyOn(fs, 'chmodSync').mockImplementationOnce(() => {
        throw new Error('EPERM private-directory');
      });
      expect(() => service.complete('job', snapshot('result'), 'eval')).toThrow(
        'Failed to store eval job result snapshot',
      );
      expect(fs.existsSync(directory())).toBe(false);
      expect(service.get('job')?.status).toBe('in-progress');
      expect(cleanups).toHaveLength(0);
    }
    expect(service.complete('job', snapshot('retry'), 'eval')).toBe(true);
    expect(service.get('job')?.result).toEqual(snapshot('retry'));
  });

  it('keeps the new result when obsolete-file cleanup fails', () => {
    service.create('job');
    service.complete('job', snapshot('original'), 'eval');
    vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw new Error('EPERM old-file');
    });
    expect(service.complete('job', snapshot('replacement'), 'new-eval')).toBe(true);
    expect(service.get('job')).toMatchObject({
      result: snapshot('replacement'),
      evalId: 'new-eval',
    });
  });

  it('preserves JSON serialization semantics and returns independent snapshots', () => {
    const shared = { nested: 'original' };
    const output: Record<string, unknown> = {
      first: shared,
      second: shared,
      count: 42n,
      omitted: () => 'function',
      list: [undefined, NaN, Infinity],
      date: new Date('2026-01-02T03:04:05Z'),
    };
    output.self = output;
    const toJSON = vi.fn(() => output);
    service.create('job');
    service.complete('job', snapshot({ toJSON }), null);
    const expected = snapshot({
      first: { nested: 'original' },
      second: { nested: 'original' },
      count: '42',
      list: [null, null, null],
      date: '2026-01-02T03:04:05.000Z',
    });
    expect(service.get('job')?.result).toEqual(expected);
    const first = service.get('job')!;
    (first.result as any).results[0].output.first.nested = 'changed';
    first.logs.push('external');
    shared.nested = 'changed source';
    expect(service.get('job')?.result).toEqual(expected);
    expect(service.get('job')?.logs).toEqual([]);
    expect(toJSON).toHaveBeenCalledTimes(1);
  });

  it('does not replace a result when serialization throws', () => {
    service.create('job');
    service.complete('job', snapshot('original'), 'eval');
    const before = service.get('job');
    const existingFiles = files();
    expect(() =>
      service.complete(
        'job',
        snapshot({
          toJSON: () => {
            throw new Error('serialization failed');
          },
        }),
        null,
      ),
    ).toThrow('serialization failed');
    expect(service.get('job')).toEqual(before);
    expect(files()).toEqual(existingFiles);
  });
});
