import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { clearCache, getCache } from '../../src/cache';
import { evaluate, runEval } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import {
  type ApiProvider,
  type RateLimitRegistryRef,
  ResultFailureReason,
  type TestSuite,
} from '../../src/types/index';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator grading concurrency', () => {
  it('schedules model-graded assertion provider calls through the rate limit registry', async () => {
    const abortController = new AbortController();
    const execute = vi.fn(async (_provider: ApiProvider, callFn: () => Promise<unknown>) =>
      callFn(),
    );
    const rateLimitRegistry = {
      execute,
      dispose: vi.fn(),
    } as RateLimitRegistryRef;
    const targetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const gradingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('grading-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, reason: 'Scheduled grading passed' }),
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    const results = await runEval({
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      provider: targetProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {
        assert: [
          {
            type: 'llm-rubric',
            value: 'Output should be valid',
            provider: gradingProvider,
          },
        ],
      },
      conversations: {},
      registers: {},
      abortSignal: abortController.signal,
      rateLimitRegistry,
    });

    expect(results[0].success).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.map(([provider]) => provider.id())).toEqual([
      'target-provider',
      'grading-provider',
    ]);
    expect(gradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Output should be valid'),
      expect.objectContaining({
        prompt: { raw: expect.any(String), label: 'llm-rubric' },
        vars: expect.objectContaining({
          output: 'Test response',
          rubric: 'Output should be valid',
        }),
      }),
      { abortSignal: abortController.signal },
    );
  });

  it('groups model-graded assertion calls by provider id when maxConcurrency is 1', async () => {
    const callOrder: string[] = [];
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judgeOne: ApiProvider = {
      id: vi.fn().mockReturnValue('judge-one'),
      callApi: vi.fn(async () => {
        callOrder.push('judge-one');
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: 'judge one passed' }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const judgeTwo: ApiProvider = {
      id: vi.fn().mockReturnValue('judge-two'),
      callApi: vi.fn(async () => {
        callOrder.push('judge-two');
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: 'judge two passed' }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [
            { type: 'llm-rubric', value: 'Judge alpha one', provider: judgeOne },
            { type: 'llm-rubric', value: 'Judge alpha two', provider: judgeTwo },
          ],
        },
        {
          vars: { topic: 'beta' },
          assert: [
            { type: 'llm-rubric', value: 'Judge beta one', provider: judgeOne },
            { type: 'llm-rubric', value: 'Judge beta two', provider: judgeTwo },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(callOrder).toEqual(['judge-one', 'judge-one', 'judge-two', 'judge-two']);
  });

  it('keeps model-graded assertions row-first when prompts use _conversation', async () => {
    const callOrder: string[] = [];
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => {
        const topic = prompt.endsWith('Current: alpha') ? 'alpha' : 'beta';
        callOrder.push(`target:${topic}`);
        return {
          output: `Target output for ${topic}`,
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => {
        callOrder.push('judge');
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: 'judge passed' }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [
        toPrompt(
          '{% for turn in _conversation %}{{ turn.input }} => {{ turn.output }}\n{% endfor %}Current: {{topic}}',
        ),
      ],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'llm-rubric', value: 'Judge alpha', provider: judge }],
        },
        {
          vars: { topic: 'beta' },
          assert: [{ type: 'llm-rubric', value: 'Judge beta', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(callOrder).toEqual(['target:alpha', 'judge', 'target:beta', 'judge']);
  });

  it('records deferred model-graded provider failures as row errors when maxConcurrency is 1', async () => {
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async (prompt: string) => {
        if (prompt.includes('Judge alpha')) {
          throw new Error('grader exploded');
        }
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: 'judge passed' }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'llm-rubric', value: 'Judge alpha', provider: judge }],
        },
        {
          vars: { topic: 'beta' },
          assert: [{ type: 'llm-rubric', value: 'Judge beta', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    const failedResult = summary.results.find((result) => result.vars.topic === 'alpha');
    expect(summary.stats.errors).toBe(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.results).toHaveLength(2);
    expect(failedResult?.failureReason).toBe(ResultFailureReason.ERROR);
    expect(failedResult?.error).toContain('grader exploded');
  });

  it('stops grouped serial evals after a non-transient target status', async () => {
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        metadata: {
          http: {
            status: 403,
            statusText: 'Forbidden',
          },
        },
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => ({
        output: JSON.stringify({ pass: true, score: 1, reason: 'judge passed' }),
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'llm-rubric', value: 'Judge alpha', provider: judge }],
        },
        {
          vars: { topic: 'beta' },
          assert: [{ type: 'llm-rubric', value: 'Judge beta', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(provider.callApi).toHaveBeenCalledTimes(1);
    expect(judge.callApi).toHaveBeenCalledTimes(1);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].vars.topic).toBe('alpha');
  });

  it('groups model-graded assert-set children by provider id when maxConcurrency is 1', async () => {
    const callOrder: string[] = [];
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judgeOne: ApiProvider = {
      id: vi.fn().mockReturnValue('judge-one'),
      callApi: vi.fn(async () => {
        callOrder.push('judge-one');
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: 'judge one passed' }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const judgeTwo: ApiProvider = {
      id: vi.fn().mockReturnValue('judge-two'),
      callApi: vi.fn(async () => {
        callOrder.push('judge-two');
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: 'judge two passed' }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [
            {
              type: 'assert-set',
              assert: [
                { type: 'llm-rubric', value: 'Judge alpha one', provider: judgeOne },
                { type: 'llm-rubric', value: 'Judge alpha two', provider: judgeTwo },
              ],
            },
          ],
        },
        {
          vars: { topic: 'beta' },
          assert: [
            {
              type: 'assert-set',
              assert: [
                { type: 'llm-rubric', value: 'Judge beta one', provider: judgeOne },
                { type: 'llm-rubric', value: 'Judge beta two', provider: judgeTwo },
              ],
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(callOrder).toEqual(['judge-one', 'judge-one', 'judge-two', 'judge-two']);
  });

  it('keeps multi-call model-graded assertions grouped by provider id when maxConcurrency is 1', async () => {
    const callOrder: string[] = [];
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const createJudge = (id: string): ApiProvider => ({
      id: vi.fn().mockReturnValue(id),
      callApi: vi.fn(async (_prompt: string, context?: { prompt?: { label?: string } }) => {
        const label = context?.prompt?.label ?? 'unknown';
        callOrder.push(`${id}:${label}`);

        return {
          output:
            label === 'g-eval-steps'
              ? JSON.stringify({ steps: ['Check the answer'] })
              : JSON.stringify({ score: 10, reason: 'passed' }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    });
    const judgeOne = createJudge('judge-one');
    const judgeTwo = createJudge('judge-two');
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [
            { type: 'g-eval', value: 'Judge alpha one', provider: judgeOne },
            { type: 'g-eval', value: 'Judge alpha two', provider: judgeTwo },
          ],
        },
        {
          vars: { topic: 'beta' },
          assert: [
            { type: 'g-eval', value: 'Judge beta one', provider: judgeOne },
            { type: 'g-eval', value: 'Judge beta two', provider: judgeTwo },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(callOrder).toEqual([
      'judge-one:g-eval-steps',
      'judge-one:g-eval-steps',
      'judge-one:g-eval',
      'judge-one:g-eval',
      'judge-two:g-eval-steps',
      'judge-two:g-eval-steps',
      'judge-two:g-eval',
      'judge-two:g-eval',
    ]);
  });

  it('isolates deferred grading cache entries by repeat index', async () => {
    await clearCache();

    const provider: ApiProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        cached: false,
        output: 'target output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    let gradingCacheMissCount = 0;
    const gradingProvider: ApiProvider = {
      id: () => 'grading-provider',
      callApi: vi.fn().mockImplementation(async () => {
        const cache = getCache();
        const cachedOutput = await cache.get<string>('deferred-grading-key');
        if (cachedOutput) {
          return {
            cached: true,
            output: cachedOutput,
            tokenUsage: createEmptyTokenUsage(),
          };
        }

        gradingCacheMissCount += 1;
        const output = JSON.stringify({
          pass: true,
          reason: `grader-repeat-${gradingCacheMissCount}`,
          score: 1,
        });
        await cache.set('deferred-grading-key', output);
        return {
          cached: false,
          output,
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [{ type: 'llm-rubric', value: 'Output should pass', provider: gradingProvider }],
        },
      ],
    };

    const firstEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, firstEval, { maxConcurrency: 1, repeat: 2 });

    expect(gradingCacheMissCount).toBe(2);

    const secondEval = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, secondEval, { maxConcurrency: 1, repeat: 2 });

    expect(gradingCacheMissCount).toBe(2);
    expect(gradingProvider.callApi).toHaveBeenCalledTimes(4);
  });

  it('serializes async assert-set judges so grouping survives PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY', async () => {
    // Regression: without forcing assertion concurrency to 1 when the grouping
    // queue is active, async graders inside an assert-set would interleave
    // judges across rows (judge-one row1, judge-two row1, judge-one row2, ...)
    // and defeat the single-judge-drain guarantee.
    const callOrder: string[] = [];
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const makeAsyncJudge = (id: string): ApiProvider => ({
      id: vi.fn().mockReturnValue(id),
      callApi: vi.fn(async () => {
        // Yield to the event loop a few times to expose any interleaving that
        // `async.forEachOfLimit(ASSERTIONS_MAX_CONCURRENCY)` would produce.
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        callOrder.push(id);
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: `${id} passed` }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    });
    const judgeOne = makeAsyncJudge('judge-one');
    const judgeTwo = makeAsyncJudge('judge-two');
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [
            {
              type: 'assert-set',
              assert: [
                { type: 'llm-rubric', value: 'Judge alpha one', provider: judgeOne },
                { type: 'llm-rubric', value: 'Judge alpha two', provider: judgeTwo },
              ],
            },
          ],
        },
        {
          vars: { topic: 'beta' },
          assert: [
            {
              type: 'assert-set',
              assert: [
                { type: 'llm-rubric', value: 'Judge beta one', provider: judgeOne },
                { type: 'llm-rubric', value: 'Judge beta two', provider: judgeTwo },
              ],
            },
          ],
        },
        {
          vars: { topic: 'gamma' },
          assert: [
            {
              type: 'assert-set',
              assert: [
                { type: 'llm-rubric', value: 'Judge gamma one', provider: judgeOne },
                { type: 'llm-rubric', value: 'Judge gamma two', provider: judgeTwo },
              ],
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(3);
    expect(callOrder).toEqual([
      'judge-one',
      'judge-one',
      'judge-one',
      'judge-two',
      'judge-two',
      'judge-two',
    ]);
  });

  it('does not log error-level message when deferred grading is aborted', async () => {
    const { default: logger } = await import('../../src/logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    const abortController = new AbortController();
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => {
        abortController.abort();
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'llm-rubric', value: 'Judge alpha', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
      abortSignal: abortController.signal,
    });

    const gradingErrorLogs = errorSpy.mock.calls.filter(
      ([message]) => typeof message === 'string' && message.includes('Assertion grading failed'),
    );
    expect(gradingErrorLogs).toHaveLength(0);

    const failedResult = (await evalRecord.toEvaluateSummary()).results.find(
      (result) => result.vars.topic === 'alpha',
    );
    expect(failedResult?.error).toMatch(/^Aborted: /);

    errorSpy.mockRestore();
  });

  it('suppresses the error log when deferred grading throws AbortException under abort', async () => {
    const { default: logger } = await import('../../src/logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    const abortController = new AbortController();
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => {
        abortController.abort();
        const abortException = new Error('Python provider cancelled');
        abortException.name = 'AbortException';
        throw abortException;
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'llm-rubric', value: 'Judge alpha', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
      abortSignal: abortController.signal,
    });

    const gradingErrorLogs = errorSpy.mock.calls.filter(
      ([message]) => typeof message === 'string' && message.includes('Assertion grading failed'),
    );
    expect(gradingErrorLogs).toHaveLength(0);

    errorSpy.mockRestore();
  });

  it('still logs error-level when abort-shaped error fires WITHOUT an aborted signal', async () => {
    // Regression guard: third-party SDKs sometimes surface unrelated cancellation
    // as AbortError. If the evaluator's abort signal is NOT tripped, these are
    // real bugs and must still surface at error level.
    const { default: logger } = await import('../../src/logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => {
        const sdkAbortLookalike = new Error('fetch aborted by keepalive');
        sdkAbortLookalike.name = 'AbortError';
        throw sdkAbortLookalike;
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'llm-rubric', value: 'Judge alpha', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

    const gradingErrorLogs = errorSpy.mock.calls.filter(
      ([message]) => typeof message === 'string' && message.includes('Assertion grading failed'),
    );
    expect(gradingErrorLogs.length).toBeGreaterThanOrEqual(1);

    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.stats.errors).toBe(1);
    expect(summary.results[0].failureReason).toBe(ResultFailureReason.ERROR);
    expect(summary.results[0].error).not.toMatch(/^Aborted: /);

    errorSpy.mockRestore();
  });

  it('still logs error when a non-abort-shaped error fires during an unrelated abort', async () => {
    // Regression guard: if abort is in flight but the caught error is a real
    // bug (SyntaxError, TypeError, etc.), we must not silently suppress it.
    const { default: logger } = await import('../../src/logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    const abortController = new AbortController();
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => {
        abortController.abort();
        throw new SyntaxError('Unexpected token in grader output');
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'llm-rubric', value: 'Judge alpha', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
      abortSignal: abortController.signal,
    });

    const gradingErrorLogs = errorSpy.mock.calls.filter(
      ([message]) => typeof message === 'string' && message.includes('Assertion grading failed'),
    );
    expect(gradingErrorLogs.length).toBeGreaterThanOrEqual(1);

    errorSpy.mockRestore();
  });

  it('logs grouping-active info when serial eval contains model-graded assertions', async () => {
    const { default: logger } = await import('../../src/logger');
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => ({
        output: JSON.stringify({ pass: true, score: 1, reason: 'ok' }),
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'llm-rubric', value: 'Judge alpha', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

    const groupingLogs = infoSpy.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' &&
        message.includes('Grouping model-graded assertions by provider'),
    );
    expect(groupingLogs).toHaveLength(1);

    infoSpy.mockRestore();
  });

  it('does not log grouping info when there are no model-graded assertions', async () => {
    const { default: logger } = await import('../../src/logger');
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'contains', value: 'Target' }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

    const groupingLogs = infoSpy.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' &&
        (message.includes('Grouping model-graded assertions by provider') ||
          message.includes('Serial grading grouping disabled')),
    );
    expect(groupingLogs).toHaveLength(0);

    infoSpy.mockRestore();
  });

  it('logs grouping-disabled reason when conversation var forces per-row ordering', async () => {
    const { default: logger } = await import('../../src/logger');
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async () => ({
        output: 'Target output',
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => ({
        output: JSON.stringify({ pass: true, score: 1, reason: 'ok' }),
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [
        toPrompt('{% for turn in _conversation %}{{ turn.input }}{% endfor %}Current: {{topic}}'),
      ],
      tests: [
        {
          vars: { topic: 'alpha' },
          assert: [{ type: 'llm-rubric', value: 'Judge alpha', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

    const disabledLogs = infoSpy.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' &&
        message.includes('Serial grading grouping disabled') &&
        message.includes('conversation variables'),
    );
    expect(disabledLogs).toHaveLength(1);

    infoSpy.mockRestore();
  });

  it('keeps parallel assertion dispatch when the grouping queue is NOT active', async () => {
    // Regression guard for the `? 1 : ASSERTIONS_MAX_CONCURRENCY` ternary in
    // runAssertions. Without the queue present (non-deferred concurrent eval),
    // per-test assertions must still fan out so we don't silently 3x-throttle
    // normal eval users.
    let inFlight = 0;
    let maxInFlight = 0;
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string) => ({
        output: `Target output for ${prompt}`,
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 25));
        inFlight -= 1;
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: 'ok' }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            { type: 'llm-rubric', value: 'Judge one', provider: judge },
            { type: 'llm-rubric', value: 'Judge two', provider: judge },
            { type: 'llm-rubric', value: 'Judge three', provider: judge },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    // maxConcurrency > 1 takes the non-grouped path where the queue is absent.
    await evaluate(testSuite, evalRecord, { maxConcurrency: 5 });

    expect(inFlight).toBe(0);
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
  });
});
