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

  it('reclaims a stale notice lock left by a terminated process', () => {
    const noticeId = 'node20-removal-2026-07-30';
    const noticeDirectory = path.join(configDirectory, 'notices');
    const lockPath = path.join(noticeDirectory, `${noticeId}.last-shown.lock`);
    fs.mkdirSync(noticeDirectory, { recursive: true });
    fs.writeFileSync(lockPath, '123\n');
    const staleTime = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    expect(withRuntimeNoticeStateLock(noticeId, () => 'claimed')).toBe('claimed');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('reclaims an implausibly future-dated lock after a clock rollback', () => {
    const noticeId = 'node20-removal-2026-07-30';
    const noticeDirectory = path.join(configDirectory, 'notices');
    const lockPath = path.join(noticeDirectory, `${noticeId}.last-shown.lock`);
    fs.mkdirSync(noticeDirectory, { recursive: true });
    fs.writeFileSync(lockPath, '123\n');
    const futureTime = new Date(Date.now() + 60_000);
    fs.utimesSync(lockPath, futureTime, futureTime);

    expect(withRuntimeNoticeStateLock(noticeId, () => 'claimed')).toBe('claimed');
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
