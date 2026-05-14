import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from './util/utils';

vi.mock('../src/main.js', () => ({}));

const originalArgv = process.argv;
const expectedMainPath = fileURLToPath(new URL('../src/main.ts', import.meta.url));

describe('localEntrypoint', () => {
  let restoreEnv: (() => void) | undefined;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.argv = originalArgv;
    restoreEnv?.();
    restoreEnv = undefined;
    vi.resetModules();
  });

  it('mutes logs before booting main for structured code-scan output', async () => {
    restoreEnv = mockProcessEnv({ LOG_LEVEL: 'debug' });
    process.argv = [
      'node',
      '/tmp/localEntrypoint.ts',
      'code-scans',
      'run',
      '.',
      '--json',
      '--verbose',
    ];

    await import('../src/localEntrypoint');

    expect(process.env.LOG_LEVEL).toBe('error');
    expect(process.argv[1]).toBe(expectedMainPath);
  });

  it('preserves the caller log level for non-structured commands', async () => {
    restoreEnv = mockProcessEnv({ LOG_LEVEL: 'debug' });
    process.argv = ['node', '/tmp/localEntrypoint.ts', 'eval', '--verbose'];

    await import('../src/localEntrypoint');

    expect(process.env.LOG_LEVEL).toBe('debug');
    expect(process.argv[1]).toBe(expectedMainPath);
  });
});
