import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator/engine';
import {
  type InMemoryEvaluation,
  InMemoryEvaluationStore,
} from '../../src/evaluator/inMemoryStore';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { redteamProviderManager } from '../../src/redteam/providers/shared';
import { mockProcessEnv } from '../util/utils';

import type { EvaluatorRuntime } from '../../src/evaluator/runtime';
import type { TestSuite } from '../../src/types/index';

vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

function fixture() {
  const evaluation: InMemoryEvaluation = {
    id: 'runtime-tracing-evaluation',
    config: {},
    persisted: false,
    prompts: [],
    results: [],
    vars: [],
    resultPersistenceFailed: false,
    finalResults: [],
    failedResults: [],
  };
  const store = new InMemoryEvaluationStore(evaluation);
  const writer = {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const lifecycle = {
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const runtime: EvaluatorRuntime<InMemoryEvaluation> = {
    createEvaluationStore: () => store,
    createResultWriters: () => [writer],
    createTracingLifecycle: vi.fn(() => lifecycle),
  };
  const suite: TestSuite = { providers: [], prompts: [], tests: [] };
  return { evaluation, store, writer, lifecycle, runtime, suite };
}

function snapshotTracingHandlers() {
  return [
    process.listeners('SIGINT'),
    process.listeners('SIGTERM'),
    process.listeners('beforeExit'),
  ];
}

describe('evaluator tracing lifecycle port', () => {
  let restoreEnvironment: () => void;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      PROMPTFOO_TRACING_ENABLED: 'false',
      PROMPTFOO_MAX_EVAL_TIME_MS: undefined,
    });
    vi.spyOn(providerRegistry, 'shutdownAll').mockResolvedValue(undefined);
  });

  afterEach(() => {
    restoreEnvironment();
    vi.restoreAllMocks();
  });

  it('does not create a lifecycle or process handlers when tracing is absent', async () => {
    const { evaluation, runtime, suite, lifecycle } = fixture();
    const handlers = snapshotTracingHandlers();

    await expect(evaluate(suite, evaluation, { silent: true }, runtime)).resolves.toBe(evaluation);

    expect(runtime.createTracingLifecycle).not.toHaveBeenCalled();
    expect(lifecycle.start).not.toHaveBeenCalled();
    expect(lifecycle.close).not.toHaveBeenCalled();
    expect(snapshotTracingHandlers()).toEqual(handlers);
  });

  it.each([
    { tracing: { enabled: true } },
    { defaultTest: { metadata: { tracingEnabled: true } } },
    { tests: [{ metadata: { tracingEnabled: true } }] },
  ])('requires the adapter for tracing requested via %j', async (tracingRequest) => {
    const { evaluation, runtime, suite, writer } = fixture();
    delete runtime.createTracingLifecycle;
    Object.assign(suite, tracingRequest);

    await expect(evaluate(suite, evaluation, { silent: true }, runtime)).rejects.toThrow(
      'Tracing requires an EvaluatorRuntime.createTracingLifecycle adapter',
    );
    expect(writer.close).toHaveBeenCalledOnce();
  });

  it('requires the adapter when tracing is enabled by the environment', async () => {
    const restore = mockProcessEnv({ PROMPTFOO_TRACING_ENABLED: 'true' });
    const { evaluation, runtime, suite, writer } = fixture();
    delete runtime.createTracingLifecycle;
    try {
      await expect(evaluate(suite, evaluation, {}, runtime)).rejects.toThrow(
        'createTracingLifecycle',
      );
      expect(writer.close).toHaveBeenCalledOnce();
    } finally {
      restore();
    }
  });

  it('passes the resolved suite and evaluation ID to the caller adapter', async () => {
    const { evaluation, runtime, suite, lifecycle } = fixture();
    const resolved = { ...suite, tracing: { enabled: true } };
    runtime.resolveRuntimeTestSuite = () => resolved;

    await evaluate(suite, evaluation, { silent: true }, runtime);

    expect(runtime.createTracingLifecycle).toHaveBeenCalledWith(resolved, evaluation.id);
    expect(lifecycle.start).toHaveBeenCalledOnce();
    expect(lifecycle.close).toHaveBeenCalledOnce();
  });

  it.each([new Error('start failed'), undefined])(
    'preserves a partial-start rejection identity (%s) through all cleanup',
    async (primaryError) => {
      const { evaluation, runtime, suite, writer, lifecycle } = fixture();
      suite.tracing = { enabled: true };
      lifecycle.start.mockRejectedValue(primaryError);
      lifecycle.close.mockRejectedValue(new Error('tracing close failed'));
      writer.close.mockRejectedValue(new Error('writer close failed'));
      const clearScheduler = vi.spyOn(redteamProviderManager, 'setRateLimitRegistry');

      await expect(evaluate(suite, evaluation, { silent: true }, runtime)).rejects.toBe(
        primaryError,
      );

      expect(writer.close.mock.invocationCallOrder[0]).toBeLessThan(
        lifecycle.close.mock.invocationCallOrder[0],
      );
      expect(lifecycle.close.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(providerRegistry.shutdownAll).mock.invocationCallOrder[0],
      );
      expect(clearScheduler).toHaveBeenLastCalledWith(undefined);
      expect(cliState.maxConcurrency).toBeUndefined();
    },
  );

  it.each([new Error('evaluation failed'), undefined])(
    'preserves evaluation rejection identity (%s) when tracing cleanup fails',
    async (primaryError) => {
      const { evaluation, runtime, suite, store, lifecycle } = fixture();
      suite.tracing = { enabled: true };
      vi.spyOn(store, 'appendPrompts').mockRejectedValue(primaryError);
      lifecycle.close.mockRejectedValue(new Error('tracing cleanup failed'));

      await expect(evaluate(suite, evaluation, { silent: true }, runtime)).rejects.toBe(
        primaryError,
      );
      expect(providerRegistry.shutdownAll).toHaveBeenCalledOnce();
    },
  );

  it('surfaces tracing teardown failures after continuing provider and scheduler cleanup', async () => {
    const { evaluation, runtime, suite, lifecycle } = fixture();
    const closeError = new Error('tracing cleanup failed');
    suite.tracing = { enabled: true };
    lifecycle.close.mockRejectedValue(closeError);
    vi.mocked(providerRegistry.shutdownAll).mockRejectedValue(new Error('provider cleanup failed'));
    const clearScheduler = vi.spyOn(redteamProviderManager, 'setRateLimitRegistry');

    await expect(evaluate(suite, evaluation, { silent: true }, runtime)).rejects.toBe(closeError);

    expect(providerRegistry.shutdownAll).toHaveBeenCalledOnce();
    expect(clearScheduler).toHaveBeenLastCalledWith(undefined);
  });
});
