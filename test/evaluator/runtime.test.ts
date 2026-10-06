import './setup';

import { randomUUID } from 'node:crypto';

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
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { EvaluationStore, EvaluatorRuntime } from '../../src/evaluator/runtime';
import type EvalResult from '../../src/models/evalResult';
import type { ApiProvider, EvaluateResult, Prompt } from '../../src/types/index';

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
  it.each([undefined, 10000])(
    'evaluates with an in-memory store and preserves identity with deadline %s',
    async (maxEvalTimeMs) => {
      if (maxEvalTimeMs) {
        vi.useFakeTimers();
      }
      const timeoutSpy = maxEvalTimeMs ? vi.spyOn(globalThis, 'setTimeout') : undefined;
      const clearTimeoutSpy = maxEvalTimeMs ? vi.spyOn(globalThis, 'clearTimeout') : undefined;
      const evaluation = createInMemoryEvaluation();
      const store = new InMemoryEvaluationStore(evaluation);
      const runtime = createInMemoryRuntime(store);
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Test prompt')],
        tests: [{}],
      };

      await expect(evaluate(testSuite, evaluation, { maxEvalTimeMs }, runtime)).resolves.toBe(
        evaluation,
      );

      expect(evaluation.results).toHaveLength(1);
      expect(evaluation.results[0]).toMatchObject({
        success: true,
        testIdx: 0,
        promptIdx: 0,
      });
      expect(evaluation.prompts).toHaveLength(1);
      if (timeoutSpy && clearTimeoutSpy) {
        const deadlineCalls = timeoutSpy.mock.calls
          .map(([, delay], index) => ({ delay, index }))
          .filter(({ delay }) => delay === maxEvalTimeMs);
        expect(deadlineCalls).toHaveLength(1);
        expect(clearTimeoutSpy).toHaveBeenCalledWith(
          timeoutSpy.mock.results[deadlineCalls[0].index].value,
        );
        timeoutSpy.mockRestore();
        clearTimeoutSpy.mockRestore();
      }
    },
  );

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

  it.each<{
    name: string;
    savedPrompts: Prompt[];
    prompts: Prompt[];
    providerPrompts?: string[];
    savedProvider?: string;
    retryMode: boolean;
    maxEvalTimeMs?: number;
  }>([
    {
      name: 'newly filtered columns',
      savedPrompts: [toPrompt('first'), toPrompt('second')],
      prompts: [toPrompt('first'), toPrompt('second')],
      providerPrompts: ['second'],
      retryMode: true,
    },
    {
      name: 'newly filtered columns with a deadline',
      savedPrompts: [toPrompt('first'), toPrompt('second')],
      prompts: [toPrompt('first'), toPrompt('second')],
      providerPrompts: ['second'],
      retryMode: true,
      maxEvalTimeMs: 10000,
    },
    {
      name: 'reordered columns',
      savedPrompts: [toPrompt('first'), toPrompt('second')],
      prompts: [toPrompt('second'), toPrompt('first')],
      retryMode: false,
    },
    {
      name: 'reordered raw prompts with a shared label',
      savedPrompts: [
        { raw: 'first', label: 'shared' },
        { raw: 'second', label: 'shared' },
      ],
      prompts: [
        { raw: 'second', label: 'shared' },
        { raw: 'first', label: 'shared' },
      ],
      retryMode: true,
    },
    {
      name: 'changed provider identity',
      savedPrompts: [toPrompt('first')],
      prompts: [toPrompt('first')],
      savedProvider: 'previous-provider',
      retryMode: false,
    },
  ])(
    'rejects changed saved column routing before writes: $name',
    async ({ savedPrompts, prompts, providerPrompts, savedProvider, retryMode, maxEvalTimeMs }) => {
      if (maxEvalTimeMs) {
        vi.useFakeTimers();
      }
      const timeoutSpy = maxEvalTimeMs ? vi.spyOn(globalThis, 'setTimeout') : undefined;
      const clearTimeoutSpy = maxEvalTimeMs ? vi.spyOn(globalThis, 'clearTimeout') : undefined;
      const provider: ApiProvider = { ...mockApiProvider, prompts: providerPrompts };
      const evaluation = createInMemoryEvaluation({
        persisted: true,
        prompts: savedPrompts.map((prompt) => ({
          ...prompt,
          provider: savedProvider ?? provider.id(),
        })),
      });
      const savedColumns = structuredClone(evaluation.prompts);
      const store = new InMemoryEvaluationStore(evaluation);
      const appendPrompts = vi.spyOn(store, 'appendPrompts');
      const appendResult = vi.spyOn(store, 'appendResult');
      const save = vi.spyOn(store, 'save');
      const readCompletedIndexPairs = vi.spyOn(store, 'readCompletedIndexPairs');
      const writer = createResultWriter();
      const runtime = createInMemoryRuntime(store);
      vi.mocked(runtime.createResultWriters).mockReturnValue([writer]);
      cliState.resume = true;
      cliState.retryMode = retryMode;

      await expect(
        evaluate(
          { providers: [provider], prompts, tests: [{}] },
          evaluation,
          { maxEvalTimeMs },
          runtime,
        ),
      ).rejects.toThrow('saved provider/prompt columns differ. Start a new evaluation');

      expect(appendPrompts).not.toHaveBeenCalled();
      expect(appendResult).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(readCompletedIndexPairs).not.toHaveBeenCalled();
      expect(writer.write).not.toHaveBeenCalled();
      expect(writer.close).toHaveBeenCalledOnce();
      expect(provider.callApi).not.toHaveBeenCalled();
      expect(evaluation.prompts).toEqual(savedColumns);
      expect(evaluation.results).toEqual([]);
      if (timeoutSpy && clearTimeoutSpy) {
        const deadlineCalls = timeoutSpy.mock.calls
          .map(([, delay], index) => ({ delay, index }))
          .filter(({ delay }) => delay === maxEvalTimeMs);
        expect(deadlineCalls).toHaveLength(1);
        expect(clearTimeoutSpy).toHaveBeenCalledWith(
          timeoutSpy.mock.results[deadlineCalls[0].index].value,
        );
        timeoutSpy.mockRestore();
        clearTimeoutSpy.mockRestore();
      }
    },
  );

  it.each([
    {
      name: 'matching filtered columns',
      saved: { ...toPrompt('second'), id: 'previous-id' },
      prompts: [toPrompt('first'), toPrompt('second')],
      providerPrompts: ['second'],
    },
    {
      name: 'an unchanged empty-label prompt with a legacy custom ID',
      saved: { raw: 'hello', label: '', id: 'previous-custom-id' },
      prompts: [{ raw: 'hello', label: '' }],
      providerPrompts: undefined,
    },
  ])(
    'resumes $name without changing column routing',
    async ({ saved, prompts, providerPrompts }) => {
      const provider: ApiProvider = { ...mockApiProvider, prompts: providerPrompts };
      const evaluation = createInMemoryEvaluation({
        persisted: true,
        prompts: [{ ...saved, provider: provider.id() }],
      });
      const store = new InMemoryEvaluationStore(evaluation);
      const runtime = createInMemoryRuntime(store);
      cliState.resume = true;

      await evaluate({ providers: [provider], prompts, tests: [{}] }, evaluation, {}, runtime);

      expect(provider.callApi).toHaveBeenCalledOnce();
      expect(evaluation.results).toHaveLength(1);
      expect(evaluation.results[0]).toMatchObject({ success: true, promptIdx: 0 });
      expect(evaluation.prompts[0]).toMatchObject({ raw: saved.raw, label: saved.label });
    },
  );

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
