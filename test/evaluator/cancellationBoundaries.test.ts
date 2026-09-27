import './setup';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import * as comparisonMatchers from '../../src/matchers/comparison';
import { callProviderWithContext } from '../../src/matchers/providers';
import Eval from '../../src/models/eval';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import * as evaluatorTracing from '../../src/tracing/evaluatorTracing';
import * as targetTracer from '../../src/tracing/targetTracer';
import { ResultFailureReason } from '../../src/types/index';
import { createDeferred } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, ProviderResponse, TestSuite } from '../../src/types/index';

describeEvaluator('cancellation at target and comparison boundaries', () => {
  it.each(
    ['provider', 'queue', 'retry'].flatMap((phase) =>
      ['pause', 'deadline'].map((termination) => ({ phase, termination })),
    ),
  )(
    'settles before releasing an uncooperative $phase after $termination',
    async ({ phase, termination }) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const started = createDeferred<void>();
      const release = createDeferred<void>();
      const response = createDeferred<ProviderResponse>();
      const grade = vi.fn().mockReturnValue(true);
      const provider: ApiProvider = {
        id: () => 'offline-target-boundary',
        callApi: vi.fn(async () => {
          started.resolve();
          return phase === 'provider' ? response.promise : { output: 'first attempt' };
        }),
      };
      const registry =
        phase === 'provider'
          ? undefined
          : vi
              .spyOn(RateLimitRegistry.prototype, 'execute')
              .mockImplementation(async (_provider, invoke) => {
                if (phase === 'retry') {
                  await invoke();
                }
                started.resolve();
                await release.promise;
                return invoke();
              });
      const suite: TestSuite = {
        providers: [provider],
        prompts: [toPrompt('hello')],
        tests: [{ assert: [{ type: 'javascript', value: grade }] }],
      };
      const record = new Eval({});
      let settled = false;
      const evaluation = evaluate(suite, record, {
        abortSignal: controller.signal,
        timeoutMs: 0,
        maxEvalTimeMs: termination === 'deadline' ? 10 : 0,
      }).then(
        (value) => {
          settled = true;
          return { value };
        },
        (error) => {
          settled = true;
          return { error };
        },
      );
      let settledBeforeRelease = false;
      try {
        await vi.advanceTimersByTimeAsync(1);
        await started.promise;
        if (termination === 'pause') {
          controller.abort();
        } else {
          await vi.advanceTimersByTimeAsync(20);
        }
        await vi.advanceTimersByTimeAsync(0);
        settledBeforeRelease = settled;
      } finally {
        release.resolve();
        response.resolve({ output: 'late response' });
        await vi.advanceTimersByTimeAsync(0);
        await evaluation;
        registry?.mockRestore();
      }
      expect(settledBeforeRelease).toBe(true);
      expect(await evaluation).not.toHaveProperty('error');
      expect(provider.callApi).toHaveBeenCalledTimes(phase === 'queue' ? 0 : 1);
      expect(grade).not.toHaveBeenCalled();
      const results = await record.getResults();
      if (termination === 'pause') {
        expect(results).toEqual([]);
      } else {
        expect(results).toHaveLength(1);
        expect(results[0].error).toContain('Evaluation exceeded max duration of 10ms');
      }
    },
  );

  it.each(['trace setup', 'provider response'])(
    'bounds the traced invocation when cancelled during %s',
    async (phase) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const started = createDeferred<void>();
      const release = createDeferred<void>();
      let spanSettled = false;
      const traceContext = vi
        .spyOn(evaluatorTracing, 'generateTraceContextIfNeeded')
        .mockResolvedValue({
          traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        });
      const trace = vi
        .spyOn(targetTracer, 'withTracedProviderCall')
        .mockImplementation(async (options, invoke) => {
          try {
            if (phase === 'trace setup') {
              started.resolve();
              await release.promise;
            }
            return await invoke(options.callContext);
          } finally {
            spanSettled = true;
          }
        });
      const provider: ApiProvider = {
        id: () => 'offline-traced-target',
        callApi: vi.fn(async () => {
          started.resolve();
          await release.promise;
          return { output: 'late response' };
        }),
      };
      const record = new Eval({});
      let settled = false;
      const evaluation = evaluate({ providers: [provider], prompts: [toPrompt('hello')] }, record, {
        abortSignal: controller.signal,
        timeoutMs: 0,
        maxEvalTimeMs: 0,
      }).finally(() => {
        settled = true;
      });
      try {
        await vi.advanceTimersByTimeAsync(1);
        await started.promise;
        controller.abort();
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(true);
        if (phase === 'provider response') {
          expect(spanSettled).toBe(true);
        }
      } finally {
        release.resolve();
        await vi.advanceTimersByTimeAsync(0);
        await evaluation;
        trace.mockRestore();
        traceContext.mockRestore();
      }
      expect(provider.callApi).toHaveBeenCalledTimes(phase === 'trace setup' ? 0 : 1);
      expect(await record.getResults()).toEqual([]);
    },
  );

  it.each(['before comparison', 'during comparison'])(
    'preserves completed targets when the deadline expires %s',
    async (phase) => {
      vi.useFakeTimers();
      const started = createDeferred<void>();
      const response = createDeferred<ProviderResponse>();
      const grader: ApiProvider = {
        id: () => 'offline-comparison-boundary',
        callApi: vi.fn(async () => {
          started.resolve();
          return response.promise;
        }),
      };
      const provider: ApiProvider = {
        id: () => 'offline-target',
        callApi: async (prompt, _context, options) => {
          if (prompt.includes('slow')) {
            started.resolve();
            return new Promise((_resolve, reject) =>
              options?.abortSignal?.addEventListener(
                'abort',
                () => reject(new DOMException('Stopped', 'AbortError')),
                { once: true },
              ),
            );
          }
          return { output: 'completed' };
        },
      };
      const compare = vi
        .spyOn(comparisonMatchers, 'matchesSelectBest')
        .mockImplementation(async (_criteria, outputs, _grading, _vars, context) => {
          await callProviderWithContext(grader, 'synthetic comparison', 'select-best', {}, context);
          return outputs.map(() => ({ pass: true, score: 1, reason: 'late comparison' }));
        });
      const suite: TestSuite = {
        providers: [provider],
        prompts: [toPrompt('first {{kind}}'), toPrompt('second {{kind}}')],
        tests: (phase === 'before comparison' ? ['fast', 'slow'] : ['fast']).map((kind) => ({
          vars: { kind },
          assert: [{ type: 'select-best' as const, value: 'fixture' }],
        })),
      };
      const record = new Eval({});
      const evaluation = evaluate(suite, record, {
        timeoutMs: 0,
        maxEvalTimeMs: 10,
        maxConcurrency: 1,
      }).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      try {
        await vi.advanceTimersByTimeAsync(1);
        await started.promise;
        await vi.advanceTimersByTimeAsync(20);
        expect(await evaluation).not.toHaveProperty('error');
        const results = await record.getResults();
        const completed = results.filter((result) => result.response?.output === 'completed');
        expect(completed).toHaveLength(2);
        for (const result of completed) {
          expect(result.success).toBe(false);
          expect(result.score).toBe(0);
          expect(result.failureReason).toBe(ResultFailureReason.ERROR);
          expect(result.error).toMatch(/^Aborted: /);
          expect(result.gradingResult).toMatchObject({ pass: false, score: 0 });
        }
        expect(record.getStats()).toMatchObject({
          successes: 0,
          failures: 0,
          errors: phase === 'before comparison' ? 4 : 2,
        });
        expect(results.filter((result) => result.error?.includes('max duration'))).toHaveLength(
          phase === 'before comparison' ? 2 : 0,
        );
        expect(grader.callApi).toHaveBeenCalledTimes(phase === 'before comparison' ? 0 : 1);
        response.resolve({ output: '0' });
        await vi.advanceTimersByTimeAsync(0);
        expect((await record.getResults()).map((result) => result.gradingResult)).toEqual(
          results.map((result) => result.gradingResult),
        );
      } finally {
        response.resolve({ output: '0' });
        await evaluation;
        compare.mockRestore();
      }
    },
  );

  it('normalizes a custom abort reason before the next comparison', async () => {
    const controller = new AbortController();
    const compare = vi
      .spyOn(comparisonMatchers, 'matchesSelectBest')
      .mockImplementation(async () => {
        controller.abort(new Error('User paused evaluation'));
        return [
          { pass: true, score: 1, reason: 'completed' },
          { pass: false, score: 0, reason: 'completed' },
        ];
      });
    const provider: ApiProvider = { id: () => 'offline', callApi: async () => ({ output: 'ok' }) };
    const record = new Eval({});
    try {
      await evaluate(
        {
          providers: [provider],
          prompts: [toPrompt('first'), toPrompt('second')],
          tests: ['first', 'second'].map((kind) => ({
            vars: { kind },
            assert: [{ type: 'select-best' as const, value: 'fixture' }],
          })),
        },
        record,
        { abortSignal: controller.signal, timeoutMs: 0, maxEvalTimeMs: 0 },
      );
      expect(compare).toHaveBeenCalledTimes(1);
      const rows = await record.getResults();
      expect(rows.filter((row) => row.testIdx === 1)).toHaveLength(2);
      for (const row of rows.filter((row) => row.testIdx === 1)) {
        expect(row.failureReason).toBe(ResultFailureReason.ERROR);
        expect(row.error).toMatch(/^Aborted: /);
      }
      expect(record.getStats()).toMatchObject({ successes: 1, failures: 1, errors: 2 });
    } finally {
      compare.mockRestore();
    }
  });

  it.each([false, true])(
    'retains genuine comparison failures even if cancellation is %s',
    async (cancel) => {
      const controller = new AbortController();
      const compare = vi
        .spyOn(comparisonMatchers, 'matchesSelectBest')
        .mockImplementation(async () => {
          if (cancel) {
            controller.abort();
          }
          throw new SyntaxError('grading failure');
        });
      const provider: ApiProvider = {
        id: () => 'offline',
        callApi: async () => ({ output: 'ok' }),
      };
      try {
        await expect(
          evaluate(
            {
              providers: [provider],
              prompts: [toPrompt('first'), toPrompt('second')],
              tests: [{ assert: [{ type: 'select-best', value: 'fixture' }] }],
            },
            new Eval({}),
            { abortSignal: controller.signal, timeoutMs: 0, maxEvalTimeMs: 0 },
          ),
        ).rejects.toThrow('grading failure');
      } finally {
        compare.mockRestore();
      }
    },
  );
});
