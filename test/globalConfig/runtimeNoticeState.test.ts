import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readRuntimeNoticeLastShownAt,
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

  it('rejects notice ids that could escape the state directory', () => {
    expect(() => readRuntimeNoticeLastShownAt('../promptfoo.yaml')).toThrow(
      'Invalid runtime notice id',
    );
  });
});
