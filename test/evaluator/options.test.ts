import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { type ApiProvider, ResultFailureReason, type TestSuite } from '../../src/types/index';
import { mockApiProvider, mockApiProvider2, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator options and hooks', () => {
  it.each([false, true])(
    'reports completed rows to CI and the caller (timeout=%s)',
    async (timedOut) => {
      vi.useFakeTimers();
      vi.stubEnv('CI', 'true');
      const info = vi.spyOn(logger, 'info');
      const progressCallback = vi.fn();
      if (timedOut) {
        vi.mocked(mockApiProvider.callApi).mockImplementation(
          async (_prompt, _context, options) =>
            new Promise((_resolve, reject) => {
              options?.abortSignal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            }),
        );
      }
      try {
        const suite: TestSuite = {
          providers: [mockApiProvider],
          prompts: [toPrompt('Fixture request')],
          tests: [{}],
        };
        const evaluation = new Eval({});
        const pending = evaluate(suite, evaluation, {
          timeoutMs: timedOut ? 10 : 0,
          progressCallback,
        });
        await vi.runAllTimersAsync();
        await pending;
        const summary = await evaluation.toEvaluateSummary();
        expect(summary.stats.errors).toBe(timedOut ? 1 : 0);
        expect(progressCallback).toHaveBeenCalledOnce();
        expect(progressCallback.mock.calls[0].slice(0, 2)).toEqual([1, 1]);
        expect(info).toHaveBeenCalledWith(expect.stringContaining('Complete! 1/1 tests'));
      } finally {
        info.mockRestore();
        vi.unstubAllEnvs();
      }
    },
  );

  it('aborts an active peer before clearing the deadline when a row callback fails', async () => {
    let peerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      peerStarted = resolve;
    });
    let peerAborted = false;
    const failure = new Error('fixture progress failed');
    const provider: ApiProvider = {
      id: () => 'concurrent-cleanup-fixture',
      async callApi(prompt, _context, options) {
        if (prompt === 'finish') {
          await started;
          return { output: 'Completed first row' };
        }
        return new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener(
            'abort',
            () => {
              peerAborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
          peerStarted();
        });
      },
    };
    const suite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('{{request}}')],
      tests: [{ vars: { request: 'finish' } }, { vars: { request: 'wait' } }],
    };
    await expect(
      evaluate(suite, new Eval({}), {
        timeoutMs: 0,
        maxEvalTimeMs: 60_000,
        maxConcurrency: 2,
        silent: true,
        progressCallback: () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(peerAborted).toBe(true);
  });

  it.each(['timeoutMs', 'maxEvalTimeMs'] as const)(
    'rejects invalid %s values before running providers or starting timers',
    async (name) => {
      vi.useFakeTimers();
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Fixture request')],
        tests: [{}],
      };
      for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '100', null]) {
        await expect(
          evaluate(testSuite, new Eval({}), { [name]: value, silent: true }),
        ).rejects.toThrow(`${name} must be a finite, nonnegative number of milliseconds`);
      }
      expect(mockApiProvider.callApi).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('lets zero timeout options override nonzero environment defaults', async () => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_EVAL_TIMEOUT_MS', '5');
    vi.stubEnv('PROMPTFOO_MAX_EVAL_TIME_MS', '5');
    let finish!: (value: { output: string }) => void;
    const provider: ApiProvider = {
      id: () => 'deferred-fixture',
      callApi: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    const suite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Fixture request')],
      tests: [{}],
    };
    const evaluation = new Eval({});
    try {
      const pending = evaluate(suite, evaluation, { timeoutMs: 0, maxEvalTimeMs: 0, silent: true });
      await vi.advanceTimersByTimeAsync(20);
      finish({ output: 'fixture response' });
      await pending;
      expect((await evaluation.toEvaluateSummary()).stats).toMatchObject({
        successes: 1,
        errors: 0,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each(['timeoutMs', 'maxEvalTimeMs'] as const)(
    'keeps oversized %s timers pending and cancels the current chunk on completion',
    async (name) => {
      vi.useFakeTimers();
      const scheduled = vi.spyOn(globalThis, 'setTimeout');
      const cleared = vi.spyOn(globalThis, 'clearTimeout');
      let finish!: (value: { output: string }) => void;
      const provider: ApiProvider = {
        id: () => 'long-timeout-fixture',
        callApi: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      };
      const suite: TestSuite = {
        providers: [provider],
        prompts: [toPrompt('Fixture request')],
        tests: [{}],
      };
      const evaluation = new Eval({});
      const pending = evaluate(suite, evaluation, {
        timeoutMs: 0,
        maxEvalTimeMs: 0,
        silent: true,
        [name]: 2_147_483_647 + 100,
      });
      await vi.advanceTimersByTimeAsync(2_147_483_647 + 50);
      finish({ output: 'fixture response' });
      await pending;
      expect((await evaluation.toEvaluateSummary()).stats).toMatchObject({
        successes: 1,
        errors: 0,
      });
      await vi.advanceTimersByTimeAsync(0);
      const remainingChunk = scheduled.mock.calls.findIndex((call) => call[1] === 100);
      expect(remainingChunk).toBeGreaterThanOrEqual(0);
      expect(cleared).toHaveBeenCalledWith(scheduled.mock.results[remainingChunk].value);
      scheduled.mockRestore();
      cleared.mockRestore();
    },
  );

  it('cancels the total timer when setup throws', async () => {
    vi.useFakeTimers();
    vi.mocked(runExtensionHook).mockRejectedValueOnce(new Error('fixture setup failed'));
    const suite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Fixture request')],
      tests: [{}],
      extensions: ['file://fixture.js'],
    };
    await expect(
      evaluate(suite, new Eval({}), { maxEvalTimeMs: 2_147_483_647 + 100, silent: true }),
    ).rejects.toThrow('fixture setup failed');
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should use the options from the test if they exist', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
          options: {
            transform: 'output + " postprocessed"',
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test output postprocessed');
  });

  it('should apply prompt config to provider call', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: 'You are a helpful math tutor. Solve {{problem}}',
          label: 'Math problem',
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'math_response',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    final_answer: { type: 'string' },
                  },
                  required: ['final_answer'],
                  additionalProperties: false,
                },
              },
            },
          },
        },
      ],
      tests: [{ vars: { problem: '8x + 31 = 2' } }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledWith(
      'You are a helpful math tutor. Solve 8x + 31 = 2',
      expect.objectContaining({
        prompt: expect.objectContaining({
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'math_response',
                schema: {
                  type: 'object',
                  properties: { final_answer: { type: 'string' } },
                  required: ['final_answer'],
                  additionalProperties: false,
                },
                strict: true,
              },
            },
          },
        }),
      }),
      undefined,
    );
  });

  it('should apply dynamic prompt function config to provider call', async () => {
    const mockDynamicConfigProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockDynamicConfigProvider],
      prompts: [
        {
          raw: 'ignored by prompt function',
          label: 'Dynamic prompt with config',
          config: {
            temperature: 0.1,
            top_p: 0.9,
          },
          function: async () => ({
            prompt: 'Solve this problem: {{problem}}',
            config: {
              temperature: 0.3,
              response_format: { type: 'json_object' },
            },
          }),
        },
      ],
      tests: [
        {
          vars: { problem: '8x + 31 = 2' },
          options: { temperature: 0.7 },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockDynamicConfigProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockDynamicConfigProvider.callApi).toHaveBeenCalledWith(
      'Solve this problem: 8x + 31 = 2',
      expect.objectContaining({
        prompt: expect.objectContaining({
          config: {
            temperature: 0.7,
            top_p: 0.9,
            response_format: { type: 'json_object' },
          },
        }),
      }),
      undefined,
    );
  });

  it.each([true, false])('calls hooks with results (persisted: %s)', async (persisted) => {
    const mockExtension = 'file:./path/to/extension.js:extensionFunction';
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }}')],
      tests: [
        {
          vars: { var1: 'value1' },
          assert: [{ type: 'equals', value: 'Test output' }],
        },
      ],
      extensions: [mockExtension],
    };

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockClear();
    const evalRecord = persisted
      ? await Eval.create({}, testSuite.prompts, { id: randomUUID() })
      : new Eval({});
    await evaluate(testSuite, evalRecord, {});

    // Check if runExtensionHook was called 4 times (beforeAll, beforeEach, afterEach, afterAll)
    expect(mockedRunExtensionHook).toHaveBeenCalledTimes(4);
    // Check beforeAll call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      1,
      [mockExtension],
      'beforeAll',
      expect.objectContaining({ suite: testSuite }),
    );

    // Check beforeEach call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      2,
      [mockExtension],
      'beforeEach',
      expect.objectContaining({
        test: expect.objectContaining({
          vars: { var1: 'value1' },
          assert: [{ type: 'equals', value: 'Test output' }],
        }),
      }),
    );

    // Check afterEach call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      3,
      [mockExtension],
      'afterEach',
      expect.objectContaining({
        test: expect.objectContaining({
          vars: { var1: 'value1' },
          assert: [{ type: 'equals', value: 'Test output' }],
        }),
        result: expect.objectContaining({
          success: true,
          score: 1,
          response: expect.objectContaining({
            output: 'Test output',
          }),
        }),
      }),
    );

    // Check afterAll call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      4,
      [mockExtension],
      'afterAll',
      expect.objectContaining({
        prompts: expect.arrayContaining([
          expect.objectContaining({
            raw: 'Test prompt {{ var1 }}',
            metrics: expect.objectContaining({
              assertPassCount: 1,
              assertFailCount: 0,
            }),
          }),
          expect.objectContaining({
            raw: 'Test prompt {{ var1 }}',
            metrics: expect.objectContaining({
              assertPassCount: 1,
              assertFailCount: 0,
            }),
          }),
        ]),
        results: [
          expect.objectContaining({
            testIdx: 0,
            promptIdx: 0,
            success: true,
            score: 1,
            response: expect.objectContaining({ output: 'Test output' }),
          }),
        ],
        suite: testSuite,
      }),
    );
  });

  it('retains an in-memory timeout row for afterAll and summary reads', async () => {
    vi.useFakeTimers();
    const provider: ApiProvider = {
      id: () => 'local-timeout-provider',
      callApi: vi.fn(() => new Promise<never>(() => {})),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
      extensions: ['file://test-extension.js:afterAll'],
    };
    const evaluation = new Eval({});
    const pendingEvaluation = evaluate(testSuite, evaluation, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await pendingEvaluation;

    const expectedResult = expect.objectContaining({
      success: false,
      score: 0,
      failureReason: ResultFailureReason.ERROR,
      latencyMs: 100,
      error: expect.stringContaining('Evaluation timed out after 100ms'),
    });
    expect(runExtensionHook).toHaveBeenCalledWith(
      testSuite.extensions,
      'afterAll',
      expect.objectContaining({ results: [expectedResult] }),
    );
    expect(vi.mocked(runExtensionHook).mock.calls.some((call) => call[1] === 'afterEach')).toBe(
      false,
    );
    const summary = await evaluation.toEvaluateSummary();
    expect(summary.results).toEqual([expectedResult]);
    expect(summary.stats).toMatchObject({ successes: 0, failures: 0, errors: 1 });
  });

  it('should handle multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider2],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockApiProvider2.callApi).toHaveBeenCalledTimes(1);
  });
});
