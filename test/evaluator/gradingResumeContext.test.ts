import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import * as providers from '../../src/providers/index';
import { getProviderDelay } from '../../src/scheduler/providerCallExecutionContext';
import { REDACTED } from '../../src/util/sanitizer';
import { transform } from '../../src/util/transform';
import { createDeferred } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, ProviderResponse, TestSuite } from '../../src/types/index';

describeEvaluator('interrupted grading context', () => {
  it.each([
    'runtime inputs',
    'afterEach projections',
    'explicit credentials',
    'missing credentials',
    'removed scorer',
    'present scorer',
    'inline assertion',
    'saved provider descriptor',
  ])('preserves %s across persisted resume', async (mode) => {
    const originalTransform = vi.mocked(transform).getMockImplementation();
    if (mode === 'inline assertion') {
      const actual = await vi.importActual<typeof import('../../src/util/transform')>(
        '../../src/util/transform',
      );
      vi.mocked(transform).mockImplementation(actual.transform);
    }
    const controller = new AbortController();
    const started = createDeferred<void>();
    const pending = createDeferred<ProviderResponse>();
    let resuming = false;
    class Grader implements ApiProvider {
      id() {
        return 'offline-resume-context-grader';
      }
      callApi = vi.fn(async (_prompt: string) => {
        started.resolve();
        return resuming
          ? { output: '{"pass":true,"score":0.75,"reason":"graded"}' }
          : pending.promise;
      });
    }
    const grader = new Grader();
    const inlineAssertion = (output: string) => (output === 'transformed' ? 0.25 : 0);
    const inlineTransform = () => 'transformed';
    const expectedScore =
      mode === 'present scorer' ? 0.13 : mode === 'inline assertion' ? 0.5 : 0.75;
    const loadedConfigs: unknown[] = [];
    const usesDescriptor = mode === 'explicit credentials' || mode === 'missing credentials';
    const configuredGrader = usesDescriptor
      ? {
          id: 'offline:explicit',
          config: {
            ...(mode !== 'missing credentials' && { apiKey: 'fixture-grading-key' }),
            temperature: 0.1,
          },
        }
      : grader;
    const loader = usesDescriptor
      ? vi.spyOn(providers, 'loadApiProvider').mockImplementation(async (_id, context) => {
          loadedConfigs.push(context?.options?.config);
          return grader;
        })
      : undefined;
    const target: ApiProvider = {
      id: () => 'offline-resume-context-target',
      callApi: vi.fn(async () => ({ output: 'saved output' })),
    };
    const beforeEachCalls = vi.fn();
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach' && 'test' in context && context.test.description === 'graded') {
        beforeEachCalls();
        const { assertScoringFunction: _removedScorer, ...withoutScorer } = context.test;
        return {
          ...context,
          test: {
            ...(mode === 'removed scorer' ? withoutScorer : context.test),
            vars: { ...context.test.vars, hookVar: 'original hook value' },
            assert: [
              ...(mode === 'inline assertion'
                ? [
                    {
                      type: 'javascript' as const,
                      value: inlineAssertion,
                      transform: inlineTransform,
                    },
                  ]
                : []),
              {
                type: 'llm-rubric',
                value: 'hook rubric {{priorOutput}} {{hookVar}}',
                provider: usesDescriptor
                  ? {
                      id: 'offline:explicit',
                      config: { apiKey: 'fixture-grading-key', temperature: 0.7 },
                    }
                  : grader,
              },
            ],
          },
        };
      }
      if (hook === 'afterEach' && 'result' in context) {
        return {
          ...context,
          result: {
            ...context.result,
            namedScores: { hookScore: context.result.score },
            metadata: { ...context.result.metadata, hookSuccess: context.result.success },
            response: {
              ...context.result.response,
              metadata: { hookSuccess: context.result.success },
            },
          },
        };
      }
      return context;
    });
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('hello')],
      extensions: ['file://offline-context-hook.js'],
      tests: [
        {
          description: 'register',
          options: { storeOutputAs: 'priorOutput' },
          assert: [{ type: 'javascript', value: () => true }],
        },
        {
          description: 'graded',
          ...((mode === 'removed scorer' || mode === 'present scorer') && {
            assertScoringFunction: () => ({ pass: true, score: 0.13, reason: 'unexpected scorer' }),
          }),
          assert: [
            ...(mode === 'inline assertion'
              ? [
                  {
                    type: 'javascript' as const,
                    value: inlineAssertion,
                    transform: inlineTransform,
                  },
                ]
              : []),
            {
              type: 'llm-rubric',
              value: 'original configuration rubric',
              provider: configuredGrader,
            },
          ],
        },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    const evaluation = evaluate(suite, record, {
      maxConcurrency: 1,
      timeoutMs: 0,
      maxEvalTimeMs: 0,
      abortSignal: controller.signal,
    });
    try {
      await started.promise;
      controller.abort();
      await evaluation;
      pending.resolve({ output: 'late' });
      resuming = true;
      cliState.resume = true;
      const saved = await Eval.findById(record.id);
      if (mode === 'saved provider descriptor') {
        const interrupted = (await saved!.getResults()).find((r) => r.testIdx === 1)!;
        expect(interrupted).toBeInstanceOf(EvalResult);
        if (!(interrupted instanceof EvalResult)) {
          throw new Error('Expected a persisted result');
        }
        interrupted.testCase.assert = [
          { type: 'llm-rubric', value: 'saved rubric', provider: { config: { temperature: 0.7 } } },
        ];
        await interrupted.save();
      }
      await evaluate(suite, saved!, { maxConcurrency: 1, timeoutMs: 0, maxEvalTimeMs: 0 });
      const rows = await saved!.getResults();
      const retried = rows.find((r) => r.testIdx === 1)!;
      if (mode === 'missing credentials' || mode === 'saved provider descriptor') {
        expect(retried).toMatchObject({ success: false, score: 0 });
        expect(retried.error).toContain(
          mode === 'missing credentials'
            ? 'a redacted input is missing'
            : 'Invalid provider definition',
        );
        expect(target.callApi).toHaveBeenCalledTimes(2);
        expect(grader.callApi).toHaveBeenCalledTimes(1);
        expect(beforeEachCalls).toHaveBeenCalledTimes(1);
        expect(saved!.getStats()).toMatchObject({ successes: 1, failures: 0, errors: 1 });
        return;
      }
      if (mode === 'explicit credentials') {
        expect(loadedConfigs).toHaveLength(2);
        expect(loadedConfigs).toEqual([
          { apiKey: 'fixture-grading-key', temperature: 0.7 },
          { apiKey: 'fixture-grading-key', temperature: 0.7 },
        ]);
        expect(retried.testCase.assert?.[0]).toMatchObject({
          provider: { config: { apiKey: REDACTED, temperature: 0.7 } },
        });
      } else if (mode === 'runtime inputs') {
        expect(grader.callApi.mock.calls[1][0]).toContain(
          'hook rubric saved output original hook value',
        );
        expect(retried.testCase.vars).toMatchObject({
          priorOutput: 'saved output',
          hookVar: 'original hook value',
        });
      } else {
        expect(retried).toMatchObject({
          success: true,
          score: expectedScore,
          namedScores: { hookScore: expectedScore },
          metadata: { hookSuccess: true },
          response: { metadata: { hookSuccess: true } },
        });
        expect(saved!.prompts[0].metrics).toMatchObject({
          namedScores: { hookScore: 1 + expectedScore },
          namedScoresCount: { hookScore: 2 },
          namedScoreWeights: { hookScore: 2 },
        });
      }
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(grader.callApi).toHaveBeenCalledTimes(2);
      expect(beforeEachCalls).toHaveBeenCalledTimes(1);
      expect(saved!.getStats()).toMatchObject({ successes: 2, failures: 0, errors: 0 });
    } finally {
      pending.resolve({ output: 'late' });
      await evaluation;
      cliState.resume = false;
      loader?.mockRestore();
      if (originalTransform) {
        vi.mocked(transform).mockImplementation(originalTransform);
      }
    }
  });

  it.each([
    { label: 'evaluation', delay: 23, envDelay: '41', expected: 23 },
    { label: 'environment', delay: undefined, envDelay: '41', expected: 41 },
    { label: 'explicit zero', delay: 0, envDelay: '41', expected: 0 },
  ])('restores $label pacing during grading replay', async ({ delay, envDelay, expected }) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const started = createDeferred<void>();
    const pending = createDeferred<ProviderResponse>();
    const observed: (number | undefined)[] = [];
    const target: ApiProvider = {
      id: () => 'offline-resume-delay-target',
      callApi: vi.fn(async () => ({ output: 'hello' })),
    };
    const grader: ApiProvider = {
      id: () => 'offline-resume-delay-grader',
      callApi: vi.fn(async () => {
        observed.push(getProviderDelay(target));
        started.resolve();
        return observed.length === 1
          ? pending.promise
          : { output: '{"pass":true,"score":1,"reason":"graded"}' };
      }),
    };
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('hello')],
      tests: [{ assert: [{ type: 'llm-rubric', value: 'fixture', provider: grader }] }],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    const options = { maxConcurrency: 1, timeoutMs: 0, maxEvalTimeMs: 0, delay };
    const evaluation = cliState.withEnv({ PROMPTFOO_DELAY_MS: envDelay }, () =>
      evaluate(suite, record, { ...options, abortSignal: controller.signal }),
    );
    try {
      await vi.advanceTimersByTimeAsync(100);
      await started.promise;
      controller.abort();
      await evaluation;
      pending.resolve({ output: 'late' });
      cliState.resume = true;
      const saved = await Eval.findById(record.id);
      // The JSON persistence boundary omits both callable properties.
      expect((await saved!.getResults())[0].testCase.assert?.[0]).toMatchObject({ provider: {} });
      await cliState.withEnv({ PROMPTFOO_DELAY_MS: envDelay }, () =>
        evaluate(suite, saved!, options),
      );
      expect(observed).toEqual([expected, expected]);
      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(saved!.getStats()).toMatchObject({ successes: 1, errors: 0 });
    } finally {
      pending.resolve({ output: 'late' });
      await evaluation;
      cliState.resume = false;
    }
  });
});
