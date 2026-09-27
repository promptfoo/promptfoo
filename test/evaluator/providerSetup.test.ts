import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import {
  type InMemoryEvaluation,
  InMemoryEvaluationStore,
} from '../../src/evaluator/inMemoryStore';
import { checkProviderSetup } from '../../src/evaluator/providerSetup';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { sleep } from '../../src/util/time';
import { createDeferred, mockProcessEnv } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, CallApiContextParams, TestSuite } from '../../src/types/index';

function createInMemoryRecord(): InMemoryEvaluation {
  return {
    id: randomUUID(),
    config: {},
    persisted: false,
    prompts: [],
    results: [],
    vars: [],
    resultPersistenceFailed: false,
    finalResults: [],
    failedResults: [],
  };
}

const inMemoryRuntime = {
  createEvaluationStore: (record: InMemoryEvaluation) => new InMemoryEvaluationStore(record),
  createResultWriters: () => [],
};

describeEvaluator('provider batch preflight', () => {
  it('preserves a setup failure without spending the row deadline on provider delay', async () => {
    vi.useFakeTimers();
    const sleepMock = vi.mocked(sleep);
    sleepMock.mockImplementation((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      delay: 500,
      checkSetupOnEval: true,
      checkSetup: vi.fn(async () => ({
        success: false,
        message: 'Actionable setup failure',
        response: { error: 'Actionable setup failure', metadata: { diagnostic: 'setup' } },
      })),
      callApi: vi.fn<ApiProvider['callApi']>(),
    };
    const record = createInMemoryRecord();
    const pending = evaluate(
      { providers: [provider], prompts: [toPrompt('Review')], tests: [{}] },
      record,
      { silent: true, timeoutMs: 100 },
      inMemoryRuntime,
    );
    try {
      await vi.advanceTimersByTimeAsync(100);
      await pending;
      expect(record.results).toHaveLength(1);
      expect(record.results[0]).toMatchObject({
        error: 'Actionable setup failure',
        response: {
          error: 'Actionable setup failure',
          incurredCost: 0,
          tokenUsage: { numRequests: 0 },
          metadata: { diagnostic: 'setup', providerSetup: { workloadStarted: false } },
        },
      });
      expect(record.results[0].response?.cached).not.toBe(true);
      expect(provider.callApi).not.toHaveBeenCalled();
      expect(sleepMock).not.toHaveBeenCalled();
    } finally {
      await vi.advanceTimersByTimeAsync(500);
      await pending;
      sleepMock.mockReset();
    }
  });

  it('classifies scheduling using each merged prompt and test configuration', async () => {
    const classify = vi.fn(
      (context?: CallApiContextParams) => context?.prompt?.config?.report_file !== undefined,
    );
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      shouldSkipRateLimit: classify,
      callApi: vi.fn(async () => ({ output: 'Local result' })),
    };
    await evaluate(
      {
        providers: [provider],
        prompts: [{ ...toPrompt('Review'), config: { report_file: 'prompt.json' } }],
        tests: [{}, { options: { report_file: '{{report}}' }, vars: { report: 'test.json' } }],
      },
      createInMemoryRecord(),
      { silent: true, maxConcurrency: 1 },
      inMemoryRuntime,
    );
    expect(classify).toHaveBeenCalledTimes(2);
    expect(classify.mock.calls.map(([context]) => context?.prompt?.config?.report_file)).toEqual([
      'prompt.json',
      '{{report}}',
    ]);
    expect(classify.mock.calls[1][0]?.vars.report).toBe('test.json');
  });
  it('rechecks an eager failure after an earlier serial workload prepares the file without extensions', async () => {
    let fileReady = false;
    const events: string[] = [];
    const preparer: ApiProvider = {
      id: () => 'file-preparer',
      callApi: vi.fn(async () => {
        fileReady = true;
        events.push('prepare');
        return { output: 'file prepared', incurredCost: 0 };
      }),
    };
    const scanner: ApiProvider = {
      id: () => 'local-scanner',
      checkSetupOnEval: true,
      checkSetup: vi.fn(async () => {
        events.push(`setup:${fileReady}`);
        return { success: fileReady, message: 'File missing' };
      }),
      callApi: vi.fn(async () => {
        events.push('scan');
        return { output: 'prepared file' };
      }),
    };
    const suite: TestSuite = {
      providers: [scanner],
      prompts: [toPrompt('Review')],
      tests: [{ provider: preparer }, {}],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    expect(events).toEqual(['setup:false', 'prepare', 'setup:true', 'scan']);
    expect((await record.toEvaluateSummary()).stats.errors).toBe(0);
  });

  it.each([
    { cause: 'user cancellation', timeoutMs: 20_000 },
    { cause: 'evaluation deadline', timeoutMs: 20_000 },
    { cause: 'evaluation deadline', timeoutMs: undefined },
  ])(
    'finalizes eager setup on $cause with test timeout $timeoutMs',
    async ({ cause, timeoutMs }) => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const abort = new AbortController();
      const entered = createDeferred<void>();
      let setupSignal: AbortSignal | undefined;
      const provider: ApiProvider = {
        id: () => 'local-scanner',
        checkSetupOnEval: true,
        checkSetup: vi.fn((_context, options) => {
          setupSignal = options?.abortSignal;
          entered.resolve();
          return new Promise<never>(() => {});
        }),
        callApi: vi.fn<ApiProvider['callApi']>(),
      };
      const record = createInMemoryRecord();
      record.persisted = true;
      const store = new InMemoryEvaluationStore(record);
      const save = vi.spyOn(store, 'save');
      const writer = { write: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
      const pending = evaluate(
        {
          providers: [provider],
          prompts: [toPrompt('First review'), toPrompt('Second review')],
          tests: [{ vars: { topic: 'first' } }, { vars: { topic: 'second' } }],
        },
        record,
        { silent: true, abortSignal: abort.signal, maxEvalTimeMs: 1000, timeoutMs },
        { createEvaluationStore: () => store, createResultWriters: () => [writer] },
      );
      const settled = pending.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await entered.promise;
        if (cause === 'user cancellation') {
          abort.abort();
        } else {
          await vi.advanceTimersByTimeAsync(1000);
        }
        expect(await settled).toEqual({ value: record });
        expect(setupSignal?.aborted).toBe(true);
        expect(provider.checkSetup).toHaveBeenCalledOnce();
        expect(provider.callApi).not.toHaveBeenCalled();
        expect(writer.close).toHaveBeenCalledOnce();
        expect(record.vars).toEqual(['topic']);
        if (cause === 'evaluation deadline') {
          expect(record.results).toHaveLength(4);
          expect(new Set(record.results.map((row) => `${row.testIdx}:${row.promptIdx}`)).size).toBe(
            4,
          );
          for (const row of record.results) {
            expect(row).toMatchObject({
              success: false,
              error: 'Evaluation exceeded max duration of 1000ms',
            });
          }
          expect(save).toHaveBeenCalledOnce();
        } else {
          expect(record.results).toEqual([]);
          expect(save).not.toHaveBeenCalled();
        }
        for (const prompt of record.prompts) {
          expect(prompt.metrics).toMatchObject({
            testErrorCount: cause === 'evaluation deadline' ? 2 : 0,
            cost: 0,
            tokenUsage: { total: 0, numRequests: 0 },
          });
        }
        for (const duration of [1000, timeoutMs ?? 30_000]) {
          const index = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === duration);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(clearTimeoutSpy).toHaveBeenCalledWith(setTimeoutSpy.mock.results[index].value);
        }
      } finally {
        abort.abort();
        await pending.catch(() => {});
        setTimeoutSpy.mockRestore();
        clearTimeoutSpy.mockRestore();
      }
    },
  );

  it('preserves original setup ordering before serial and concurrent workloads are regrouped', async () => {
    const events: string[] = [];
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      config: { repository: '{{topic}}' },
      checkSetupOnEval: true,
      checkSetup: vi.fn(async (context) => {
        events.push(`setup:${context?.vars.topic}`);
        return { success: true, message: 'Ready' };
      }),
      callApi: vi.fn(async (_prompt, context) => {
        events.push(`workload:${context?.vars.topic}`);
        return { output: 'completed' };
      }),
    };
    await evaluate(
      {
        providers: [provider],
        prompts: [toPrompt('Review')],
        tests: [
          { vars: { topic: 'concurrent' } },
          { vars: { topic: 'serial' }, options: { runSerially: true } },
        ],
      },
      createInMemoryRecord(),
      { silent: true, maxConcurrency: 1 },
      inMemoryRuntime,
    );
    expect(events).toEqual([
      'setup:concurrent',
      'setup:serial',
      'setup:serial',
      'workload:serial',
      'setup:concurrent',
      'workload:concurrent',
    ]);
  });

  it('cleans the global deadline and writer when eager setup throws a non-abort error', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      checkSetupOnEval: true,
      checkSetup: vi.fn(async () => ({
        success: false,
        message: 'Invalid setup response',
        response: { metadata: { nonserializable: () => {} } },
      })),
      callApi: vi.fn<ApiProvider['callApi']>(),
    };
    const record = createInMemoryRecord();
    const writer = { write: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    try {
      await expect(
        evaluate(
          { providers: [provider], prompts: [toPrompt('Review')], tests: [{}] },
          record,
          { silent: true, maxEvalTimeMs: 60_000 },
          { ...inMemoryRuntime, createResultWriters: () => [writer] },
        ),
      ).rejects.toThrow(/clone/);
      const index = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === 60_000);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(setTimeoutSpy.mock.results[index].value);
      expect(provider.callApi).not.toHaveBeenCalled();
      expect(record.results).toEqual([]);
      expect(writer.close).toHaveBeenCalledOnce();
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });

  it('bounds eager setup by the configured test timeout and records no model request', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    let setupEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      setupEntered = resolve;
    });
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      checkSetupOnEval: true,
      checkSetup: vi.fn(() => {
        setupEntered();
        return new Promise<never>(() => {});
      }),
      callApi: vi.fn<ApiProvider['callApi']>(),
    };
    const record = createInMemoryRecord();
    const pending = evaluate(
      { providers: [provider], prompts: [toPrompt('Review')], tests: [{}] },
      record,
      { silent: true, timeoutMs: 1000, maxEvalTimeMs: 20_000 },
      inMemoryRuntime,
    );
    await entered;
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(record.results).toHaveLength(1);
    expect(record.results[0].response).toMatchObject({
      error: expect.stringContaining('1000ms'),
      tokenUsage: { numRequests: 0 },
      metadata: { providerSetup: { workloadStarted: false } },
    });
    expect(provider.checkSetup).toHaveBeenCalledTimes(1);
    expect(provider.callApi).not.toHaveBeenCalled();
    for (const duration of [1000, 20_000]) {
      const deadlineIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === duration);
      expect(deadlineIndex).toBeGreaterThanOrEqual(0);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(setTimeoutSpy.mock.results[deadlineIndex].value);
    }
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it.each([undefined, 0])(
    'bounds eager setup when the workload timeout is %s',
    async (timeoutMs) => {
      vi.useFakeTimers();
      const restoreEnv = mockProcessEnv({ CI: 'true' });
      // Other CI work may schedule a timer with the same duration as the setup deadline.
      const unrelatedCallback = vi.fn();
      const unrelatedTimer = setTimeout(unrelatedCallback, 30_000);
      const abort = new AbortController();
      let setupSignal: AbortSignal | undefined;
      let setupEntered!: () => void;
      const entered = new Promise<void>((resolve) => {
        setupEntered = resolve;
      });
      const provider: ApiProvider = {
        id: () => 'local-scanner',
        checkSetupOnEval: true,
        checkSetup: vi.fn((_context, options) => {
          setupSignal = options?.abortSignal;
          setupEntered();
          return new Promise<never>(() => {});
        }),
        callApi: vi.fn<ApiProvider['callApi']>(),
      };
      const record = createInMemoryRecord();
      const pending = evaluate(
        { providers: [provider], prompts: [toPrompt('Review')], tests: [{}] },
        record,
        { silent: true, timeoutMs, abortSignal: abort.signal },
        inMemoryRuntime,
      );
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {},
      );
      try {
        await entered;
        await vi.advanceTimersByTimeAsync(29_999);
        expect(settled).toBe(false);
        expect(setupSignal?.aborted).toBe(false);
        expect(unrelatedCallback).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toBe(true);
        expect(setupSignal?.aborted).toBe(true);
        expect(setupSignal?.reason).toEqual(
          expect.objectContaining({
            message: expect.stringContaining('30000ms'),
          }),
        );
        expect(unrelatedCallback).toHaveBeenCalledOnce();
        await pending;

        expect(record.results).toHaveLength(1);
        expect(record.results[0].response).toMatchObject({
          error: expect.stringContaining('30000ms'),
          incurredCost: 0,
          tokenUsage: { numRequests: 0 },
          metadata: { providerSetup: { workloadStarted: false, timedOut: true } },
        });
        expect(provider.checkSetup).toHaveBeenCalledOnce();
        expect(provider.callApi).not.toHaveBeenCalled();
      } finally {
        abort.abort();
        await pending.catch(() => {});
        clearTimeout(unrelatedTimer);
        restoreEnv();
      }
    },
  );

  it.each([
    { source: 'configured', outcome: 'successful' },
    { source: 'environment', outcome: 'successful' },
    { source: 'configured', outcome: 'hanging' },
  ])(
    'respects the $source row deadline for $outcome setup after a lifecycle hook',
    async ({ source, outcome }) => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const restoreEnv = mockProcessEnv({
        PROMPTFOO_EVAL_TIMEOUT_MS: source === 'environment' ? '60000' : undefined,
        PROMPTFOO_MAX_EVAL_TIME_MS: undefined,
      });
      const abort = new AbortController();
      const hookEntered = createDeferred<void>();
      const finishHook = createDeferred<void>();
      const setupEntered = createDeferred<void>();
      const finishSetup = createDeferred<{ success: boolean; message: string }>();
      let setupSignal: AbortSignal | undefined;
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
        if (hook === 'beforeEach') {
          hookEntered.resolve();
          await finishHook.promise;
        }
        return context;
      });
      const provider: ApiProvider = {
        id: () => 'local-scanner',
        checkSetupOnEval: true,
        checkSetup: vi.fn((_context, options) => {
          setupSignal = options?.abortSignal;
          setupEntered.resolve();
          return finishSetup.promise;
        }),
        callApi: vi.fn(async () => ({ output: 'workload completed' })),
      };
      const record = createInMemoryRecord();
      const pending = evaluate(
        {
          providers: [provider],
          prompts: [toPrompt('Review')],
          tests: [{}],
          extensions: ['file://prepare-finding.mjs'],
        },
        record,
        {
          silent: true,
          timeoutMs: source === 'configured' ? 60_000 : undefined,
          abortSignal: abort.signal,
        },
        inMemoryRuntime,
      );
      try {
        await hookEntered.promise;
        expect(provider.checkSetup).not.toHaveBeenCalled();
        // The hook spends part of the row budget before setup gets its own timer.
        await vi.advanceTimersByTimeAsync(10_000);
        finishHook.resolve();
        await setupEntered.promise;
        await vi.advanceTimersByTimeAsync(30_000);
        expect(setupSignal?.aborted).toBe(false);
        expect(record.results).toHaveLength(0);
        expect(provider.callApi).not.toHaveBeenCalled();

        if (outcome === 'successful') {
          // Setup lasts 45 seconds; the entire row remains within its 60-second budget.
          await vi.advanceTimersByTimeAsync(15_000);
          finishSetup.resolve({ success: true, message: 'Ready' });
          await pending;
          expect(record.results).toHaveLength(1);
          expect(record.results[0]).toMatchObject({
            success: true,
            response: { output: 'workload completed' },
          });
          expect(provider.callApi).toHaveBeenCalledOnce();
          expect(setupSignal?.aborted).toBe(false);
        } else {
          await vi.advanceTimersByTimeAsync(19_999);
          expect(setupSignal?.aborted).toBe(false);
          expect(record.results).toHaveLength(0);
          await vi.advanceTimersByTimeAsync(1);
          await pending;
          expect(record.results).toHaveLength(1);
          expect(record.results[0]).toMatchObject({
            success: false,
            error: expect.stringContaining('Evaluation timed out after 60000ms'),
          });
          expect(setupSignal?.aborted).toBe(true);
          expect(provider.callApi).not.toHaveBeenCalled();
        }
        expect(provider.checkSetup).toHaveBeenCalledOnce();
        // Verify both deadlines, independently of queued cancellation-log microtasks.
        const deadlines = setTimeoutSpy.mock.calls.flatMap(([, delay], index) =>
          delay === 60_000 ? [setTimeoutSpy.mock.results[index].value] : [],
        );
        expect(deadlines).toHaveLength(2);
        for (const deadline of deadlines) {
          expect(clearTimeoutSpy).toHaveBeenCalledWith(deadline);
        }
      } finally {
        abort.abort();
        finishHook.resolve();
        finishSetup.resolve({ success: true, message: 'Ready' });
        await pending.catch(() => {});
        restoreEnv();
        setTimeoutSpy.mockRestore();
        clearTimeoutSpy.mockRestore();
      }
    },
  );

  it('checks filesystem preparation after each lifecycle hook without reusing stale failures or successes', async () => {
    const events: string[] = [];
    let ready = false;
    let row = 0;
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach') {
        ready = ++row !== 2;
        events.push(`prepare:${ready}`);
      }
      return context;
    });
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      config: { finding_file: '/prepared/by/hook.json' },
      checkSetupOnEval: true,
      checkSetup: vi.fn(async () => {
        events.push(`setup:${ready}`);
        return { success: ready, message: 'Finding file missing' };
      }),
      callApi: vi.fn(async () => {
        events.push('workload');
        return { output: 'prepared finding' };
      }),
    };
    const suite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Review')],
      tests: [{}, {}, {}],
      extensions: ['file://prepare-finding.mjs'],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    expect(events).toEqual([
      'prepare:true',
      'setup:true',
      'workload',
      'prepare:false',
      'setup:false',
      'prepare:true',
      'setup:true',
      'workload',
    ]);
    const summary = await record.toEvaluateSummary();
    expect(summary.stats.errors).toBe(1);
    expect(summary.stats.tokenUsage.numRequests).toBe(2);
    expect(summary.results[1].response).toMatchObject({
      metadata: { providerSetup: { workloadStarted: false } },
    });
  });

  it('clears the evaluation deadline when canceled during preflight without starting a workload', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const abort = new AbortController();
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      checkSetupOnEval: true,
      checkSetup: vi.fn(async () => {
        abort.abort();
        return { success: true, message: 'Ready' };
      }),
      callApi: vi.fn<ApiProvider['callApi']>(),
    };
    const record = createInMemoryRecord();
    try {
      await expect(
        evaluate(
          { providers: [provider], prompts: [toPrompt('Review')], tests: [{}, {}] },
          record,
          { silent: true, maxEvalTimeMs: 60_000, abortSignal: abort.signal },
          inMemoryRuntime,
        ),
      ).resolves.toBe(record);
      expect(record.results).toEqual([]);
      const deadlineIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === 60_000);
      expect(deadlineIndex).toBeGreaterThanOrEqual(0);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(setTimeoutSpy.mock.results[deadlineIndex].value);
      expect(provider.callApi).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('checks rendered configurations before workloads and rechecks failed attempts at execution', async () => {
    const events: string[] = [];
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      config: { repository: '{{repo}}' },
      checkSetupOnEval: true,
      checkSetup: vi.fn(async (context) => {
        const repo = String(context?.vars.repo);
        events.push(`setup:${repo}`);
        return { success: repo === 'good', message: 'Directory not trusted' };
      }),
      callApi: vi.fn(async () => {
        events.push('workload');
        return { output: 'real workload boundary', cached: false };
      }),
    };
    const suite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Review source')],
      tests: [{ vars: { repo: 'bad' } }, { vars: { repo: 'good' } }, { vars: { repo: 'bad' } }],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    const summary = await record.toEvaluateSummary();
    expect(events).toEqual([
      'setup:bad',
      'setup:good',
      'setup:bad',
      'setup:bad',
      'setup:good',
      'workload',
      'setup:bad',
    ]);
    expect(summary.results).toHaveLength(3);
    expect(summary.stats.errors).toBe(2);
    expect(summary.stats.tokenUsage.numRequests).toBe(1);
    const blocked = summary.results.filter((result) => result.response?.error);
    expect(blocked).toHaveLength(2);
    for (const result of blocked) {
      expect(result.response).toMatchObject({
        error: 'Directory not trusted',
        incurredCost: 0,
        metadata: { providerSetup: { workloadStarted: false } },
      });
    }
  });

  it('uses per-test provider overrides during the batch pass, including import-only rows', async () => {
    const events: string[] = [];
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      config: { repository: '/missing-native-target' },
      checkSetupOnEval: true,
      checkSetup: vi.fn(async (context) => {
        const report = context?.prompt?.config?.report_file;
        events.push(`setup:${report}`);
        return { success: Boolean(report), message: 'Native target missing' };
      }),
      callApi: vi.fn(async (_prompt, context) => {
        events.push(`import:${context?.prompt?.config?.report_file}`);
        return { output: 'saved report' };
      }),
    };
    const suite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Review')],
      defaultTest: { options: { report_file: 'default.json' } },
      tests: [{}, { options: { report_file: 'row.json' } }],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    expect(events).toEqual([
      'setup:default.json',
      'setup:row.json',
      'setup:default.json',
      'import:default.json',
      'setup:row.json',
      'import:row.json',
    ]);
    expect((await record.toEvaluateSummary()).stats.errors).toBe(0);
  });

  it('uses prompt overrides and rechecks changed configuration instead of caching only provider identity', async () => {
    const check = checkProviderSetup;
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      config: { repository: '{{repo}}' },
      checkSetupOnEval: true,
      callApi: vi.fn<ApiProvider['callApi']>(),
      checkSetup: vi.fn(async () => ({ success: true, message: 'Ready' })),
    };
    const context: CallApiContextParams = { vars: { repo: 'one' }, prompt: toPrompt('Review') };
    await check(provider, context);
    await check(provider, { ...context, vars: { repo: 'one', irrelevant: 'changed' } });
    await check(provider, { ...context, vars: { repo: 'two' } });
    await check(provider, {
      ...context,
      prompt: { ...context.prompt!, config: { repository: 'three' } },
    });
    expect(provider.checkSetup).toHaveBeenCalledTimes(4);
  });

  it('isolates mutable failure responses across independent concurrent checks', async () => {
    const sharedResponse = { error: 'Setup failed', metadata: { evidence: { phase: 'setup' } } };
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      checkSetupOnEval: true,
      callApi: vi.fn<ApiProvider['callApi']>(),
      checkSetup: vi.fn(async () => ({
        success: false,
        message: 'Setup failed',
        response: sharedResponse,
      })),
    };
    const context = { vars: {}, prompt: toPrompt('Review') };
    const check = checkProviderSetup;
    const [first, second] = await Promise.all([check(provider, context), check(provider, context)]);
    expect(provider.checkSetup).toHaveBeenCalledTimes(2);
    first!.error = 'mutated';
    first!.metadata!.evidence.phase = 'mutated';
    expect(second?.error).toBe('Setup failed');
    expect(second?.metadata?.evidence.phase).toBe('setup');
    expect(sharedResponse.metadata.evidence.phase).toBe('setup');
    await checkProviderSetup(provider, context);
    expect(provider.checkSetup).toHaveBeenCalledTimes(3);
  });

  it('does not preflight providers that have not opted in', async () => {
    const provider: ApiProvider = {
      id: () => 'regular-provider',
      callApi: vi.fn<ApiProvider['callApi']>(),
      checkSetup: vi.fn(async () => ({ success: true, message: 'Ready' })),
    };
    await checkProviderSetup(provider, { vars: {}, prompt: toPrompt('Review') });
    expect(provider.checkSetup).not.toHaveBeenCalled();
  });

  it('forwards live updates and removes the active entry when the provider fails', async () => {
    const callback = vi.fn();
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      supportsProgress: true,
      callApi: vi.fn(async (_prompt, _context, options) => {
        options?.onProgress?.({ phase: 'discovery', elapsedMs: 1200, estimatedCostUsd: 0.05 });
        return { error: 'Publication failed' };
      }),
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Review')], tests: [{}] };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { providerProgressCallback: callback });
    const expected = {
      provider: 'local-scanner',
      testIdx: 0,
      promptIdx: 0,
      phase: 'discovery',
      elapsedMs: 1200,
      estimatedCostUsd: 0.05,
    };
    expect(callback.mock.calls).toEqual([
      [expected, false],
      [expected, true],
    ]);
    expect((await record.toEvaluateSummary()).stats.errors).toBe(1);
  });
});
