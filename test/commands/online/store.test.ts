import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as timers from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson, writeJson } from '../../../src/commands/online/store';

vi.mock('node:fs/promises', { spy: true });
vi.mock('node:timers/promises', { spy: true });
let directory: string;

beforeEach(async () => {
  vi.resetAllMocks();
  directory = await fs.mkdtemp(path.join(tmpdir(), 'online-store-'));
  vi.mocked(timers.setTimeout).mockResolvedValue(undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

describe('atomic online record replacement', () => {
  it.each(['EPERM', 'EACCES', 'EBUSY'])(
    'retries transient %s without deleting the old record',
    async (code) => {
      const file = path.join(directory, 'state.json');
      await writeJson(file, { value: 'old' });
      vi.mocked(fs.rename).mockImplementationOnce(async () => {
        expect(await readJson(file)).toEqual({ value: 'old' });
        throw Object.assign(new Error('temporarily locked'), { code });
      });
      await writeJson(file, { value: 'new' }, true);
      expect(await readJson(file)).toEqual({ value: 'new' });
      expect(fs.rename).toHaveBeenCalledTimes(2);
      expect(timers.setTimeout).toHaveBeenCalledWith(20);
      expect(await fs.readdir(directory)).toEqual(['state.json']);
    },
  );

  it.each([
    ['EPERM', 6],
    ['ENOENT', 1],
  ] as const)('bounds retries for %s and retains the previous record', async (code, attempts) => {
    const file = path.join(directory, 'state.json');
    await writeJson(file, { value: 'old' });
    vi.mocked(fs.rename).mockRejectedValue(Object.assign(new Error('cannot replace'), { code }));
    await expect(writeJson(file, { value: 'new' }, true)).rejects.toMatchObject({ code });
    expect(fs.rename).toHaveBeenCalledTimes(attempts);
    expect(timers.setTimeout).toHaveBeenCalledTimes(attempts - 1);
    expect(await readJson(file)).toEqual({ value: 'old' });
    expect(await fs.readdir(directory)).toEqual(['state.json']);
  });
});
