import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUpdateSpawnContext,
  parseUpdateCommandForSpawn,
} from '../../src/updates/updateCommandUtils';

describe('updateCommandUtils', () => {
  let originalPlatform: string;

  beforeEach(() => {
    originalPlatform = process.platform;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.unstubAllEnvs();
  });

  it('removes empty, relative, and project-local executable path entries on POSIX', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const context = getUpdateSpawnContext({
      PATH: '/safe/bin::relative:./bin:/project/node_modules/.bin:/usr/bin:',
      HOME: '/home/user',
    });

    expect(context.env).toEqual({
      PATH: '/safe/bin:/usr/bin',
      HOME: '/home/user',
    });
  });

  it('removes empty, relative, and project-local executable path entries on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const context = getUpdateSpawnContext({
      Path: 'C:\\safe;;relative;.\\bin;C:\\project\\node_modules\\.bin;C:\\Windows\\System32;',
      USERPROFILE: 'C:\\Users\\Alice',
    });

    expect(context.env).toEqual({
      Path: 'C:\\safe;C:\\Windows\\System32',
      USERPROFILE: 'C:\\Users\\Alice',
    });
  });

  it('runs Windows cmd shims through ComSpec without enabling shell parsing', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    expect(
      parseUpdateCommandForSpawn('npm.cmd install -g promptfoo@latest', {
        ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      }),
    ).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'install', '-g', 'promptfoo@latest'],
    });
  });
});
