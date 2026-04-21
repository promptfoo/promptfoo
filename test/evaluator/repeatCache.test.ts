import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { clearCache, getCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { evaluate, runEval } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import {
  type ApiProvider,
  type Prompt,
  type ProviderResponse,
  ResultFailureReason,
  type TestSuite,
} from '../../src/types/index';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator repeat cache isolation', () => {
  it('preserves provider cache settings for repeat iterations', async () => {
    const contexts: Array<Record<string, any> | undefined> = [];
    const provider: ApiProvider = {
      id: () => 'mock-provider',
      callApi: vi
        .fn()
        .mockImplementation(async (_prompt: string, context?: Record<string, any>) => {
          contexts.push(context);
          return {
            output: 'result',
            tokenUsage: createEmptyTokenUsage(),
          };
        }),
    };

    const baseOptions = {
      provider,
      prompt: { raw: 'Test prompt', label: 'test-label' } as Prompt,
      delay: 0,
      nunjucksFilters: undefined,
      evaluateOptions: {},
      testIdx: 0,
      promptIdx: 0,
      conversations: {},
      registers: {},
      isRedteam: false,
    };

    await runEval({
      ...baseOptions,
      test: { assert: [] },
      repeatIndex: 0,
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toBeDefined();
    expect(contexts[0]!.bustCache).toBeFalsy();

    contexts.length = 0;

    await runEval({
      ...baseOptions,
      test: { assert: [] },
      repeatIndex: 1,
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toBeDefined();
    expect(contexts[0]!.bustCache).toBeFalsy();
  });

  it('isolates manual provider cache entries by repeat index', async () => {
    await clearCache();

    let cacheMissCount = 0;
    const provider: ApiProvider = {
      id: () => 'mock-provider',
      callApi: vi
        .fn()
        .mockImplementation(async (_prompt: string, context?: Record<string, any>) => {
          const cache = await context?.getCache();
          const cachedResponse = await cache?.get('manual-provider-key');
          if (cachedResponse) {
            return {
              ...(cachedResponse as ProviderResponse),
              cached: true,
            };
          }

          cacheMissCount += 1;
          const response = {
            cached: false,
            output: `result-repeat-${context?.repeatIndex}-miss-${cacheMissCount}`,
            tokenUsage: createEmptyTokenUsage(),
          };
          await cache?.set('manual-provider-key', response);
          return response;
        }),
    };

    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    const firstEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, firstEval, { maxConcurrency: 1, repeat: 2 });
    const firstSummary = await firstEval.toEvaluateSummary();

    expect(cacheMissCount).toBe(2);
    expect(firstSummary.results.map((result) => result.response?.output)).toEqual([
      'result-repeat-0-miss-1',
      'result-repeat-1-miss-2',
    ]);
    expect(firstSummary.results.map((result) => result.response?.cached)).toEqual([false, false]);

    const secondEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, secondEval, { maxConcurrency: 1, repeat: 2 });
    const secondSummary = await secondEval.toEvaluateSummary();

    expect(cacheMissCount).toBe(2);
    expect(secondSummary.results.map((result) => result.response?.output)).toEqual([
      'result-repeat-0-miss-1',
      'result-repeat-1-miss-2',
    ]);
    expect(secondSummary.results.map((result) => result.response?.cached)).toEqual([true, true]);
  });

  it('isolates beforeEach extension cache entries by repeat index', async () => {
    await clearCache();

    let extensionCacheMissCount = 0;
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== 'beforeEach' || !('test' in context)) {
        return context;
      }

      const hookContext = context as typeof context & {
        test: {
          vars?: Record<string, unknown>;
        };
      };

      const cache = getCache();
      const cachedHookValue = await cache.get<string>('extension-hook-key');
      if (cachedHookValue) {
        return {
          ...hookContext,
          test: {
            ...hookContext.test,
            vars: {
              ...hookContext.test.vars,
              hookValue: cachedHookValue,
            },
          },
        };
      }

      extensionCacheMissCount += 1;
      const hookValue = `hook-repeat-${extensionCacheMissCount}`;
      await cache.set('extension-hook-key', hookValue);

      return {
        ...hookContext,
        test: {
          ...hookContext.test,
          vars: {
            ...hookContext.test.vars,
            hookValue,
          },
        },
      };
    });

    const provider: ApiProvider = {
      id: () => 'mock-provider',
      callApi: vi
        .fn()
        .mockImplementation(async (_prompt: string, context?: Record<string, any>) => ({
          cached: false,
          output: context?.vars?.hookValue,
          tokenUsage: createEmptyTokenUsage(),
        })),
    };

    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ vars: {} }],
      extensions: ['file://hook.js'],
    };

    const firstEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, firstEval, { maxConcurrency: 1, repeat: 2 });
    const firstSummary = await firstEval.toEvaluateSummary();

    expect(extensionCacheMissCount).toBe(2);
    expect(firstSummary.results.map((result) => result.response?.output)).toEqual([
      'hook-repeat-1',
      'hook-repeat-2',
    ]);

    const secondEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, secondEval, { maxConcurrency: 1, repeat: 2 });
    const secondSummary = await secondEval.toEvaluateSummary();

    expect(extensionCacheMissCount).toBe(2);
    expect(secondSummary.results.map((result) => result.response?.output)).toEqual([
      'hook-repeat-1',
      'hook-repeat-2',
    ]);
  });

  it('isolates afterEach extension cache entries by repeat index', async () => {
    await clearCache();

    let extensionCacheMissCount = 0;
    const afterEachHookValues: string[] = [];
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== 'afterEach' || !('result' in context)) {
        return context;
      }

      const cache = getCache();
      let hookValue = await cache.get<string>('after-each-extension-key');
      if (!hookValue) {
        extensionCacheMissCount += 1;
        hookValue = `after-hook-repeat-${extensionCacheMissCount}`;
        await cache.set('after-each-extension-key', hookValue);
      }

      afterEachHookValues.push(hookValue);
      return context;
    });

    const provider: ApiProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        cached: false,
        output: 'provider-output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
      extensions: ['file://hook.js'],
    };

    const firstEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, firstEval, { maxConcurrency: 1, repeat: 2 });

    expect(extensionCacheMissCount).toBe(2);
    expect(afterEachHookValues).toEqual(['after-hook-repeat-1', 'after-hook-repeat-2']);

    afterEachHookValues.length = 0;

    const secondEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, secondEval, { maxConcurrency: 1, repeat: 2 });

    expect(extensionCacheMissCount).toBe(2);
    expect(afterEachHookValues).toEqual(['after-hook-repeat-1', 'after-hook-repeat-2']);
  });

  it('isolates select-best comparison cache entries by repeat index', async () => {
    await clearCache();

    const matchers = await import('../../src/matchers/comparison');
    let comparisonCacheMissCount = 0;
    const comparisonRepeatIndexes: Array<number | undefined> = [];
    const matchesSelectBestSpy = vi
      .spyOn(matchers, 'matchesSelectBest')
      .mockImplementation(async (_criteria, outputs, _grading, _vars, context) => {
        comparisonRepeatIndexes.push(context?.repeatIndex);
        const cache = context?.getCache?.() ?? getCache();
        const cachedResult = (await cache.get('select-best-comparison-key')) as string | undefined;
        if (!cachedResult) {
          comparisonCacheMissCount += 1;
          await cache.set('select-best-comparison-key', `repeat-${context?.repeatIndex}`);
        }

        return outputs.map((_output, index) => ({
          pass: index === 0,
          score: index === 0 ? 1 : 0,
          reason: index === 0 ? 'Selected as best' : 'Not selected',
        }));
      });

    const provider: ApiProvider = {
      id: () => 'mock-provider',
      callApi: vi
        .fn()
        .mockImplementation(async (prompt: string, context?: Record<string, any>) => ({
          cached: false,
          output: `${prompt}-repeat-${context?.repeatIndex}`,
          tokenUsage: createEmptyTokenUsage(),
        })),
    };

    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [
        {
          assert: [
            {
              type: 'select-best',
              value: 'choose the best one',
            },
          ],
        },
      ],
    };

    try {
      const firstEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, firstEval, { maxConcurrency: 1, repeat: 2 });

      expect(comparisonCacheMissCount).toBe(2);
      expect(matchesSelectBestSpy).toHaveBeenCalledTimes(2);
      expect(comparisonRepeatIndexes).toEqual([0, 1]);

      const secondEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, secondEval, { maxConcurrency: 1, repeat: 2 });

      expect(comparisonCacheMissCount).toBe(2);
      expect(matchesSelectBestSpy).toHaveBeenCalledTimes(4);
      expect(comparisonRepeatIndexes).toEqual([0, 1, 0, 1]);
    } finally {
      matchesSelectBestSpy.mockRestore();
    }
  });

  it('isolates resumed select-best comparison cache entries by original repeat index', async () => {
    await clearCache();

    const originalResume = cliState.resume;
    const { default: EvalResultModel } = await import('../../src/models/evalResult');
    const getCompletedIndexPairsSpy = vi
      .spyOn(EvalResultModel, 'getCompletedIndexPairs')
      .mockResolvedValue(new Set(['0:0', '0:1', '1:0', '1:1']));

    const matchers = await import('../../src/matchers/comparison');
    let comparisonCacheMissCount = 0;
    const comparisonRepeatIndexes: Array<number | undefined> = [];
    const matchesSelectBestSpy = vi
      .spyOn(matchers, 'matchesSelectBest')
      .mockImplementation(async (_criteria, outputs, _grading, _vars, context) => {
        comparisonRepeatIndexes.push(context?.repeatIndex);
        const cache = context?.getCache?.() ?? getCache();
        const cachedResult = (await cache.get('resume-select-best-key')) as string | undefined;
        if (!cachedResult) {
          comparisonCacheMissCount += 1;
          await cache.set('resume-select-best-key', `repeat-${context?.repeatIndex}`);
        }

        return outputs.map((_output, index) => ({
          pass: index === 0,
          score: index === 0 ? 1 : 0,
          reason: index === 0 ? 'Selected as best' : 'Not selected',
        }));
      });

    const provider: ApiProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        cached: false,
        output: 'should be skipped by resume',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [
        {
          assert: [
            {
              type: 'select-best',
              value: 'choose the best one',
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const fetchResultsByTestIdxSpy = vi
      .spyOn(evalRecord, 'fetchResultsByTestIdx')
      .mockImplementation(
        async (testIdx: number) =>
          testSuite.prompts.map((prompt, promptIdx) => ({
            failureReason: ResultFailureReason.NONE,
            gradingResult: {
              componentResults: [],
              pass: true,
              reason: 'Existing result',
              score: 1,
            },
            prompt,
            promptIdx,
            provider: { id: provider.id() },
            response: {
              output: `${prompt.raw}-test-${testIdx}`,
              tokenUsage: createEmptyTokenUsage(),
            },
            save: vi.fn().mockResolvedValue(undefined),
            score: 1,
            success: true,
            testCase: {
              ...testSuite.tests![0],
              vars: {},
            },
            testIdx,
          })) as any,
      );

    evalRecord.persisted = true;
    cliState.resume = true;

    try {
      await evaluate(testSuite, evalRecord, { maxConcurrency: 1, repeat: 2 });

      expect(getCompletedIndexPairsSpy).toHaveBeenCalledWith(evalRecord.id, {
        excludeErrors: cliState.retryMode,
      });
      expect(fetchResultsByTestIdxSpy).toHaveBeenCalledTimes(2);
      expect(provider.callApi).not.toHaveBeenCalled();
      expect(comparisonCacheMissCount).toBe(2);
      expect(matchesSelectBestSpy).toHaveBeenCalledTimes(2);
      expect(comparisonRepeatIndexes).toEqual([0, 1]);
    } finally {
      cliState.resume = originalResume;
      getCompletedIndexPairsSpy.mockRestore();
      matchesSelectBestSpy.mockRestore();
      fetchResultsByTestIdxSpy.mockRestore();
    }
  });
});
