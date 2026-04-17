import './setup';

import { randomUUID } from 'crypto';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { __resetPromptConversationCacheForTests, evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import {
  type ApiProvider,
  type ProviderResponse,
  ResultFailureReason,
  type TestSuite,
} from '../../src/types/index';
import { sleep } from '../../src/util/time';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

beforeEach(() => {
  __resetPromptConversationCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describeEvaluator('evaluator execution control', () => {
  it('evaluates with provider delay', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      delay: 100,
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(sleep).toHaveBeenCalledWith(100);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluates with no provider delay', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockApiProvider.delay).toBe(0);
    expect(sleep).not.toHaveBeenCalled();
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
  });

  type ConcurrencyProbe = {
    maxActiveCalls: number;
    callApi: ReturnType<typeof vi.fn>;
  };

  async function runConcurrencyProbe(rawPrompt: string, testCount = 4): Promise<ConcurrencyProbe> {
    let activeCalls = 0;
    let maxActiveCalls = 0;
    // Explicit barrier so every concurrent slot actually observes peak
    // overlap, independent of wall-clock timing. With setTimeout-only
    // sleeps a slow CI runner can serialize short sleeps and falsely
    // report maxActiveCalls=1 even when the evaluator dispatched in
    // parallel.
    let releaseHold: (() => void) | undefined;
    let holdPromise = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    const targetConcurrency = Math.min(testCount, 4);
    const callApi = vi.fn().mockImplementation(async (prompt) => {
      activeCalls += 1;
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
      if (activeCalls >= targetConcurrency) {
        releaseHold?.();
      }
      // Wait until either the barrier trips (parallel path) or a short
      // fallback fires (serial path — we'll never reach targetConcurrency).
      await Promise.race([holdPromise, new Promise<void>((resolve) => setTimeout(resolve, 100))]);
      activeCalls -= 1;
      return {
        output: String(prompt),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      };
    });
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi,
    };

    const tests = Array.from({ length: testCount }, (_, idx) => ({
      vars: { question: `Turn ${idx + 1}` },
    }));
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt(rawPrompt)],
      tests,
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { maxConcurrency: targetConcurrency });

    expect(callApi).toHaveBeenCalledTimes(testCount);
    // Release the barrier if it's still held (e.g. serial path never tripped it).
    releaseHold?.();
    // Suppress unused-variable lint noise for holdPromise.
    holdPromise = holdPromise.then(() => undefined);
    return { maxActiveCalls, callApi };
  }

  it('does not force concurrency to 1 for _conversation substrings', async () => {
    const { maxActiveCalls } = await runConcurrencyProbe(
      'Summarize the pre_conversation_context for {{ question }}',
    );

    expect(maxActiveCalls).toBeGreaterThan(1);
  });

  it('forces concurrency to 1 for real _conversation template references', async () => {
    const { maxActiveCalls } = await runConcurrencyProbe(
      '{{ {"history": _conversation}["history"][0].output }} {{ question }}',
      2,
    );

    expect(maxActiveCalls).toBe(1);
  });

  it('falls back to serial execution when a prompt that mentions _conversation fails to parse', async () => {
    // Invalid Nunjucks ({% if %} with no condition), but the literal text
    // contains `_conversation`. The old substring check always forced serial
    // mode here, and the new parser-based check must preserve that safety
    // envelope instead of silently running in parallel. The render itself
    // will fail for an invalid template, so assert on the evaluator's
    // concurrency-adjustment log rather than on peak in-flight calls.
    const infoSpy = vi.spyOn(logger, 'info');
    try {
      const mockApiProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('test-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'ok',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('{{ _conversation[0].output }} {% if %} {{ question }}')],
        tests: [{ vars: { question: 'a' } }, { vars: { question: 'b' } }],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, { maxConcurrency: 4 });

      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Setting concurrency to 1'));
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('propagates prior turn output into _conversation on the next serial call', async () => {
    const { callApi } = await runConcurrencyProbe(
      '{% if _conversation and _conversation|length > 0 %}prior={{ _conversation[0].response.output }} {% endif %}now={{ question }}',
      2,
    );

    // First call has no prior history; second call should have received
    // turn 1's rendered output threaded through the `_conversation` variable.
    const firstRenderedPrompt = String(callApi.mock.calls[0][0]);
    const secondRenderedPrompt = String(callApi.mock.calls[1][0]);
    expect(firstRenderedPrompt).not.toContain('prior=');
    expect(secondRenderedPrompt).toContain('prior=');
    expect(secondRenderedPrompt).toContain('now=Turn 2');
  });

  it('skips delay for cached responses', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      delay: 100,
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        cached: true,
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(sleep).not.toHaveBeenCalled();
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('handles circular references when logging errors during result saving', async () => {
    // Create a circular reference object that would cause JSON.stringify to fail
    type CircularType = { prop: string; self?: CircularType };
    const circularObj: CircularType = { prop: 'value' };
    circularObj.self = circularObj;

    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    // Create a test suite that will generate a result with a circular reference
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { circular: circularObj },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const mockAddResult = vi
      .spyOn(evalRecord, 'addResult')
      .mockRejectedValue(new Error('Mock save error'));
    const errorSpy = vi.spyOn(logger, 'error');
    try {
      await evaluate(testSuite, evalRecord, {});
      expect(errorSpy).toHaveBeenCalledWith(
        '[Evaluator] Error saving result',
        expect.objectContaining({
          error: expect.any(Error),
          resultSummary: expect.objectContaining({
            testIdx: 0,
            promptIdx: 0,
            success: true,
          }),
        }),
      );
    } finally {
      mockAddResult.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('evaluate with provider error response', async () => {
    const mockApiProviderWithError: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-error'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Some output',
        error: 'API error occurred',
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithError],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary).toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 0,
          errors: 1,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            error: 'API error occurred',
            failureReason: ResultFailureReason.ERROR,
            success: false,
            score: 0,
          }),
        ]),
      }),
    );
    expect(mockApiProviderWithError.callApi).toHaveBeenCalledTimes(1);
  });

  it('should handle evaluation timeout without tearing down the shared provider', async () => {
    vi.useFakeTimers();

    const mockAddResult = vi.fn().mockResolvedValue(undefined);
    let longTimer: NodeJS.Timeout | null = null;

    const slowApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('slow-provider'),
      callApi: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          longTimer = setTimeout(() => {
            resolve({
              output: 'Slow response',
              tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
            });
          }, 5000);
        });
      }),
      cleanup: vi.fn(),
    };

    const mockEval = {
      id: 'mock-eval-id',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 1,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [slowApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      const evalPromise = evaluate(testSuite, mockEval as unknown as Eval, { timeoutMs: 100 });
      await vi.advanceTimersByTimeAsync(100);
      await evalPromise;

      expect(slowApiProvider.callApi).toHaveBeenCalledWith(
        'Test prompt',
        expect.anything(),
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
        }),
      );

      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation timed out after 100ms'),
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      );

      expect(slowApiProvider.cleanup).not.toHaveBeenCalled();
    } finally {
      if (longTimer) {
        clearTimeout(longTimer);
      }
      vi.useRealTimers();
    }
  });

  it('should not block timeout rows when a provider call does not settle after abort', async () => {
    vi.useFakeTimers();

    const mockAddResult = vi.fn().mockResolvedValue(undefined);

    const hangingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('hanging-provider'),
      callApi: vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            // Intentionally never resolves; timeout handling must still emit a row.
          }),
      ),
      cleanup: vi.fn(),
    };

    const mockEval = {
      id: 'mock-eval-id',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 1,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [hangingProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      const evalPromise = evaluate(testSuite, mockEval as unknown as Eval, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      expect(hangingProvider.cleanup).not.toHaveBeenCalled();
      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation timed out after 50ms'),
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('should ignore stale provider rows that resolve after a timeout row is recorded', async () => {
    vi.useFakeTimers();

    const mockAddResult = vi.fn().mockResolvedValue(undefined);
    let resolveLateResponse!: (value: ProviderResponse) => void;

    const slowApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('slow-provider'),
      callApi: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLateResponse = resolve;
          }),
      ),
      cleanup: vi.fn(),
    };

    const mockEval = {
      id: 'mock-eval-id',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 1,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [slowApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      const evalPromise = evaluate(testSuite, mockEval as unknown as Eval, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      expect(mockAddResult).toHaveBeenCalledTimes(1);
      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation timed out after 50ms'),
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      );

      resolveLateResponse({
        output: 'Late response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(mockAddResult).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should honor external abortSignal when timeoutMs is set', async () => {
    vi.useFakeTimers();

    const mockAddResult = vi.fn().mockResolvedValue(undefined);
    let longTimer: NodeJS.Timeout | null = null;
    let abortTimer: NodeJS.Timeout | null = null;
    const abortController = new AbortController();

    const slowApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('slow-provider'),
      callApi: vi.fn().mockImplementation((_, __, opts) => {
        return new Promise((resolve, reject) => {
          longTimer = setTimeout(() => {
            resolve({
              output: 'Slow response',
              tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
            });
          }, 200);

          abortTimer = setTimeout(() => {
            abortController.abort();
          }, 10);

          opts?.abortSignal?.addEventListener('abort', () => {
            if (longTimer) {
              clearTimeout(longTimer);
            }
            if (abortTimer) {
              clearTimeout(abortTimer);
            }
            reject(new Error('aborted'));
          });
        });
      }),
      cleanup: vi.fn(),
    };

    const mockEval = {
      id: 'mock-eval-id',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 1,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [slowApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      const evalPromise = evaluate(testSuite, mockEval as unknown as Eval, {
        timeoutMs: 1000,
        abortSignal: abortController.signal,
      });
      await vi.advanceTimersByTimeAsync(10);
      await evalPromise;

      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('aborted'),
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      );
    } finally {
      if (longTimer) {
        clearTimeout(longTimer);
      }
      if (abortTimer) {
        clearTimeout(abortTimer);
      }
      vi.useRealTimers();
    }
  });

  it('should abort when exceeding maxEvalTimeMs', async () => {
    vi.useFakeTimers();

    const mockAddResult = vi.fn().mockResolvedValue(undefined);
    let longTimer: NodeJS.Timeout | null = null;

    const slowApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('slow-provider'),
      callApi: vi.fn().mockImplementation((_, __, opts) => {
        return new Promise((resolve, reject) => {
          longTimer = setTimeout(() => {
            resolve({
              output: 'Slow response',
              tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 1 },
            });
          }, 1000);

          opts?.abortSignal?.addEventListener('abort', () => {
            if (longTimer) {
              clearTimeout(longTimer);
            }
            reject(new Error('aborted'));
          });
        });
      }),
      cleanup: vi.fn(),
    };

    const mockEval = {
      id: 'mock-eval-id',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 2,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [slowApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}, {}],
    };

    try {
      const evalPromise = evaluate(testSuite, mockEval as unknown as Eval, { maxEvalTimeMs: 100 });
      await vi.advanceTimersByTimeAsync(100);
      await evalPromise;

      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('aborted'),
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      );
    } finally {
      if (longTimer) {
        clearTimeout(longTimer);
      }
      vi.useRealTimers();
    }
  });

  it('flushes queued grouped grading before writing max-duration timeout rows', async () => {
    vi.useFakeTimers();

    const results: any[] = [];
    const waitForTarget = (ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            reject(new Error('target aborted'));
          },
          { once: true },
        );
      });
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn(async (prompt: string, _context, options) => {
        await waitForTarget(40, options?.abortSignal);
        return {
          output: `Target output for ${prompt}`,
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async () => ({
        output: JSON.stringify({ pass: true, score: 1, reason: 'judge passed' }),
        tokenUsage: createEmptyTokenUsage(),
      })),
    };
    const evalRecord = {
      id: 'grouped-timeout-eval',
      results,
      prompts: [],
      persisted: false,
      config: {},
      addPrompts: vi.fn().mockResolvedValue(undefined),
      addResult: vi.fn(async (result) => {
        results.push(result);
      }),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue(results),
      save: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
      setVars: vi.fn(),
      toEvaluateSummary: vi.fn(),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt {{topic}}')],
      tests: ['alpha', 'beta', 'gamma'].map((topic) => ({
        vars: { topic },
        assert: [{ type: 'llm-rubric', value: `Judge ${topic}`, provider: judge }],
      })),
    };

    try {
      const evalPromise = evaluate(testSuite, evalRecord as unknown as Eval, {
        maxConcurrency: 1,
        maxEvalTimeMs: 55,
      });
      await vi.advanceTimersByTimeAsync(40);
      await vi.advanceTimersByTimeAsync(15);
      await evalPromise;
    } finally {
      vi.useRealTimers();
    }

    const resultByTopic = new Map(results.map((result) => [result.vars.topic, result]));

    expect(judge.callApi).toHaveBeenCalledTimes(1);
    expect(resultByTopic.get('alpha')).toEqual(
      expect.objectContaining({
        success: true,
        response: expect.objectContaining({
          output: 'Target output for Test prompt alpha',
        }),
      }),
    );
    expect(resultByTopic.get('alpha')?.error).toBeUndefined();
    expect(resultByTopic.get('gamma')?.error).toContain('Evaluation exceeded max duration');
  });
});
