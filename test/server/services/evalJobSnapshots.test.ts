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

  beforeEach(async () => {
    vi.resetModules();
    ({ EvalJobService: Service } = await import('../../../src/server/services/evalJobService'));
    service = new Service();
    cleanups = [];
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
    vi.restoreAllMocks();
    for (const cleanup of cleanups) {
      process.removeListener('exit', cleanup);
      cleanup();
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
    expect(service.get('../untrusted-job-id')).not.toHaveProperty('resultPath');
    expect(service.get('../untrusted-job-id')?.result).toEqual(snapshot('first'));
    expect(another.get('other')?.result).toEqual(snapshot('second'));
    cleanups[0]();
    expect(fs.existsSync(directory())).toBe(false);
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
