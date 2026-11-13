import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { mockProcessEnv } from '../util/utils';

const { pool } = vi.hoisted(() => ({
  pool: vi.fn(function (..._args: unknown[]) {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));
vi.mock('../../src/python/workerPool', () => ({ PythonWorkerPool: pool }));

describe('Python worker environment scopes', () => {
  let restore: () => void;
  const providers: PythonProvider[] = [];
  beforeEach(() => {
    pool.mockReset();
    restore = mockProcessEnv({ PROMPTFOO_PYTHON_WORKERS: undefined });
  });
  afterEach(async () => {
    await Promise.all(providers.splice(0).map((provider) => provider.shutdown()));
    restore();
    vi.restoreAllMocks();
  });

  it('resolves file and suite worker counts through the real provider during concurrent initialization', async () => {
    await cliState.withEnvFileOverrides({ PROMPTFOO_PYTHON_WORKERS: '3' }, async () => {
      await Promise.all(
        [undefined, '5'].map((workers) =>
          cliState.withEnv(workers ? { PROMPTFOO_PYTHON_WORKERS: workers } : {}, async () => {
            const provider = new PythonProvider(`fixture-${workers ?? 'file'}.py`);
            providers.push(provider);
            await provider.initialize();
          }),
        ),
      );
    });
    expect(pool.mock.calls.map((args) => args[2]).sort()).toEqual([3, 5]);
    const later = new PythonProvider('fixture-default.py');
    providers.push(later);
    await later.initialize();
    expect(pool).toHaveBeenLastCalledWith(expect.any(String), 'call_api', 1, undefined, undefined);
    expect(process.env.PROMPTFOO_PYTHON_WORKERS).toBeUndefined();
  });

  it.each([
    { value: '2', expected: 2 },
    { value: '0', expected: 1 },
    { value: '', expected: 7 },
    { value: 'invalid', expected: 7 },
  ])(
    'honors the retained provider worker override $value at initialization',
    async ({ value, expected }) => {
      const provider = new PythonProvider('fixture.py', {
        config: {},
        env: { PROMPTFOO_PYTHON_WORKERS: value },
      });
      providers.push(provider);
      await cliState.withMaxConcurrency(7, () =>
        cliState.withEnv({ PROMPTFOO_PYTHON_WORKERS: '5' }, () => provider.initialize()),
      );
      expect(pool).toHaveBeenLastCalledWith(
        expect.any(String),
        'call_api',
        expected,
        undefined,
        undefined,
      );
    },
  );

  it('keeps explicit worker configuration above provider environment overrides', async () => {
    const provider = new PythonProvider('fixture.py', {
      config: { workers: 4 },
      env: { PROMPTFOO_PYTHON_WORKERS: '2' },
    });
    providers.push(provider);
    await provider.initialize();
    expect(pool).toHaveBeenLastCalledWith(expect.any(String), 'call_api', 4, undefined, undefined);
  });

  it.each([
    { config: undefined, override: 'provider-python', expected: 'provider-python' },
    { config: undefined, override: '', expected: undefined },
    { config: 'config-python', override: 'provider-python', expected: 'config-python' },
  ])(
    'resolves the provider executable before active defaults: $override',
    async ({ config, override, expected }) => {
      const provider = new PythonProvider('fixture.py', {
        config: { pythonExecutable: config },
        env: { PROMPTFOO_PYTHON: override },
      });
      providers.push(provider);
      await cliState.withEnv({ PROMPTFOO_PYTHON: 'suite-python' }, () => provider.initialize());
      expect(pool).toHaveBeenLastCalledWith(expect.any(String), 'call_api', 1, expected, undefined);
    },
  );
});
