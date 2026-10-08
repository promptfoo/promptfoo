import './setup';

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import {
  type InMemoryEvaluation,
  InMemoryEvaluationStore,
} from '../../src/evaluator/inMemoryStore';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { EvalEvaluationStore } from '../../src/node/evaluationStore';
import { ResultFailureReason, type TestSuite } from '../../src/types/index';
import { JsonlFileWriter } from '../../src/util/exportToFile/writeToFile';
import { writeMultipleOutputs } from '../../src/util/output';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { EvaluationStore, EvaluatorRuntime } from '../../src/evaluator/runtime';
import type EvalResult from '../../src/models/evalResult';
import type { ApiProvider, EvaluateResult } from '../../src/types/index';

function createResultWriter() {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createRuntime(resultWriters = [createResultWriter()]): EvaluatorRuntime<Eval, EvalResult> {
  return {
    createEvaluationStore: vi.fn((evaluation) => new EvalEvaluationStore(evaluation)),
    createResultWriters: vi.fn().mockReturnValue(resultWriters),
  };
}

function createEvalRecord(): Eval {
  return new Eval({ outputPath: 'results.jsonl' }, { id: randomUUID(), persisted: false });
}

function createInMemoryRuntime(
  store: EvaluationStore<InMemoryEvaluation, EvaluateResult>,
): EvaluatorRuntime<InMemoryEvaluation, EvaluateResult> {
  return {
    createEvaluationStore: vi.fn().mockReturnValue(store),
    createResultWriters: vi.fn().mockReturnValue([]),
  };
}

function createInMemoryEvaluation(overrides: Partial<InMemoryEvaluation> = {}): InMemoryEvaluation {
  return {
    id: 'in-memory-eval',
    config: {},
    persisted: false,
    prompts: [],
    results: [],
    vars: [],
    resultPersistenceFailed: false,
    finalResults: [],
    failedResults: [],
    ...overrides,
  };
}

describeEvaluator('evaluator runtime ports', () => {
  it('preserves captured runtime vars when a checkpoint stays queued on resumed global timeout', async () => {
    const state = createInMemoryEvaluation({ persisted: true });
    const store = new InMemoryEvaluationStore(state);
    const runtime = createInMemoryRuntime(store);
    const controller = new AbortController();
    let phase = 'initial';
    const target: ApiProvider = {
      id: () => 'queued-runtime-vars',
      callApi: vi.fn(async (_prompt, context, options) => {
        context!.vars.observed = `Captured ${context!.vars.index}`;
        options?.onProgress?.({
          output: `Evidence ${phase} ${context!.vars.index}`,
          tokenUsage: { total: 11, numRequests: 1 },
        });
        return new Promise<never>(() => {});
      }),
    };
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('Probe {{index}}')],
      tests: [0, 1].map((index) => ({ vars: { index } })),
    };
    vi.useFakeTimers();
    try {
      const initial = evaluate(
        suite,
        state,
        { maxConcurrency: 2, timeoutMs: 1000, abortSignal: controller.signal },
        runtime,
      );
      await vi.waitFor(() => expect(target.callApi).toHaveBeenCalledTimes(2));
      controller.abort();
      await initial;
      const before = structuredClone(state.results.find((row) => row.testIdx === 1)!);
      expect(before.vars).toEqual({ index: 1, observed: 'Captured 1' });
      expect(before.testCase.vars).toEqual({ index: 1 });
      cliState.resume = true;
      phase = 'timed';
      const resumed = evaluate(
        suite,
        state,
        { maxConcurrency: 1, timeoutMs: 1000, maxEvalTimeMs: 25 },
        runtime,
      );
      await vi.waitFor(() => expect(target.callApi).toHaveBeenCalledTimes(3));
      await vi.advanceTimersByTimeAsync(25);
      await resumed;
      const after = state.results.find((row) => row.testIdx === 1)!;
      expect(after.vars).toEqual(before.vars);
    } finally {
      vi.useRealTimers();
    }
  });
  it('replaces a cancellation checkpoint when resuming an in-memory evaluation', async () => {
    const state = createInMemoryEvaluation({ persisted: true });
    const store = new InMemoryEvaluationStore(state);
    const runtime = createInMemoryRuntime(store);
    const controller = new AbortController();
    let finishProvider!: () => void;
    const provider: ApiProvider = {
      id: () => 'in-memory-checkpoint',
      callApi: vi.fn<ApiProvider['callApi']>((_prompt, _context, options) => {
        options?.onProgress?.({
          output: 'Completed probe',
          tokenUsage: { total: 11, numRequests: 1 },
        });
        return new Promise((resolve) => {
          finishProvider = () => resolve({ output: 'Late response' });
        });
      }),
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
    vi.useFakeTimers();
    try {
      const firstRun = evaluate(
        suite,
        state,
        { abortSignal: controller.signal, timeoutMs: 0 },
        runtime,
      );
      await vi.waitFor(() => expect(provider.callApi).toHaveBeenCalledOnce());
      controller.abort();
      await firstRun;
      expect(state.results).toHaveLength(1);
      expect(state.results[0].metadata?.__promptfoo?.resumable).toBe(true);
      expect(await store.readCompletedIndexPairs()).toEqual(new Set());
      cliState.resume = true;
      vi.mocked(provider.callApi).mockResolvedValue({
        output: 'Resumed response',
        tokenUsage: { total: 7, numRequests: 1 },
      });

      await evaluate(suite, state, { timeoutMs: 0 }, runtime);
      finishProvider();
      await vi.advanceTimersByTimeAsync(0);

      expect(provider.callApi).toHaveBeenCalledTimes(2);
      expect(state.results).toHaveLength(1);
      expect(state.results[0]).toMatchObject({
        success: true,
        response: { output: 'Resumed response' },
      });
      expect(state.prompts[0].metrics).toMatchObject({
        testPassCount: 1,
        testErrorCount: 0,
        tokenUsage: { total: 7, numRequests: 1 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('evaluates with an in-memory store and preserves evaluation identity', async () => {
    const evaluation = createInMemoryEvaluation();
    const store = new InMemoryEvaluationStore(evaluation);
    const runtime = createInMemoryRuntime(store);
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    await expect(evaluate(testSuite, evaluation, {}, runtime)).resolves.toBe(evaluation);

    expect(evaluation.results).toHaveLength(1);
    expect(evaluation.results[0]).toMatchObject({
      success: true,
      testIdx: 0,
      promptIdx: 0,
    });
    expect(evaluation.prompts).toHaveLength(1);
  });

  it('uses the store resume lookup without importing a concrete result model', async () => {
    const evaluation = createInMemoryEvaluation({
      persisted: true,
      results: [
        {
          ...({} as EvaluateResult),
          failureReason: ResultFailureReason.NONE,
          promptIdx: 0,
          testIdx: 0,
        },
      ],
    });
    const store = new InMemoryEvaluationStore(evaluation);
    const readCompletedIndexPairs = vi.spyOn(store, 'readCompletedIndexPairs');
    const runtime = createInMemoryRuntime(store);
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };
    cliState.resume = true;
    cliState.retryMode = false;

    await evaluate(testSuite, evaluation, {}, runtime);

    expect(readCompletedIndexPairs).toHaveBeenCalledWith({ excludeErrors: false });
    expect(evaluation.results).toHaveLength(1);
  });

  it('persists comparison updates through an explicit in-memory runtime', async () => {
    const evaluation = createInMemoryEvaluation({ persisted: true });
    const store = new InMemoryEvaluationStore(evaluation);
    const runtime = createInMemoryRuntime(store);
    const maxScoreProvider: ApiProvider = {
      id: () => 'max-score-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'hello world' }),
    };
    const testSuite: TestSuite = {
      providers: [maxScoreProvider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [
        {
          assert: [{ type: 'contains', value: 'hello' }, { type: 'max-score' }],
        },
      ],
    };

    await evaluate(testSuite, evaluation, {}, runtime);

    const results = [...evaluation.results].sort((left, right) => left.promptIdx - right.promptIdx);
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1]).toMatchObject({
      success: false,
      failureReason: ResultFailureReason.ASSERT,
    });
  });

  it('compares the newly saved response after an in-memory resume recovers a failed write', async () => {
    const state = createInMemoryEvaluation({ persisted: true });
    const store = new InMemoryEvaluationStore(state);
    const runtime = createInMemoryRuntime(store);
    const append = vi
      .spyOn(store, 'appendResult')
      .mockRejectedValueOnce(new Error('Synthetic write failure'));
    const grader: ApiProvider = {
      id: () => 'synthetic-resume-grader',
      callApi: vi.fn(async () => ({ output: '0' })),
    };
    const target: ApiProvider = {
      id: () => 'synthetic-resume-target',
      callApi: vi.fn(async (prompt) => ({ output: `Old ${prompt}` })),
    };
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('first'), toPrompt('second')],
      tests: [
        {
          options: { rubricPrompt: '{{ outputs | dump }}' },
          assert: [{ type: 'select-best', value: 'Choose the best', provider: grader }],
        },
      ],
    };
    cliState.resume = true;
    try {
      await evaluate(suite, state, { maxConcurrency: 1 }, runtime);
      expect(state.failedResults).toHaveLength(1);
      store.recordFinalResult(state.failedResults[0]);
      vi.mocked(target.callApi).mockImplementation(async (prompt) => ({ output: `New ${prompt}` }));
      await evaluate(suite, state, { maxConcurrency: 1 }, runtime);
      expect(grader.callApi).toHaveBeenCalledTimes(2);
      const inputs = JSON.parse(vi.mocked(grader.callApi).mock.calls[1][0]);
      expect(inputs).toHaveLength(2);
      expect(inputs).toEqual(expect.arrayContaining(['New first', 'Old second']));
      expect(state.results.find((row) => row.promptIdx === 0)?.response?.output).toBe('New first');
      expect(state.failedResults).toEqual([]);
      expect(state.finalResults).toEqual([]);
    } finally {
      append.mockRestore();
    }
  });

  it.each([false, true])(
    'drains active cancellation checkpoints before closing JSONL with queued work and metricsFailure=%s',
    async (metricsFailure) => {
      const outputDir = await mkdtemp(path.join(tmpdir(), 'promptfoo-cancel-drain-'));
      const outputPath = path.join(outputDir, 'results.jsonl');
      const writer = new JsonlFileWriter(outputPath);
      const close = vi.spyOn(writer, 'close');
      const write = writer.write.bind(writer);
      let firstWritten!: () => void;
      const firstWrite = new Promise<void>((resolve) => {
        firstWritten = resolve;
      });
      vi.spyOn(writer, 'write').mockImplementation(async (row) => {
        await write(row);
        if ((row as EvaluateResult).testIdx === 0) {
          firstWritten();
        }
      });
      const record = createEvalRecord();
      const append = record.addResult.bind(record);
      let releaseCheckpoint!: () => void;
      const checkpointGate = new Promise<void>((resolve) => {
        releaseCheckpoint = resolve;
      });
      vi.spyOn(record, 'addResult').mockImplementation(async (row, options) => {
        if (row.testIdx === 1) {
          await checkpointGate;
        }
        await append(row, options);
      });
      const controller = new AbortController();
      const appendPrompts = record.addPrompts.bind(record);
      let metricsFailed = false;
      vi.spyOn(record, 'addPrompts').mockImplementation(async (prompts) => {
        if (metricsFailure && controller.signal.aborted && !metricsFailed) {
          metricsFailed = true;
          throw new Error('Synthetic metrics flush failure');
        }
        return appendPrompts(prompts);
      });
      const provider: ApiProvider = {
        id: () => 'synthetic-concurrent-cancellation',
        callApi: vi.fn((_prompt, context, options) => {
          options?.onProgress?.({
            output: `Evidence ${context?.vars.case}`,
            tokenUsage: { total: 11, numRequests: 1 },
          });
          // These raw provider calls never settle, even after cancellation.
          return new Promise<never>(() => {});
        }),
      };
      const suite: TestSuite = {
        providers: [provider],
        prompts: [toPrompt('Probe {{case}}')],
        tests: [0, 1, 2].map((value) => ({ vars: { case: value } })),
      };
      const runtime: EvaluatorRuntime<Eval, EvalResult> = {
        createEvaluationStore: (evaluation) => new EvalEvaluationStore(evaluation),
        createResultWriters: () => [writer],
      };
      vi.useFakeTimers();
      let returned = false;
      const evaluation = evaluate(
        suite,
        record,
        { maxConcurrency: 2, timeoutMs: 0, abortSignal: controller.signal },
        runtime,
      ).then((result) => {
        returned = true;
        return result;
      });
      try {
        await vi.waitFor(() => expect(provider.callApi).toHaveBeenCalledTimes(2));
        controller.abort();
        await firstWrite;
        await vi.advanceTimersByTimeAsync(0);
        expect(close).not.toHaveBeenCalled();
        expect(returned).toBe(false);
        expect(provider.callApi).toHaveBeenCalledTimes(2);
        releaseCheckpoint();
        await evaluation;
        expect(close).toHaveBeenCalledOnce();
        const rows = (await readFile(outputPath, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        expect(rows.map((row) => row.testIdx).sort()).toEqual([0, 1]);
        expect(rows.every((row) => row.failureReason === ResultFailureReason.ERROR)).toBe(true);
        expect(record.getStats()).toMatchObject({
          errors: 2,
          tokenUsage: { total: 22, numRequests: 2 },
        });
      } finally {
        releaseCheckpoint();
        await evaluation;
        vi.useRealTimers();
        await rm(outputDir, { recursive: true, force: true });
      }
    },
  );

  it('exports timeout evidence when the timeout row is the first failed database write', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'promptfoo-timeout-recovery-'));
    const outputPath = path.join(outputDir, 'results.jsonl');
    const resultWriter = createResultWriter();
    const runtime = createRuntime([resultWriter]);
    const record = createEvalRecord();
    const append = vi
      .spyOn(record, 'addResult')
      .mockRejectedValue(new Error('Synthetic write failure'));
    const target: ApiProvider = {
      id: () => 'synthetic-timeout-evidence',
      callApi: vi.fn((_prompt, _context, options) => {
        options?.onProgress?.({
          output: 'Completed probe',
          tokenUsage: { total: 11, numRequests: 1 },
          metadata: { redteamHistory: [{ output: 'Completed probe' }] },
        });
        return new Promise<never>(() => {});
      }),
    };
    const suite: TestSuite = { providers: [target], prompts: [toPrompt('Probe')], tests: [{}] };
    vi.useFakeTimers();
    try {
      const evaluation = evaluate(suite, record, { timeoutMs: 10 }, runtime);
      await vi.advanceTimersByTimeAsync(10);
      await evaluation;
      vi.useRealTimers();
      expect(resultWriter.write).not.toHaveBeenCalled();
      await writeMultipleOutputs([outputPath], record, null);
      const rows = (await readFile(outputPath, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ERROR,
        response: { output: 'Completed probe' },
        metadata: { incomplete: true, redteamHistory: [{ output: 'Completed probe' }] },
        tokenUsage: { total: 11, numRequests: 1 },
      });
    } finally {
      vi.useRealTimers();
      append.mockRestore();
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('requires an explicit runtime for non-default evaluation records', () => {
    if (false) {
      // @ts-expect-error Custom evaluation records must provide their own runtime.
      void evaluate({} as TestSuite, createInMemoryEvaluation(), {});
    }
  });

  it('delegates result side effects and closes writers during cleanup', async () => {
    const resultWriter = createResultWriter();
    const runtime = createRuntime([resultWriter]);
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };
    const evalRecord = createEvalRecord();
    const appendResult = vi.spyOn(evalRecord, 'addResult');

    await evaluate(testSuite, evalRecord, {}, runtime);

    expect(runtime.createEvaluationStore).toHaveBeenCalledWith(evalRecord);
    expect(runtime.createResultWriters).toHaveBeenCalledWith('results.jsonl', { append: false });
    expect(appendResult).toHaveBeenCalledOnce();
    expect(resultWriter.write).toHaveBeenCalledOnce();
    expect(appendResult.mock.invocationCallOrder[0]).toBeLessThan(
      resultWriter.write.mock.invocationCallOrder[0],
    );
    expect(resultWriter.close).toHaveBeenCalledOnce();
  });

  it('passes resume append semantics to result writers', async () => {
    const runtime = createRuntime([]);
    const testSuite: TestSuite = {
      providers: [],
      prompts: [],
      tests: [],
    };
    cliState.resume = true;

    await evaluate(testSuite, createEvalRecord(), {}, runtime);

    expect(runtime.createResultWriters).toHaveBeenCalledWith('results.jsonl', { append: true });
  });

  it('continues streaming output when result persistence fails', async () => {
    const resultWriter = createResultWriter();
    const runtime = createRuntime([resultWriter]);
    const evalRecord = createEvalRecord();
    vi.spyOn(evalRecord, 'addResult').mockRejectedValue(new Error('database unavailable'));
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    await expect(evaluate(testSuite, evalRecord, {}, runtime)).resolves.toBeDefined();

    expect(resultWriter.write).toHaveBeenCalledOnce();
    expect(resultWriter.close).toHaveBeenCalledOnce();
  });

  it('rejects output failures after closing writers', async () => {
    const resultWriter = createResultWriter();
    resultWriter.write.mockRejectedValue(new Error('output unavailable'));
    const runtime = createRuntime([resultWriter]);
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    await expect(evaluate(testSuite, createEvalRecord(), {}, runtime)).rejects.toThrow(
      'output unavailable',
    );

    expect(resultWriter.close).toHaveBeenCalledOnce();
  });

  it('attempts every writer and recovers a close failure when results persisted', async () => {
    const failingWriter = createResultWriter();
    failingWriter.close.mockRejectedValue(new Error('close unavailable'));
    const healthyWriter = createResultWriter();
    const runtime = createRuntime([failingWriter, healthyWriter]);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      // Results persisted to the DB, so the post-run rewrite regenerates the JSONL from it;
      // a close error is logged, not fatal to an otherwise-successful run.
      await expect(evaluate(testSuite, createEvalRecord(), {}, runtime)).resolves.toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('close unavailable'));
    } finally {
      warnSpy.mockRestore();
    }

    expect(failingWriter.close).toHaveBeenCalledOnce();
    expect(healthyWriter.close).toHaveBeenCalledOnce();
  });

  it('surfaces a close failure when result persistence also failed', async () => {
    const failingWriter = createResultWriter();
    failingWriter.close.mockRejectedValue(new Error('close unavailable'));
    const runtime = createRuntime([failingWriter]);
    const evalRecord = createEvalRecord();
    // Persistence failed, so the streamed JSONL is the only copy of the results and a
    // close error (possible truncation) must not be swallowed.
    vi.spyOn(evalRecord, 'addResult').mockRejectedValue(new Error('database unavailable'));
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    await expect(evaluate(testSuite, evalRecord, {}, runtime)).rejects.toThrow('close unavailable');

    expect(failingWriter.close).toHaveBeenCalledOnce();
  });

  it.each([0, 1000])(
    'streams user cancellation once with timeoutMs=%s and ignores late completion',
    async (timeoutMs) => {
      vi.useFakeTimers();
      const resultWriter = createResultWriter();
      const runtime = createRuntime([resultWriter]);
      const evalRecord = createEvalRecord();
      const appendResult = vi.spyOn(evalRecord, 'addResult');
      const controller = new AbortController();
      let finishProvider!: () => void;
      const provider: ApiProvider = {
        id: () => 'checkpointing-provider',
        callApi: vi.fn<ApiProvider['callApi']>((_prompt, _context, options) => {
          options?.onProgress?.({
            output: 'Completed probe',
            tokenUsage: { total: 11, numRequests: 1 },
            metadata: { redteamHistory: [{ output: 'Completed probe' }] },
          });
          return new Promise((resolve) => {
            finishProvider = () => {
              const response = { output: 'Late completion' };
              options?.onProgress?.(response);
              resolve(response);
            };
          });
        }),
      };
      const testSuite: TestSuite = {
        providers: [provider],
        prompts: [toPrompt('Test prompt')],
        tests: [{}],
      };

      try {
        const evaluation = evaluate(
          testSuite,
          evalRecord,
          { abortSignal: controller.signal, timeoutMs },
          runtime,
        );
        await vi.waitFor(() => expect(provider.callApi).toHaveBeenCalledOnce());
        controller.abort();
        await evaluation;

        expect(appendResult).toHaveBeenCalledOnce();
        expect(resultWriter.write).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            success: false,
            score: 0,
            failureReason: ResultFailureReason.ERROR,
            response: expect.objectContaining({
              output: 'Completed probe',
              tokenUsage: expect.objectContaining({ total: 11, numRequests: 1 }),
            }),
            metadata: expect.objectContaining({
              incomplete: true,
              redteamHistory: [{ output: 'Completed probe' }],
            }),
          }),
        );
        expect(resultWriter.close).toHaveBeenCalledOnce();

        finishProvider();
        await vi.advanceTimersByTimeAsync(0);
        expect(appendResult).toHaveBeenCalledOnce();
        expect(resultWriter.write).toHaveBeenCalledOnce();
        expect(resultWriter.close).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('persists per-call timeout rows without streaming them', async () => {
    vi.useFakeTimers();
    const resultWriter = createResultWriter();
    const runtime = createRuntime([resultWriter]);
    const evalRecord = createEvalRecord();
    const appendResult = vi.spyOn(evalRecord, 'addResult');
    const slowProvider: ApiProvider = {
      id: () => 'slow-provider',
      callApi: vi.fn<ApiProvider['callApi']>((_prompt, _context, options) => {
        return new Promise<never>((_resolve, reject) => {
          const rejectAbort = () => {
            const error = new Error('Operation aborted');
            error.name = 'AbortError';
            reject(error);
          };
          if (options?.abortSignal?.aborted) {
            rejectAbort();
            return;
          }
          options?.abortSignal?.addEventListener('abort', rejectAbort, { once: true });
        });
      }),
    };
    const testSuite: TestSuite = {
      providers: [slowProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      const evaluation = evaluate(testSuite, evalRecord, { timeoutMs: 10 }, runtime);
      await vi.advanceTimersByTimeAsync(10);
      await evaluation;

      expect(appendResult).toHaveBeenCalledOnce();
      expect(resultWriter.write).not.toHaveBeenCalled();
      expect(resultWriter.close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
