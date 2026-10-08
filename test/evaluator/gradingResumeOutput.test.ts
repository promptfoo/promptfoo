import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { asEvaluateResult, sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
import telemetry from '../../src/telemetry';
import { transform } from '../../src/util/transform';
import { createDeferred } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, ProviderResponse, TestSuite } from '../../src/types/index';

describeEvaluator('interrupted grading output boundaries', () => {
  it.each([
    { concurrency: 1, timeoutMs: 0 },
    { concurrency: 2, timeoutMs: 0 },
    { concurrency: 1, timeoutMs: 10 },
    { concurrency: 2, timeoutMs: 10 },
  ])(
    'keeps removed output absent at concurrency=$concurrency timeout=$timeoutMs',
    async (options) => {
      vi.useFakeTimers();
      const originalTransform = vi.mocked(transform).getMockImplementation();
      const actual = await vi.importActual<typeof import('../../src/util/transform')>(
        '../../src/util/transform',
      );
      vi.mocked(transform).mockImplementation(actual.transform);
      const controller = new AbortController();
      const started = createDeferred<void>();
      const pending = createDeferred<ProviderResponse>();
      const grader: ApiProvider = {
        id: () => 'output-boundary-grader',
        callApi: vi.fn(async () => {
          started.resolve();
          return pending.promise;
        }),
      };
      const target: ApiProvider = {
        id: () => 'output-boundary-target',
        callApi: vi.fn(async () => ({
          output: JSON.stringify({ value: 'public', private: 'removed-fixture-marker' }),
        })),
      };
      const suite: TestSuite = {
        providers: [target],
        prompts: [toPrompt('hello')],
        tests: [
          {
            options: { transform: 'JSON.parse(output).value' },
            assert: [{ type: 'llm-rubric', value: 'inspect', provider: grader }],
          },
        ],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      const initial = evaluate(suite, record, {
        maxConcurrency: options.concurrency,
        timeoutMs: options.timeoutMs,
        maxEvalTimeMs: 0,
        abortSignal: controller.signal,
      });
      try {
        await vi.advanceTimersByTimeAsync(1);
        await started.promise;
        if (!options.timeoutMs) {
          controller.abort();
        }
        await vi.advanceTimersByTimeAsync(20);
        await initial;
        const [row] = await record.getResults();
        expect(row.response?.output).toBe('public');
        for (const projection of [
          row,
          asEvaluateResult(row),
          sanitizeResultForJsonlArtifact(asEvaluateResult(row)),
        ]) {
          expect(JSON.stringify(projection)).not.toContain('removed-fixture-marker');
          expect(projection.response).not.toHaveProperty('providerTransformedOutput');
        }
        pending.resolve({ output: '{"pass":true,"score":1,"reason":"late"}' });
        await vi.advanceTimersByTimeAsync(0);
        cliState.resume = true;
        const saved = (await Eval.findById(record.id))!;
        await evaluate(suite, saved, { maxConcurrency: 1, timeoutMs: 0, maxEvalTimeMs: 0 });
        const [resumed] = await saved.getResults();
        expect(resumed.id).toBe(row.id);
        expect(resumed.error).toContain(
          'Cannot resume assertion grading: a transform changed the output',
        );
        expect(resumed.success).toBe(false);
        expect(JSON.stringify(resumed)).not.toContain('removed-fixture-marker');
        expect(target.callApi).toHaveBeenCalledOnce();
        expect(grader.callApi).toHaveBeenCalledOnce();
        expect(saved.getStats()).toMatchObject({ successes: 0, failures: 0, errors: 1 });
      } finally {
        controller.abort();
        pending.resolve({ output: 'late' });
        await initial;
        cliState.resume = false;
        if (originalTransform) {
          vi.mocked(transform).mockImplementation(originalTransform);
        }
      }
    },
  );

  it('counts resumed rows changed by comparison grading in current-run statistics', async () => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    const pending = createDeferred<ProviderResponse>();
    let resuming = false;
    const grader: ApiProvider = {
      id: () => 'comparison-resume-rubric',
      callApi: vi.fn(async () => {
        started.resolve();
        return resuming ? { output: '{"pass":true,"score":1,"reason":"graded"}' } : pending.promise;
      }),
    };
    const comparison: ApiProvider = {
      id: () => 'comparison-resume-judge',
      callApi: vi.fn(async () => ({ output: '1' })),
    };
    const target: ApiProvider = {
      id: () => 'comparison-resume-target',
      callApi: vi.fn(async (prompt) => ({ output: prompt })),
    };
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('first'), toPrompt('second')],
      tests: [
        {
          assert: [
            { type: 'llm-rubric', value: 'inspect', provider: grader },
            { type: 'select-best', value: 'choose second', provider: comparison },
          ],
        },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    const initial = evaluate(suite, record, {
      maxConcurrency: 1,
      timeoutMs: 0,
      abortSignal: controller.signal,
    });
    const recordEvent = vi.spyOn(telemetry, 'record');
    try {
      await started.promise;
      controller.abort();
      await initial;
      pending.resolve({ output: 'late' });
      resuming = true;
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1, timeoutMs: 0 });
      expect(record.getStats()).toMatchObject({ successes: 1, failures: 1, errors: 0 });
      expect(
        recordEvent.mock.calls.filter(([event]) => event === 'eval_ran').at(-1)?.[1],
      ).toMatchObject({ numPasses: 1, numFails: 1, numErrors: 0 });
      expect(target.callApi).toHaveBeenCalledTimes(2);
    } finally {
      controller.abort();
      pending.resolve({ output: 'late' });
      await initial;
      cliState.resume = false;
      recordEvent.mockRestore();
    }
  });
});
