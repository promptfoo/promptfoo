import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type TestSuite } from '../../src/types/index';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { EvaluatorRuntime } from '../../src/evaluator/runtime';
import type { ApiProvider } from '../../src/types/index';

function createResultWriter() {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createRuntime(resultWriter = createResultWriter()): EvaluatorRuntime {
  return {
    createResultWriters: vi.fn().mockReturnValue([resultWriter]),
    persistResult: vi.fn((evalRecord, result) => evalRecord.addResult(result)),
    updateResumeSignal: vi.fn(),
  };
}

function createEvalRecord(): Eval {
  return new Eval({ outputPath: 'results.jsonl' }, { id: randomUUID(), persisted: false });
}

describeEvaluator('evaluator runtime ports', () => {
  it('delegates result side effects and closes writers during cleanup', async () => {
    const resultWriter = createResultWriter();
    const runtime = createRuntime(resultWriter);
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };
    const evalRecord = createEvalRecord();

    await evaluate(testSuite, evalRecord, {}, runtime);

    expect(runtime.createResultWriters).toHaveBeenCalledWith('results.jsonl');
    expect(runtime.persistResult).toHaveBeenCalledOnce();
    expect(resultWriter.write).toHaveBeenCalledOnce();
    expect(vi.mocked(runtime.persistResult).mock.invocationCallOrder[0]).toBeLessThan(
      resultWriter.write.mock.invocationCallOrder[0],
    );
    expect(runtime.updateResumeSignal).toHaveBeenCalledWith(evalRecord.id);
    expect(resultWriter.close).toHaveBeenCalledOnce();
  });

  it('continues streaming output when result persistence fails', async () => {
    const resultWriter = createResultWriter();
    const runtime = createRuntime(resultWriter);
    vi.mocked(runtime.persistResult).mockRejectedValue(new Error('database unavailable'));
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    await expect(evaluate(testSuite, createEvalRecord(), {}, runtime)).resolves.toBeDefined();

    expect(resultWriter.write).toHaveBeenCalledOnce();
    expect(resultWriter.close).toHaveBeenCalledOnce();
  });

  it('rejects output failures after closing writers', async () => {
    const resultWriter = createResultWriter();
    resultWriter.write.mockRejectedValue(new Error('output unavailable'));
    const runtime = createRuntime(resultWriter);
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

  it('persists per-call timeout rows without streaming them', async () => {
    vi.useFakeTimers();
    const resultWriter = createResultWriter();
    const runtime = createRuntime(resultWriter);
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
      const evaluation = evaluate(testSuite, createEvalRecord(), { timeoutMs: 10 }, runtime);
      await vi.advanceTimersByTimeAsync(10);
      await evaluation;

      expect(runtime.persistResult).toHaveBeenCalledOnce();
      expect(resultWriter.write).not.toHaveBeenCalled();
      expect(resultWriter.close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
