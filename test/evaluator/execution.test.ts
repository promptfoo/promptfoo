import './setup';

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { __resetPromptConversationCacheForTests, evaluate, runEval } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { providerRegistry } from '../../src/providers/providerRegistry';
import {
  type ApiProvider,
  type ProviderResponse,
  ResultFailureReason,
  type TestSuite,
} from '../../src/types/index';
import { JsonlFileWriter } from '../../src/util/exportToFile/writeToFile';
import { sleep } from '../../src/util/time';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { transform } from '../../src/util/transform';
import { mockProcessEnv } from '../util/utils';
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

    expect(sleep).not.toHaveBeenCalled();
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('closes JSONL writers after evaluation', async () => {
    const outputPath = path.join(os.tmpdir(), `promptfoo-evaluator-${randomUUID()}.jsonl`);
    const closeSpy = vi.spyOn(JsonlFileWriter.prototype, 'close');
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      fs.writeFileSync(outputPath, 'stale row\n');
      const evalRecord = new Eval({ outputPath });
      await evaluate(testSuite, evalRecord, {});

      expect(closeSpy).toHaveBeenCalledOnce();
      const output = fs.readFileSync(outputPath, 'utf8');
      expect(output).not.toContain('stale row');
      expect(output.trim()).not.toBe('');
    } finally {
      closeSpy.mockRestore();
      fs.rmSync(outputPath, { force: true });
    }
  });

  it('continues cleanup after a JSONL writer fails to close', async () => {
    const outputPath = path.join(os.tmpdir(), `promptfoo-evaluator-${randomUUID()}.jsonl`);
    const originalClose = JsonlFileWriter.prototype.close;
    const closeSpy = vi
      .spyOn(JsonlFileWriter.prototype, 'close')
      .mockImplementationOnce(async function (this: JsonlFileWriter) {
        await originalClose.call(this);
        throw new Error('simulated close failure');
      });
    const shutdownSpy = vi.spyOn(providerRegistry, 'shutdownAll').mockResolvedValue();
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      const evalRecord = new Eval({ outputPath });
      await expect(evaluate(testSuite, evalRecord, {})).rejects.toThrow('simulated close failure');
      expect(shutdownSpy).toHaveBeenCalledOnce();
    } finally {
      closeSpy.mockRestore();
      shutdownSpy.mockRestore();
      fs.rmSync(outputPath, { force: true });
    }
  });

  it('appends JSONL rows when resuming an evaluation', async () => {
    const outputPath = path.join(os.tmpdir(), `promptfoo-evaluator-${randomUUID()}.jsonl`);
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      fs.writeFileSync(outputPath, 'existing row\n');
      cliState.resume = true;

      const evalRecord = new Eval({ outputPath });
      await evaluate(testSuite, evalRecord, {});

      const output = fs.readFileSync(outputPath, 'utf8');
      expect(output).toContain('existing row');
      expect(output.trim().split('\n')).toHaveLength(2);
    } finally {
      cliState.resume = false;
      fs.rmSync(outputPath, { force: true });
    }
  });

  it('keeps raw SVG text available to llm-rubric judges while indexing media metadata', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('svg-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: svg,
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn(async (prompt) => {
        const messages = JSON.parse(String(prompt)) as Array<{ content: string }>;
        const judgeInput = messages.at(-1)?.content;
        expect(judgeInput).toContain(svg);
        expect(judgeInput).not.toContain('promptfoo://blob/');
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: 'saw raw SVG' }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Generate SVG')],
      tests: [
        {
          assert: [{ type: 'llm-rubric', value: 'Output should be SVG', provider: judge }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const completedEval = await evaluate(testSuite, evalRecord, {});
    const results = await completedEval.getResults();

    expect(judge.callApi).toHaveBeenCalledTimes(1);
    expect(results[0].response).toEqual(
      expect.objectContaining({
        output: svg,
        metadata: expect.objectContaining({
          blobUris: [expect.stringMatching(/^promptfoo:\/\/blob\/[a-f0-9]{64}$/)],
        }),
      }),
    );
  });

  type ConcurrencyProbe = {
    maxActiveCalls: number;
    callApi: ReturnType<typeof vi.fn>;
  };

  async function runConcurrencyProbe(
    rawPrompt: string,
    testCount = 4,
    providerOverrides: Partial<ApiProvider> = {},
  ): Promise<ConcurrencyProbe> {
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
      let resolveFallback!: () => void;
      const fallback = new Promise<void>((r) => {
        resolveFallback = r;
      });
      const fallbackHandle = setTimeout(() => resolveFallback(), 100);
      try {
        await Promise.race([holdPromise, fallback]);
      } finally {
        clearTimeout(fallbackHandle);
      }
      activeCalls -= 1;
      return {
        output: String(prompt),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      };
    });
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi,
      ...providerOverrides,
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

  it('persists configured variable order when concurrent rows complete out of order', async () => {
    let releaseFirst!: () => void;
    const waitForSecond = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let invocation = 0;
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('out-of-order-provider'),
      callApi: vi.fn(async () => {
        invocation += 1;
        if (invocation === 1) {
          await waitForSecond;
        }
        return {
          output: 'ok',
          tokenUsage: { total: 1, prompt: 1, completion: 0, cached: 0, numRequests: 1 },
        };
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Static prompt')],
      tests: [{ vars: { zebra: 'first' } }, { vars: { apple: 'second' } }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const addResult = evalRecord.addResult.bind(evalRecord);
    vi.spyOn(evalRecord, 'addResult').mockImplementation(async (row) => {
      await addResult(row);
      if (row.testIdx === 1) {
        releaseFirst();
      }
    });

    await evaluate(testSuite, evalRecord, { maxConcurrency: 2 });

    expect(evalRecord.vars).toEqual(['zebra', 'apple']);
  });

  it('forces concurrency to 1 for real _conversation template references', async () => {
    const { maxActiveCalls } = await runConcurrencyProbe(
      '{{ {"history": _conversation}["history"][0].output }} {{ question }}',
      2,
    );

    expect(maxActiveCalls).toBe(1);
  });

  it('forces concurrency to 1 for browser providers with persistent sessions', async () => {
    const { maxActiveCalls } = await runConcurrencyProbe('Ask: {{ question }}', 2, {
      config: { persistSession: true },
      id: vi.fn().mockReturnValue('browser-provider'),
    });

    expect(maxActiveCalls).toBe(1);
  });

  it('keeps non-persistent browser provider calls concurrent', async () => {
    const { maxActiveCalls } = await runConcurrencyProbe('Ask: {{ question }}', 2, {
      config: { persistSession: false },
      id: vi.fn().mockReturnValue('browser-provider'),
    });

    expect(maxActiveCalls).toBeGreaterThan(1);
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

  it('does not let late aborted provider responses mutate shared eval state', async () => {
    const prompt = toPrompt('{{ topic }}');
    const conversations = {};
    const registers = {};
    const abortController = new AbortController();
    abortController.abort();

    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('late-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'late output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    const rows = await runEval({
      abortSignal: abortController.signal,
      conversations,
      delay: 0,
      isRedteam: false,
      prompt,
      promptIdx: 0,
      provider,
      registers,
      repeatIndex: 0,
      test: {
        options: { storeOutputAs: 'lateValue' },
        vars: { topic: 'first' },
      },
      testIdx: 0,
      testSuite: {
        providers: [provider],
        prompts: [prompt],
        tests: [],
      },
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        failureReason: ResultFailureReason.ERROR,
        success: false,
      }),
    );
    expect(rows[0].error).toContain('Operation cancelled');
    expect(conversations).toEqual({});
    expect(registers).toEqual({});
  });

  it('persists updated prompt metrics between serial eval steps for live result refreshes', async () => {
    let releaseSecondCall!: () => void;
    let markSecondCallStarted!: () => void;
    const secondCallStarted = new Promise<void>((resolve) => {
      markSecondCallStarted = resolve;
    });

    let callCount = 0;
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn(async () => {
        callCount += 1;
        if (callCount === 2) {
          markSecondCallStarted();
          await new Promise<void>((resolve) => {
            releaseSecondCall = resolve;
          });
        }

        return {
          output: 'Test output',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        };
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ options: { runSerially: true } }, { options: { runSerially: true } }],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const addPromptsSpy = vi.spyOn(evalRecord, 'addPrompts');
    const evalPromise = evaluate(testSuite, evalRecord, { maxConcurrency: 1, timeoutMs: 10000 });

    await secondCallStarted;

    expect(addPromptsSpy).toHaveBeenCalledTimes(2);
    expect(addPromptsSpy.mock.calls[1][0][0].metrics?.testPassCount).toBe(1);
    const refreshedEval = await Eval.findById(evalRecord.id);
    expect(refreshedEval?.prompts[0].metrics?.testPassCount).toBe(1);

    releaseSecondCall();
    await evalPromise;
  });

  it('throttles rapid prompt metric persistence between serial eval steps', async () => {
    let releaseThirdCall!: () => void;
    let markThirdCallStarted!: () => void;
    const thirdCallStarted = new Promise<void>((resolve) => {
      markThirdCallStarted = resolve;
    });
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);

    let callCount = 0;
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn(async () => {
        callCount += 1;
        if (callCount === 3) {
          markThirdCallStarted();
          await new Promise<void>((resolve) => {
            releaseThirdCall = resolve;
          });
        }

        return {
          output: 'Test output',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        };
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        { options: { runSerially: true } },
        { options: { runSerially: true } },
        { options: { runSerially: true } },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const addPromptsSpy = vi.spyOn(evalRecord, 'addPrompts');
    const evalPromise = evaluate(testSuite, evalRecord, { maxConcurrency: 1, timeoutMs: 10000 });

    await thirdCallStarted;

    const promptWriteCountDuringThirdCall = addPromptsSpy.mock.calls.length;
    const refreshedEval = await Eval.findById(evalRecord.id);
    const persistedPassCountDuringThirdCall = refreshedEval?.prompts[0].metrics?.testPassCount;

    releaseThirdCall();
    await evalPromise;
    dateNowSpy.mockRestore();

    expect(promptWriteCountDuringThirdCall).toBe(2);
    expect(persistedPassCountDuringThirdCall).toBe(1);
  });

  it('persists updated prompt metrics between grouped eval steps without deferred grading', async () => {
    let releaseSecondCall!: () => void;
    let markSecondCallStarted!: () => void;
    const secondCallStarted = new Promise<void>((resolve) => {
      markSecondCallStarted = resolve;
    });

    let callCount = 0;
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn(async () => {
        callCount += 1;
        if (callCount === 2) {
          markSecondCallStarted();
          await new Promise<void>((resolve) => {
            releaseSecondCall = resolve;
          });
        }

        return {
          output: 'Test output',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        };
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}, {}],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const addPromptsSpy = vi.spyOn(evalRecord, 'addPrompts');
    const evalPromise = evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

    await secondCallStarted;

    expect(addPromptsSpy).toHaveBeenCalledTimes(2);
    expect(addPromptsSpy.mock.calls[1][0][0].metrics?.testPassCount).toBe(1);
    const refreshedEval = await Eval.findById(evalRecord.id);
    expect(refreshedEval?.prompts[0].metrics?.testPassCount).toBe(1);

    releaseSecondCall();
    await evalPromise;
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
      expect(evalRecord.resultPersistenceFailed).toBe(true);
      expect(evalRecord.hasResultPersistenceFailure({ promptIdx: 0, testIdx: 0 })).toBe(true);
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

  it('writes per-test timeout rows to jsonl output', async () => {
    vi.useFakeTimers();
    const outputPath = `/tmp/pr6344-per-test-timeout-${randomUUID()}.jsonl`;
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('hanging-provider'),
      callApi: vi.fn(
        () =>
          new Promise<ProviderResponse>(() => {
            // Keep the provider pending so the per-test timeout path writes the row.
          }),
      ),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };
    const evalRecord = await Eval.create({ outputPath }, testSuite.prompts, { id: randomUUID() });

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs: 0,
        timeoutMs: 50,
      });
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      const lines = fs.readFileSync(outputPath, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation timed out after 50ms'),
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
      );
    } finally {
      fs.rmSync(outputPath, { force: true });
      vi.useRealTimers();
    }
  });

  it('should honor timeoutMs: 0 when the default eval timeout is configured', async () => {
    vi.useFakeTimers();
    const restoreEnv = mockProcessEnv({ PROMPTFOO_EVAL_TIMEOUT_MS: '5' });
    const mockAddResult = vi.fn().mockResolvedValue(undefined);

    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('slow-provider'),
      callApi: vi.fn(
        () =>
          new Promise<ProviderResponse>((resolve) => {
            setTimeout(() => {
              resolve({
                output: 'Slow response',
                tokenUsage: createEmptyTokenUsage(),
              });
            }, 25);
          }),
      ),
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
          successes: 1,
          failures: 0,
          errors: 0,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      const evalPromise = evaluate(testSuite, mockEval as unknown as Eval, {
        timeoutMs: 0,
        maxEvalTimeMs: 0,
      });
      await vi.advanceTimersByTimeAsync(25);
      await evalPromise;

      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({ output: 'Slow response' }),
          success: true,
        }),
      );
      expect(mockAddResult).not.toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation timed out after 5ms'),
        }),
      );
    } finally {
      restoreEnv();
      vi.useRealTimers();
    }
  });

  it('honors maxEvalTimeMs values larger than Node single-timer limits', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        return new Promise(() => {});
      }
      return context;
    });
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
      extensions: ['file://never-finishes.js:beforeAll'],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const maxEvalTimeMs = 2_147_483_647 + 1_000;

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs,
        timeoutMs: 0,
      });
      let settled = false;
      void evalPromise.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(2_147_483_647);
      expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === 2_147_483_647)).toBe(true);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1_000);
      await evalPromise;
      const summary = await evalRecord.toEvaluateSummary();
      expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === 1_000)).toBe(true);
      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          error: expect.stringContaining(`Evaluation exceeded max duration of ${maxEvalTimeMs}ms`),
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
      );
      expect(provider.callApi).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('clears the max eval timer when evaluation throws before finalization', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      await expect(
        evaluate(testSuite, evalRecord, {
          maxEvalTimeMs: 10_000,
          progressCallback: () => {
            throw new Error('progress callback failed');
          },
          timeoutMs: 0,
        }),
      ).rejects.toThrow('progress callback failed');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      const maxEvalTimerResult = setTimeoutSpy.mock.results.find(
        (_result, index) => setTimeoutSpy.mock.calls[index]?.[1] === 10_000,
      );
      expect(maxEvalTimerResult?.value).toBeDefined();
      expect(clearTimeoutSpy).toHaveBeenCalledWith(maxEvalTimerResult?.value);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('starts explicit maxEvalTimeMs before setup hooks finish', async () => {
    vi.useFakeTimers();
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        return new Promise(() => {});
      }
      return context;
    });
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
      extensions: ['file://slow-setup.js:beforeAll'],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs: 50,
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(50);

      await evalPromise;
      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation exceeded max duration of 50ms'),
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
      );
      expect(provider.callApi).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not persist raw vars when setup times out during transformVars', async () => {
    vi.useFakeTimers();
    vi.mocked(transform).mockImplementationOnce(
      async () => new Promise<Record<string, string>>(() => {}),
    );
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('{{ derived }}')],
      defaultTest: {
        options: {
          transformVars: 'vars',
        },
      },
      tests: [{ vars: { raw: 'untransformed' } }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs: 50,
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(0);
      expect(provider.callApi).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not duplicate completed resume rows when setup timeout precedes resume filtering', async () => {
    vi.useFakeTimers();
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Completed output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxEvalTimeMs: 0, timeoutMs: 0 });
    const completedIndexSpy = vi
      .spyOn(EvalResult, 'getCompletedIndexPairs')
      .mockImplementation(() => new Promise<Set<string>>(() => {}));

    try {
      cliState.resume = true;
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs: 50,
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          response: expect.objectContaining({ output: 'Completed output' }),
          success: true,
        }),
      );
    } finally {
      cliState.resume = false;
      completedIndexSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('protects setup with an automatic max timeout before row sizing completes', async () => {
    vi.useFakeTimers();
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        return new Promise(() => {});
      }
      return context;
    });
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
      extensions: ['file://never-finishes.js:beforeAll'],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      const evalPromise = evaluate(testSuite, evalRecord, { timeoutMs: 0 });
      await vi.advanceTimersByTimeAsync(240_000);
      await evalPromise;

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation exceeded max duration of 240000ms'),
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
      );
      expect(provider.callApi).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns completed rows when an afterAll hook exceeds maxEvalTimeMs', async () => {
    vi.useFakeTimers();
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterAll') {
        return new Promise(() => {});
      }
      return context;
    });
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
      extensions: ['file://never-finishes.js:afterAll'],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs: 50,
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(provider.callApi).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          response: expect.objectContaining({ output: 'Test output' }),
          success: true,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not persist rows whose afterEach hook finishes after maxEvalTimeMs', async () => {
    vi.useFakeTimers();
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterEach') {
        return new Promise((resolve) => {
          setTimeout(() => resolve(context), 100);
        });
      }
      return context;
    });
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Late afterEach output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
      extensions: ['file://slow-after-each.js:afterEach'],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs: 50,
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(provider.callApi).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      await vi.advanceTimersByTimeAsync(100);
      await vi.runOnlyPendingTimersAsync();

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.stats).toEqual(
        expect.objectContaining({ errors: 1, failures: 0, successes: 0 }),
      );
      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation exceeded max duration of 50ms'),
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
      );
      expect(summary.results[0].response?.output).not.toBe('Late afterEach output');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses longer redteam timeout defaults for direct redteam suite evaluation', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
    const mockAddResult = vi.fn().mockResolvedValue(undefined);

    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
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
          successes: 1,
          failures: 0,
          errors: 0,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
      redteam: {} as TestSuite['redteam'],
    };

    try {
      await evaluate(testSuite, mockEval as unknown as Eval, {
        maxConcurrency: 1,
      });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'per-test=4500000ms, max=4560000ms, steps=1, serialSteps=0, concurrency=1',
        ),
      );
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('uses redteam timeout defaults for exported generated redteam tests', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ metadata: { pluginId: 'harmful:privacy', goal: 'Protect user data' } }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'per-test=4500000ms, max=4560000ms, steps=1, serialSteps=0, concurrency=1',
        ),
      );
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('counts runSerially steps in automatically calculated max eval duration', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ options: { runSerially: true } }, { options: { runSerially: true } }, {}],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      await evaluate(testSuite, evalRecord, { maxConcurrency: 4, timeoutMs: 0 });
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('per-test=0ms, max=600000ms, steps=3, serialSteps=2'),
      );
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('does not persist a row cancelled by an external abortSignal when timeoutMs is set', async () => {
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

      expect(mockAddResult).not.toHaveBeenCalled();
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

  it('writes max-duration results when abort-aware providers are cancelled', async () => {
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
          error: expect.stringContaining('Evaluation exceeded max duration of 100ms'),
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

  it('returns max-duration results when a provider ignores abort signals', async () => {
    vi.useFakeTimers();
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('non-cooperative-provider'),
      callApi: vi.fn(() => new Promise<ProviderResponse>(() => {})),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs: 50,
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation exceeded max duration of 50ms'),
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes max-duration timeout rows to jsonl output', async () => {
    vi.useFakeTimers();
    const outputPath = `/tmp/pr6344-max-duration-timeout-${randomUUID()}.jsonl`;
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('non-cooperative-provider'),
      callApi: vi.fn(() => new Promise<ProviderResponse>(() => {})),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };
    const evalRecord = await Eval.create({ outputPath }, testSuite.prompts, { id: randomUUID() });

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs: 50,
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      const lines = fs.readFileSync(outputPath, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation exceeded max duration of 50ms'),
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
      );
    } finally {
      fs.rmSync(outputPath, { force: true });
      vi.useRealTimers();
    }
  });

  it('converts a row to max-duration failure when JSONL finalization crosses the deadline', async () => {
    vi.useFakeTimers();
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('completed-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Completed output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };
    const evalRecord = await Eval.create(
      { outputPath: '/tmp/pr6344-timeout-row.jsonl' },
      testSuite.prompts,
      { id: randomUUID() },
    );
    let releaseFileWrite!: () => void;
    let notifyFileWrite!: () => void;
    const fileWriteStarted = new Promise<void>((resolve) => {
      notifyFileWrite = resolve;
    });
    const writeSpy = vi.spyOn(JsonlFileWriter.prototype, 'write').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          notifyFileWrite();
          releaseFileWrite = resolve;
        }),
    );

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxEvalTimeMs: 50,
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(0);
      await fileWriteStarted;
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.stats).toEqual(
        expect.objectContaining({ errors: 1, failures: 0, successes: 0 }),
      );
      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation exceeded max duration of 50ms'),
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
      );
    } finally {
      releaseFileWrite?.();
      writeSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('returns max-duration results when grouped grading ignores abort signals', async () => {
    vi.useFakeTimers();
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Target output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const judge: ApiProvider = {
      id: vi.fn().mockReturnValue('non-cooperative-judge'),
      callApi: vi.fn(() => new Promise<ProviderResponse>(() => {})),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ assert: [{ type: 'llm-rubric', value: 'Judge output', provider: judge }] }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      const evalPromise = evaluate(testSuite, evalRecord, {
        maxConcurrency: 1,
        maxEvalTimeMs: 50,
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(judge.callApi).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(50);
      await evalPromise;

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation exceeded max duration of 50ms'),
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies maxEvalTimeMs to select-best comparison grading', async () => {
    vi.useFakeTimers();

    const matchers = await import('../../src/matchers/comparison');
    const { getProviderCallExecutionContext } = await import(
      '../../src/scheduler/providerCallExecutionContext'
    );

    let comparisonTimer: NodeJS.Timeout | null = null;
    let evalPromise: Promise<Eval> | undefined;
    let observedComparisonAbortSignal: AbortSignal | undefined;
    const matchesSelectBestSpy = vi.spyOn(matchers, 'matchesSelectBest').mockImplementation(() => {
      observedComparisonAbortSignal = getProviderCallExecutionContext()?.abortSignal;
      return new Promise((resolve, reject) => {
        comparisonTimer = setTimeout(() => {
          resolve([
            { pass: true, score: 1, reason: 'Selected as best' },
            { pass: false, score: 0, reason: 'Not selected' },
          ]);
        }, 1_000);

        observedComparisonAbortSignal?.addEventListener(
          'abort',
          () => {
            if (comparisonTimer) {
              clearTimeout(comparisonTimer);
            }
            reject(new Error('comparison aborted'));
          },
          { once: true },
        );
      });
    });
    const targetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Target output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    const testSuite: TestSuite = {
      providers: [targetProvider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [
        {
          assert: [
            { type: 'contains', value: 'Target', metric: 'target_contains' },
            { type: 'select-best', value: 'pick the best response' },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      evalPromise = evaluate(testSuite, evalRecord, { maxEvalTimeMs: 50 });

      await vi.advanceTimersByTimeAsync(0);
      expect(matchesSelectBestSpy).toHaveBeenCalledTimes(1);
      expect(observedComparisonAbortSignal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(50);
      expect(observedComparisonAbortSignal?.aborted).toBe(true);

      await evalPromise;
      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(2);
      expect(summary.stats).toEqual(
        expect.objectContaining({ errors: 2, failures: 0, successes: 0 }),
      );
      expect(
        summary.results.every(
          (result) =>
            result.error?.includes('during comparison grading') &&
            result.failureReason === ResultFailureReason.ERROR &&
            !result.success &&
            result.score === 0 &&
            Object.keys(result.namedScores).length === 0 &&
            result.gradingResult === null,
        ),
      ).toBe(true);
      if (!('prompts' in summary)) {
        throw new Error('Expected V3 summary with prompt metrics');
      }
      expect(summary.prompts.map((prompt) => prompt.metrics)).toEqual([
        expect.objectContaining({
          assertFailCount: 0,
          assertPassCount: 0,
          namedScores: {},
          namedScoresCount: {},
          namedScoreWeights: {},
          score: 0,
          testErrorCount: 1,
          testFailCount: 0,
          testPassCount: 0,
        }),
        expect.objectContaining({
          assertFailCount: 0,
          assertPassCount: 0,
          namedScores: {},
          namedScoresCount: {},
          namedScoreWeights: {},
          score: 0,
          testErrorCount: 1,
          testFailCount: 0,
          testPassCount: 0,
        }),
      ]);
    } finally {
      await vi.runOnlyPendingTimersAsync();
      await evalPromise?.catch(() => undefined);
      matchesSelectBestSpy.mockRestore();
      if (comparisonTimer) {
        clearTimeout(comparisonTimer);
      }
      vi.useRealTimers();
    }
  });

  it('keeps late select-best grading pending for max-duration timeout conversion', async () => {
    vi.useFakeTimers();

    const matchers = await import('../../src/matchers/comparison');
    const matchesSelectBestSpy = vi.spyOn(matchers, 'matchesSelectBest').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve([
              { pass: true, score: 1, reason: 'Selected as best' },
              { pass: false, score: 0, reason: 'Not selected' },
            ]);
          }, 100);
        }),
    );
    const targetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Target output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [targetProvider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [
        {
          assert: [
            { type: 'contains', value: 'Target' },
            { type: 'select-best', value: 'pick the best response' },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    let evalPromise: Promise<Eval> | undefined;

    try {
      evalPromise = evaluate(testSuite, evalRecord, { maxEvalTimeMs: 50 });

      await vi.advanceTimersByTimeAsync(0);
      expect(matchesSelectBestSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);
      await evalPromise;

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.stats).toEqual(
        expect.objectContaining({ errors: 2, failures: 0, successes: 0 }),
      );
      expect(
        summary.results.every(
          (result) =>
            result.error?.includes('during comparison grading') &&
            result.failureReason === ResultFailureReason.ERROR &&
            !result.success,
        ),
      ).toBe(true);
    } finally {
      await vi.runOnlyPendingTimersAsync();
      await evalPromise?.catch(() => undefined);
      matchesSelectBestSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('keeps late max-score grading pending for max-duration timeout conversion', async () => {
    vi.useFakeTimers();

    const matchers = await import('../../src/matchers/comparison');
    const selectMaxScoreSpy = vi.spyOn(matchers, 'selectMaxScore').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve([
              { pass: true, score: 1, reason: 'Selected as highest scoring output' },
              { pass: false, score: 0, reason: 'Not selected' },
            ]);
          }, 100);
        }),
    );
    const targetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Target output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [targetProvider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [
        {
          assert: [
            { type: 'contains', value: 'Target' },
            { type: 'max-score', value: { method: 'average' } },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    let evalPromise: Promise<Eval> | undefined;

    try {
      evalPromise = evaluate(testSuite, evalRecord, { maxEvalTimeMs: 50 });

      await vi.advanceTimersByTimeAsync(0);
      expect(selectMaxScoreSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);
      await evalPromise;

      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.stats).toEqual(
        expect.objectContaining({ errors: 2, failures: 0, successes: 0 }),
      );
      expect(
        summary.results.every(
          (result) =>
            result.error?.includes('during comparison grading') &&
            result.failureReason === ResultFailureReason.ERROR &&
            !result.success,
        ),
      ).toBe(true);
    } finally {
      await vi.runOnlyPendingTimersAsync();
      await evalPromise?.catch(() => undefined);
      selectMaxScoreSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('budgets select-best comparison rows in automatic max timeout sizing', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
    const matchers = await import('../../src/matchers/comparison');
    const matchesSelectBestSpy = vi.spyOn(matchers, 'matchesSelectBest').mockResolvedValue([
      { pass: true, score: 1, reason: 'Selected as best' },
      { pass: false, score: 0, reason: 'Not selected' },
    ]);
    const provider: ApiProvider = {
      id: vi.fn().mockReturnValue('target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Target output',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [{ assert: [{ type: 'select-best', value: 'pick the best response' }] }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    try {
      await evaluate(testSuite, evalRecord, {
        maxConcurrency: 2,
        timeoutMs: 0,
      });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'per-test=0ms, max=420000ms, steps=2, serialSteps=0, concurrency=2, comparisonSteps=1',
        ),
      );
    } finally {
      matchesSelectBestSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });

  it('does not persist queued grouped grading after the max-duration deadline', async () => {
    vi.useFakeTimers();

    const results: any[] = [];
    const waitForTarget = (ms: number, signal?: AbortSignal) => {
      let resolveSleep!: () => void;
      let rejectSleep!: (err: Error) => void;
      const sleepPromise = new Promise<void>((resolve, reject) => {
        resolveSleep = resolve;
        rejectSleep = reject;
      });
      const timeout = setTimeout(() => resolveSleep(), ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          rejectSleep(new Error('target aborted'));
        },
        { once: true },
      );
      return sleepPromise;
    };
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
        timeoutMs: 0,
      });
      await vi.advanceTimersByTimeAsync(40);
      await vi.advanceTimersByTimeAsync(15);
      await evalPromise;
    } finally {
      vi.useRealTimers();
    }

    const resultByTopic = new Map(results.map((result) => [result.vars.topic, result]));

    expect(results).toHaveLength(3);
    expect(judge.callApi).not.toHaveBeenCalled();
    expect(resultByTopic.get('alpha')).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Evaluation exceeded max duration'),
        failureReason: ResultFailureReason.ERROR,
        success: false,
      }),
    );
    expect(resultByTopic.get('gamma')?.error).toContain('Evaluation exceeded max duration');
  });
});
