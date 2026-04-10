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
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  restoreTestEnv();
  Reflect.deleteProperty(globalThis, testGlobalName);
  vi.clearAllMocks();
});

describe('mockProcessEnv', () => {
  it('applies overrides and restores the previous environment snapshot', () => {
    process.env.PROMPTFOO_TEST_UTIL_ORIGINAL = 'original';

    const restoreEnv = mockProcessEnv({
      PROMPTFOO_TEST_UTIL_ORIGINAL: 'override',
      PROMPTFOO_TEST_UTIL_OVERRIDE: 'set',
    });

    process.env.PROMPTFOO_TEST_UTIL_CREATED = 'created-by-test';

    expect(process.env.PROMPTFOO_TEST_UTIL_ORIGINAL).toBe('override');
    expect(process.env.PROMPTFOO_TEST_UTIL_OVERRIDE).toBe('set');

    restoreEnv();

    expect(process.env.PROMPTFOO_TEST_UTIL_ORIGINAL).toBe('original');
    expect(process.env.PROMPTFOO_TEST_UTIL_OVERRIDE).toBeUndefined();
    expect(process.env.PROMPTFOO_TEST_UTIL_CREATED).toBeUndefined();
  });

  it('can start from an empty environment without replacing the process.env object', () => {
    process.env.PROMPTFOO_TEST_UTIL_ORIGINAL = 'original';
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
