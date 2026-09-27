import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';

import { afterEach, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import telemetry from '../../src/telemetry';
import { createDeferred, mockProcessEnv } from '../util/utils';

const loaderGlobals = globalThis as typeof globalThis & {
  pythonTimeoutConfigLoader?: () => Promise<never>;
};

afterEach(() => {
  delete loaderGlobals.pythonTimeoutConfigLoader;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('finishes an evaluation timeout when a Python configuration loader never resolves', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'python-config-timeout-'));
  const restoreEnv = mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: 'false' });
  const pending = createDeferred<never>();
  const entered = createDeferred<void>();
  loaderGlobals.pythonTimeoutConfigLoader = () => {
    entered.resolve();
    return pending.promise;
  };
  const pendingConfig = path.join(directory, 'pending.mjs');
  await writeFile(pendingConfig, 'export default () => globalThis.pythonTimeoutConfigLoader();');
  vi.spyOn(telemetry, 'record').mockImplementation(() => {});
  const originalListeners = process.listeners('SIGTERM');
  const provider = new PythonProvider(
    path.resolve('test/smoke/fixtures/providers/echo_provider.py'),
    {
      config: { settings: `file://${pendingConfig}`, workers: 1 },
    },
  );
  const record = new Eval({});
  // Exercise the actual evaluator and file loader without counting a second
  // process's cold TypeScript imports against a cleanup watchdog on Windows.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let finished = false;
  const evaluation = evaluate(
    { providers: [provider], prompts: [{ raw: 'hello', label: 'hello' }], tests: [{}] },
    record,
    { timeoutMs: 100, maxConcurrency: 1, showProgressBar: false },
  ).then(() => {
    finished = true;
  });
  try {
    await entered.promise;
    await vi.advanceTimersByTimeAsync(100);
    await setImmediate();
    expect(finished).toBe(true);
    await evaluation;
    expect(record.results).toHaveLength(1);
    expect(record.results[0]).toMatchObject({ success: false, score: 0 });
    expect(record.results[0].error).toContain('timed out');
    expect(process.listeners('SIGTERM')).toEqual(originalListeners);
  } finally {
    // Also settle the historical broken implementation if this regression fails.
    // Rejecting the loader prevents a late Python worker from being started.
    pending.reject(new Error('test teardown'));
    await evaluation;
    await providerRegistry.shutdownAll();
    vi.useRealTimers();
    restoreEnv();
    await rm(directory, { recursive: true, force: true });
  }
});
