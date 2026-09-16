import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockGlobal, mockProcessEnv } from './utils';

const envKeys = [
  'PROMPTFOO_TEST_UTIL_ORIGINAL',
  'PROMPTFOO_TEST_UTIL_OVERRIDE',
  'PROMPTFOO_TEST_UTIL_CREATED',
];

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const testGlobalName = '__PROMPTFOO_TEST_UTIL_GLOBAL__';

function restoreTestEnv(): void {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      mockProcessEnv({ [key]: undefined });
    } else {
      mockProcessEnv({ [key]: value });
    }
  }
}

afterEach(() => {
  restoreTestEnv();
  Reflect.deleteProperty(globalThis, testGlobalName);
  vi.doUnmock('node:fs');
  vi.resetModules();
  vi.clearAllMocks();
});

describe('mockProcessEnv', () => {
  it('applies overrides and restores the previous environment snapshot', () => {
    mockProcessEnv({ PROMPTFOO_TEST_UTIL_ORIGINAL: 'original' });

    const restoreEnv = mockProcessEnv({
      PROMPTFOO_TEST_UTIL_ORIGINAL: 'override',
      PROMPTFOO_TEST_UTIL_OVERRIDE: 'set',
    });

    mockProcessEnv({ PROMPTFOO_TEST_UTIL_CREATED: 'created-by-test' });

    expect(process.env.PROMPTFOO_TEST_UTIL_ORIGINAL).toBe('override');
    expect(process.env.PROMPTFOO_TEST_UTIL_OVERRIDE).toBe('set');

    restoreEnv();

    expect(process.env.PROMPTFOO_TEST_UTIL_ORIGINAL).toBe('original');
    expect(process.env.PROMPTFOO_TEST_UTIL_OVERRIDE).toBeUndefined();
    expect(process.env.PROMPTFOO_TEST_UTIL_CREATED).toBeUndefined();
  });

  it('can start from an empty environment without replacing the process.env object', () => {
    mockProcessEnv({ PROMPTFOO_TEST_UTIL_ORIGINAL: 'original' });
    const envReference = process.env;

    const restoreEnv = mockProcessEnv(
      {
        PROMPTFOO_TEST_UTIL_OVERRIDE: 'only-value',
      },
      { clear: true },
    );

    expect(process.env).toBe(envReference);
    expect(process.env.PROMPTFOO_TEST_UTIL_ORIGINAL).toBeUndefined();
    expect(process.env.PROMPTFOO_TEST_UTIL_OVERRIDE).toBe('only-value');

    restoreEnv();

    expect(process.env).toBe(envReference);
    expect(process.env.PROMPTFOO_TEST_UTIL_ORIGINAL).toBe('original');
    expect(process.env.PROMPTFOO_TEST_UTIL_OVERRIDE).toBeUndefined();
  });
});

describe('mockGlobal', () => {
  it('restores globals that did not previously exist', () => {
    const restoreGlobal = mockGlobal(testGlobalName, { value: 'mocked' });

    expect((globalThis as Record<string, unknown>)[testGlobalName]).toEqual({ value: 'mocked' });

    restoreGlobal();

    expect(testGlobalName in globalThis).toBe(false);
  });

  it('restores the previous global descriptor', () => {
    Object.defineProperty(globalThis, testGlobalName, {
      configurable: true,
      get: () => 'original',
    });

    const restoreGlobal = mockGlobal(testGlobalName, 'mocked');

    expect((globalThis as Record<string, unknown>)[testGlobalName]).toBe('mocked');

    restoreGlobal();

    expect((globalThis as Record<string, unknown>)[testGlobalName]).toBe('original');
  });
});

describe('removeTempDir', () => {
  it('retries transient recursive cleanup failures', async () => {
    // Reset the module registry first so the dynamic import below re-evaluates
    // ./utils against the mocked node:fs, even when this test runs in isolation
    // (the top-level static import has already cached ./utils with the real fs).
    vi.resetModules();
    const rmSync = vi.fn();
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return { ...actual, rmSync };
    });
    const { removeTempDir } = await import('./utils');

    removeTempDir('/tmp/promptfoo-test-dir');

    expect(rmSync).toHaveBeenCalledWith('/tmp/promptfoo-test-dir', {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  });

  it('does not attempt cleanup without a directory', async () => {
    vi.resetModules();
    const rmSync = vi.fn();
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return { ...actual, rmSync };
    });
    const { removeTempDir } = await import('./utils');

    removeTempDir(undefined);

    expect(rmSync).not.toHaveBeenCalled();
  });
});
