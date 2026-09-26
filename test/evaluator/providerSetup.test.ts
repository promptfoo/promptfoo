import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import {
  type InMemoryEvaluation,
  InMemoryEvaluationStore,
} from '../../src/evaluator/inMemoryStore';
import { createProviderSetupCheck } from '../../src/evaluator/providerSetup';
import Eval from '../../src/models/eval';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, CallApiContextParams, TestSuite } from '../../src/types/index';

describeEvaluator('provider batch preflight', () => {
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
    const record: InMemoryEvaluation = {
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
    try {
      await expect(
        evaluate(
          { providers: [provider], prompts: [toPrompt('Review')], tests: [{}, {}] },
          record,
          { silent: true, maxEvalTimeMs: 60_000, abortSignal: abort.signal },
          {
            createEvaluationStore: (evaluation) => new InMemoryEvaluationStore(evaluation),
            createResultWriters: () => [],
          },
        ),
      ).rejects.toThrow('Operation cancelled');
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

  it('checks distinct rendered configurations before starting any workload and preserves blocked attempts', async () => {
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
    expect(events).toEqual(['setup:bad', 'setup:good', 'workload']);
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
      'import:default.json',
      'import:row.json',
    ]);
    expect((await record.toEvaluateSummary()).stats.errors).toBe(0);
  });

  it('uses prompt overrides and rechecks changed configuration instead of caching only provider identity', async () => {
    const check = createProviderSetupCheck();
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
    expect(provider.checkSetup).toHaveBeenCalledTimes(3);
  });

  it('deduplicates concurrent checks without sharing mutable failure responses across rows or evaluations', async () => {
    const provider: ApiProvider = {
      id: () => 'local-scanner',
      checkSetupOnEval: true,
      callApi: vi.fn<ApiProvider['callApi']>(),
      checkSetup: vi.fn(async () => ({ success: false, message: 'Setup failed' })),
    };
    const context = { vars: {}, prompt: toPrompt('Review') };
    const check = createProviderSetupCheck();
    const [first, second] = await Promise.all([check(provider, context), check(provider, context)]);
    expect(provider.checkSetup).toHaveBeenCalledTimes(1);
    first!.error = 'mutated';
    expect(second?.error).toBe('Setup failed');
    await createProviderSetupCheck()(provider, context);
    expect(provider.checkSetup).toHaveBeenCalledTimes(2);
  });

  it('does not preflight providers that have not opted in', async () => {
    const provider: ApiProvider = {
      id: () => 'regular-provider',
      callApi: vi.fn<ApiProvider['callApi']>(),
      checkSetup: vi.fn(async () => ({ success: true, message: 'Ready' })),
    };
    await createProviderSetupCheck()(provider, { vars: {}, prompt: toPrompt('Review') });
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
