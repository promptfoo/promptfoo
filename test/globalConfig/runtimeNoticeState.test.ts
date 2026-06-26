import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readRuntimeNoticeLastShownAt,
  withRuntimeNoticeStateLock,
  writeRuntimeNoticeLastShownAt,
} from '../../src/globalConfig/runtimeNoticeState';
import { setConfigDirectoryPath } from '../../src/util/config/manage';

describe('runtime notice state', () => {
  let configDirectory: string;

  beforeEach(() => {
    configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-runtime-notice-'));
    setConfigDirectoryPath(configDirectory);
  });

  afterEach(() => {
    vi.useRealTimers();
    setConfigDirectoryPath(undefined);
    fs.rmSync(configDirectory, { recursive: true, force: true });
  });

  it('stores notice timestamps separately without rewriting global config', () => {
    const globalConfigPath = path.join(configDirectory, 'promptfoo.yaml');
    const globalConfig = 'account:\n  email: current@example.com\n';
    fs.writeFileSync(globalConfigPath, globalConfig);

    writeRuntimeNoticeLastShownAt('node20-removal-2026-07-30', '2026-06-22T12:00:00.000Z');

    expect(readRuntimeNoticeLastShownAt('node20-removal-2026-07-30')).toBe(
      '2026-06-22T12:00:00.000Z',
    );
    writeRuntimeNoticeLastShownAt('node20-removal-2026-07-30', '2026-06-29T12:00:00.000Z');
    expect(readRuntimeNoticeLastShownAt('node20-removal-2026-07-30')).toBe(
      '2026-06-29T12:00:00.000Z',
    );
    expect(fs.readFileSync(globalConfigPath, 'utf8')).toBe(globalConfig);
    expect(fs.readdirSync(path.join(configDirectory, 'notices'))).toEqual([
      'node20-removal-2026-07-30.last-shown',
    ]);
  });

  it('treats missing notice state as not previously shown', () => {
    expect(readRuntimeNoticeLastShownAt('node20-removal-2026-07-30')).toBeUndefined();
  });

  it('preserves prior state and cleans up when atomic replacement fails', () => {
    const noticeId = 'node20-removal-2026-07-30';
    writeRuntimeNoticeLastShownAt(noticeId, '2026-06-22T12:00:00.000Z');
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('Atomic replacement failed');
    });

    try {
      expect(() => writeRuntimeNoticeLastShownAt(noticeId, '2026-06-29T12:00:00.000Z')).toThrow(
        'Atomic replacement failed',
      );
    } finally {
      renameSpy.mockRestore();
    }

    expect(readRuntimeNoticeLastShownAt(noticeId)).toBe('2026-06-22T12:00:00.000Z');
    expect(fs.readdirSync(path.join(configDirectory, 'notices'))).toEqual([
      'node20-removal-2026-07-30.last-shown',
    ]);
  });

  it('rejects notice ids that could escape the state directory', () => {
    expect(() => readRuntimeNoticeLastShownAt('../promptfoo.yaml')).toThrow(
      'Invalid runtime notice id',
    );
  });

  it('allows only one concurrent state transition for a notice', () => {
    const noticeId = 'node20-removal-2026-07-30';
    let nestedResult: boolean | undefined;

    const outerResult = withRuntimeNoticeStateLock(noticeId, () => {
      nestedResult = withRuntimeNoticeStateLock(noticeId, () => true);
      return true;
    });

    expect(outerResult).toBe(true);
    expect(nestedResult).toBeUndefined();
    expect(fs.readdirSync(path.join(configDirectory, 'notices'))).toEqual([]);
  });

  it('keeps a transition exclusive across a lease generation boundary', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-22T12:00:29.999Z'));
    const noticeId = 'node20-removal-2026-07-30';
    let nextLeaseResult: string | undefined;

    expect(
      withRuntimeNoticeStateLock(noticeId, () => {
        const noticeDirectory = path.join(configDirectory, 'notices');
        expect(
          fs.readdirSync(noticeDirectory).filter((entry) => entry.includes('.lock.')),
        ).toHaveLength(2);
        vi.setSystemTime(new Date('2026-06-22T12:00:30.000Z'));

        nextLeaseResult = withRuntimeNoticeStateLock(noticeId, () => 'claimed');
        return 'original';
      }),
    ).toBe('original');

    expect(nextLeaseResult).toBeUndefined();
    expect(withRuntimeNoticeStateLock(noticeId, () => 'claimed')).toBe('claimed');
    expect(fs.readdirSync(path.join(configDirectory, 'notices'))).toEqual([]);
  });

  it('ignores abandoned lease files after the protected generations pass', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const initialTime = new Date('2026-06-22T12:00:00.000Z');
    vi.setSystemTime(initialTime);
    const noticeId = 'node20-removal-2026-07-30';
    const noticeDirectory = path.join(configDirectory, 'notices');
    fs.mkdirSync(noticeDirectory, { recursive: true });
    const generation = Math.floor(initialTime.getTime() / 30_000);
    const abandonedLocks = [generation, generation + 1].map((value) =>
      path.join(noticeDirectory, `${noticeId}.last-shown.lock.${value}`),
    );
    for (const lockPath of abandonedLocks) {
      fs.writeFileSync(lockPath, 'abandoned\n');
    }

    expect(withRuntimeNoticeStateLock(noticeId, () => 'claimed')).toBeUndefined();

    vi.setSystemTime(new Date(initialTime.getTime() + 60_000));
    expect(withRuntimeNoticeStateLock(noticeId, () => 'claimed')).toBe('claimed');
    expect(fs.readdirSync(noticeDirectory).sort()).toEqual(
      abandonedLocks.map((lockPath) => path.basename(lockPath)).sort(),
    );
  });

  it('keeps a transition exclusive across an adjacent clock rollback', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-22T12:01:00.000Z'));
    const noticeId = 'node20-removal-2026-07-30';
    let rollbackResult: string | undefined;

    withRuntimeNoticeStateLock(noticeId, () => {
      vi.setSystemTime(new Date('2026-06-22T12:00:59.999Z'));
      rollbackResult = withRuntimeNoticeStateLock(noticeId, () => 'claimed');
    });

    expect(rollbackResult).toBeUndefined();
    expect(fs.readdirSync(path.join(configDirectory, 'notices'))).toEqual([]);
  });
});
