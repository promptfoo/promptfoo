import './setup';

import { sql } from 'drizzle-orm';
import { afterEach, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getDb } from '../../src/database';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { recalculatePromptMetrics } from '../../src/node/promptMetrics';
import { deleteErrorResults } from '../../src/node/retry';
import { getTargetResponse } from '../../src/redteam/providers/shared';
import * as evaluatorTracing from '../../src/tracing/evaluatorTracing';
import { ResultFailureReason } from '../../src/types/index';
import { sleep } from '../../src/util/time';
import { transform } from '../../src/util/transform';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type {
  ApiProvider,
  CallApiOptionsParams,
  ProviderResponse,
  TestSuite,
} from '../../src/types/index';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describeEvaluator('partial provider evidence', () => {
  it.each([
    { cooperative: true, completed: 0, retry: false },
    { cooperative: true, completed: 1, retry: false },
    { cooperative: false, completed: 0, retry: false },
    { cooperative: false, completed: 1, retry: false },
    { cooperative: true, completed: 1, retry: true },
    { cooperative: false, completed: 1, retry: true },
  ])('replaces cancelled checkpoints on resume: %j', async ({ cooperative, completed, retry }) => {
    const controller = new AbortController();
    let finishProvider!: () => void;
    const provider: ApiProvider = {
      id: () => 'resumable-provider',
      callApi: vi.fn((_prompt, _context, options) => {
        if (completed) {
          options?.onProgress?.({
            output: 'Completed partial response',
            tokenUsage: { total: 11, numRequests: 1, attacker: { total: 3, numRequests: 1 } },
          });
        }
        return new Promise<ProviderResponse>((resolve, reject) => {
          finishProvider = () => resolve({ output: 'Late completion' });
          if (cooperative) {
            options?.abortSignal?.addEventListener(
              'abort',
              () => reject(options.abortSignal?.reason),
              {
                once: true,
              },
            );
          }
        });
      }),
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = await Eval.create({}, suite.prompts);
    vi.useFakeTimers();
    try {
      const firstRun = evaluate(suite, record, { abortSignal: controller.signal, timeoutMs: 0 });
      await vi.waitFor(() => expect(provider.callApi).toHaveBeenCalledOnce());
      controller.abort();
      await firstRun;
      const [checkpoint] = await record.fetchResultsByTestIdx(0);
      expect(checkpoint).toMatchObject({
        failureReason: ResultFailureReason.ERROR,
        success: false,
        score: 0,
        metadata: { incomplete: true, __promptfoo: { resumable: true } },
      });
      expect(await EvalResult.getCompletedIndexPairs(record.id)).toEqual(new Set());
      // Load both result APIs before resume; neither may retain the deleted checkpoint.
      expect((await record.getResults())[0].response?.output).toBe(checkpoint.response?.output);
      // A failure in another case can buffer this successfully saved checkpoint for JSONL.
      record.recordFinalJsonlResult((await record.toEvaluateSummary()).results[0]);
      finishProvider();
      await vi.advanceTimersByTimeAsync(0);
      expect((await record.fetchResultsByTestIdx(0)).map((row) => row.id)).toEqual([checkpoint.id]);

      cliState.resume = true;
      cliState.retryMode = retry;
      if (retry) {
        cliState._retryErrorResultIds = [checkpoint.id];
      }
      vi.mocked(provider.callApi).mockImplementation(async () => {
        // Starting a replacement must not delete the only saved evidence.
        expect((await record.fetchResultsByTestIdx(0)).map((row) => row.id)).toEqual([
          checkpoint.id,
        ]);
        return { output: 'Replacement response', tokenUsage: { total: 7, numRequests: 1 } };
      });
      await evaluate(suite, record, { timeoutMs: 0 });
      if (retry) {
        // Existing CLI retry cleanup still names the old ERROR ID.
        await deleteErrorResults([checkpoint.id]);
        await recalculatePromptMetrics(record);
      }

      const replacement = await record.fetchResultsByTestIdx(0);
      expect(replacement).toHaveLength(1);
      expect(replacement[0].id).not.toBe(checkpoint.id);
      expect(replacement[0]).toMatchObject({
        success: true,
        failureReason: ResultFailureReason.NONE,
        response: { output: 'Replacement response' },
      });
      expect(replacement[0].metadata?.__promptfoo?.resumable).toBeUndefined();
      expect(replacement[0].metadata?.incomplete).toBeUndefined();
      expect(record.getFinalJsonlResults()).toEqual([]);
      const summary = await record.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toMatchObject({
        success: true,
        response: { output: 'Replacement response' },
      });
      expect((await record.getResults())[0].response?.output).toBe('Replacement response');
      expect((await record.toEvaluateSummary()).results).toEqual(summary.results);
      expect(provider.callApi).toHaveBeenCalledTimes(2);
      expect(record.getStats()).toMatchObject({
        successes: 1,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 7, numRequests: 1 },
      });
      expect(record.prompts[0].metrics?.testErrorCount).toBe(0);
      expect(record.prompts[0].metrics?.tokenUsage.attacker?.total ?? 0).toBe(0);
    } finally {
      delete cliState._retryErrorResultIds;
      vi.useRealTimers();
    }
  });

  it.each([
    { freshSession: false, failure: 'write' },
    { freshSession: true, failure: 'write' },
    { freshSession: false, failure: 'read' },
    { freshSession: true, failure: 'read' },
  ])(
    'keeps checkpoint metrics after a failed replacement and recovers: %j',
    async ({ freshSession, failure }) => {
      const controller = new AbortController();
      const provider: ApiProvider = {
        id: () => 'replacement-rollback',
        callApi: vi.fn((_prompt, _context, options) => {
          options?.onProgress?.({
            output: 'Saved evidence',
            tokenUsage: { total: 11, numRequests: 1 },
          });
          return new Promise<never>((_resolve, reject) => {
            options?.abortSignal?.addEventListener(
              'abort',
              () => reject(options.abortSignal?.reason),
              { once: true },
            );
          });
        }),
      };
      const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
      const record = await Eval.create({}, suite.prompts);
      const firstRun = evaluate(suite, record, { abortSignal: controller.signal });
      await vi.waitFor(() => expect(provider.callApi).toHaveBeenCalledOnce());
      controller.abort();
      await firstRun;
      const [checkpoint] = await record.fetchResultsByTestIdx(0);
      const db = await getDb();
      await db.run(sql`CREATE TEMP TRIGGER prevent_checkpoint_delete BEFORE DELETE ON eval_results
      BEGIN SELECT RAISE(ABORT, 'Synthetic checkpoint replacement failure'); END`);
      const lookup =
        failure === 'read'
          ? vi
              .spyOn(record, 'fetchResultsByTestIdx')
              .mockRejectedValueOnce(new Error('SQLITE_BUSY'))
          : undefined;
      try {
        cliState.resume = true;
        vi.mocked(provider.callApi).mockResolvedValue({
          output: 'Replacement response',
          tokenUsage: { total: 7, numRequests: 1 },
        });
        await evaluate(suite, record, { timeoutMs: 0 });

        expect(record.resultPersistenceFailed).toBe(true);
        const saved = await record.fetchResultsByTestIdx(0);
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
          id: checkpoint.id,
          response: { output: 'Saved evidence' },
          metadata: { __promptfoo: { resumable: true } },
        });
        expect(await record.getFailedResultsByTestIdx(0)).toHaveLength(1);
        expect(record.prompts[0].metrics).toMatchObject({
          score: 0,
          testPassCount: 0,
          testFailCount: 0,
          testErrorCount: 1,
          totalLatencyMs: checkpoint.latencyMs,
          tokenUsage: { total: 11, numRequests: 1 },
        });
        const savedRecord = await Eval.findById(record.id);
        expect(savedRecord!.prompts[0].metrics).toEqual(record.prompts[0].metrics);
      } finally {
        lookup?.mockRestore();
        await db.run(sql`DROP TRIGGER prevent_checkpoint_delete`);
      }

      const resumed = freshSession ? (await Eval.findById(record.id))! : record;
      vi.mocked(provider.callApi).mockResolvedValue({
        output: 'Final response',
        tokenUsage: { total: 5, numRequests: 1 },
      });
      await evaluate(suite, resumed, { timeoutMs: 0 });
      const finalRows = await resumed.fetchResultsByTestIdx(0);
      expect(finalRows).toHaveLength(1);
      expect(finalRows[0]).toMatchObject({
        success: true,
        response: { output: 'Final response' },
        failureReason: ResultFailureReason.NONE,
      });
      expect(await resumed.getFailedResultsByTestIdx(0)).toEqual([]);
      expect(resumed.prompts[0].metrics).toMatchObject({
        score: 1,
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: finalRows[0].latencyMs,
        tokenUsage: { total: 5, numRequests: 1 },
      });
      expect((await Eval.findById(record.id))!.prompts[0].metrics).toEqual(
        resumed.prompts[0].metrics,
      );
    },
  );

  it('clears stale recovery copies when a queued resume row is finally saved', async () => {
    const provider: ApiProvider = {
      id: () => 'queued-resume-recovery',
      callApi: vi.fn(async () => ({
        output: 'Unsaved completed response',
        tokenUsage: { total: 7, numRequests: 1 },
      })),
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = await Eval.create({}, suite.prompts);
    cliState.resume = true;
    const append = vi.spyOn(record, 'addResult').mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    await evaluate(suite, record, { timeoutMs: 0 });
    append.mockRestore();
    expect(await record.fetchResultsByTestIdx(0)).toEqual([]);
    expect(await record.getFailedResultsByTestIdx(0)).toHaveLength(1);
    expect(record.prompts[0].metrics).toMatchObject({
      testPassCount: 0,
      testFailCount: 0,
      testErrorCount: 0,
      totalLatencyMs: 0,
      tokenUsage: { total: 0, numRequests: 0 },
    });

    vi.mocked(provider.callApi).mockResolvedValue({
      output: 'Final saved response',
      tokenUsage: { total: 5, numRequests: 1 },
    });
    await evaluate(suite, record, { timeoutMs: 0 });
    const rows = await record.fetchResultsByTestIdx(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].response?.output).toBe('Final saved response');
    expect(await record.getFailedResultsByTestIdx(0)).toEqual([]);
    expect(record.prompts[0].metrics).toMatchObject({
      testPassCount: 1,
      testFailCount: 0,
      testErrorCount: 0,
      totalLatencyMs: rows[0].latencyMs,
      tokenUsage: { total: 5, numRequests: 1 },
    });
  });

  it('ordinary resume leaves provider errors and per-case timeouts completed', async () => {
    const controller = new AbortController();
    const provider: ApiProvider = {
      id: () => 'mixed-resume-provider',
      callApi: vi.fn((prompt, _context, options) => {
        if (prompt === 'Provider error') {
          return Promise.resolve({
            error: 'Synthetic provider error',
            metadata: { __promptfoo: { resumable: true } },
          });
        }
        options?.onProgress?.({
          output: 'Partial response',
          tokenUsage: { total: 5, numRequests: 1 },
        });
        if (prompt === 'Cancelled') {
          queueMicrotask(() => controller.abort());
        }
        return new Promise<never>((_resolve, reject) => {
          options?.abortSignal?.addEventListener(
            'abort',
            () => reject(options.abortSignal?.reason),
            { once: true },
          );
        });
      }),
    };
    const suite: TestSuite = {
      providers: [provider],
      prompts: ['Provider error', 'Timed out', 'Cancelled'].map(toPrompt),
      tests: [{}],
    };
    const record = await Eval.create({}, suite.prompts);
    vi.useFakeTimers();
    try {
      const firstRun = evaluate(suite, record, {
        abortSignal: controller.signal,
        timeoutMs: 50,
        maxConcurrency: 1,
      });
      await vi.advanceTimersByTimeAsync(50);
      await vi.waitFor(() => expect(provider.callApi).toHaveBeenCalledTimes(3));
      controller.abort();
      await firstRun;
      expect(await EvalResult.getCompletedIndexPairs(record.id)).toEqual(new Set(['0:0', '0:1']));
      const previous = await record.fetchResultsByTestIdx(0);
      cliState.resume = true;
      vi.mocked(provider.callApi).mockResolvedValue({
        output: 'Resumed cancellation',
        tokenUsage: { total: 7, numRequests: 1 },
      });

      await evaluate(suite, record, { timeoutMs: 0, maxConcurrency: 1 });

      expect(provider.callApi).toHaveBeenCalledTimes(4);
      expect(vi.mocked(provider.callApi).mock.calls[3][0]).toBe('Cancelled');
      const rows = await record.fetchResultsByTestIdx(0);
      expect(rows).toHaveLength(3);
      for (const promptIdx of [0, 1]) {
        expect(rows.find((row) => row.promptIdx === promptIdx)?.id).toBe(
          previous.find((row) => row.promptIdx === promptIdx)?.id,
        );
      }
      expect(record.getStats()).toMatchObject({ successes: 1, failures: 0, errors: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['timeout', 'abort'])(
    'retains completed output transforms during %s without accepting late provider callbacks',
    async (interruption) => {
      const actualTransform = await vi.importActual<typeof import('../../src/util/transform')>(
        '../../src/util/transform',
      );
      vi.mocked(transform)
        .mockImplementationOnce(actualTransform.transform)
        .mockImplementationOnce(actualTransform.transform);
      vi.useFakeTimers();
      const controller = new AbortController();
      let options: CallApiOptionsParams | undefined;
      let finishAssertion!: () => void;
      const response = {
        output: { message: 'answer', discarded: 'removed-by-transform' },
        tokenUsage: { total: 23, numRequests: 1 },
      };
      const provider: ApiProvider = {
        id: () => 'transformed-provider',
        transform: 'output.message',
        callApi: vi.fn(async (_prompt, _context, callOptions) => {
          options = callOptions;
          return response;
        }),
      };
      const assertion = vi.fn(
        (_output: string) =>
          new Promise<boolean>((resolve) => {
            finishAssertion = () => resolve(true);
          }),
      );
      const suite: TestSuite = {
        providers: [provider],
        prompts: [toPrompt('Probe')],
        tests: [
          {
            options: { transform: 'output + " transformed"' },
            assert: [{ type: 'javascript', value: assertion }],
          },
        ],
      };
      const record = new Eval({});
      const evaluation = evaluate(suite, record, {
        abortSignal: controller.signal,
        timeoutMs: interruption === 'timeout' ? 1000 : 0,
      });
      await vi.waitFor(() => expect(assertion).toHaveBeenCalledOnce());
      expect(assertion.mock.calls[0][0]).toBe('answer transformed');
      options?.onProgress?.({ output: 'Late provider checkpoint' });
      if (interruption === 'timeout') {
        await vi.advanceTimersByTimeAsync(1000);
      } else {
        controller.abort();
      }
      await evaluation;

      const summary = await record.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toMatchObject({
        failureReason: ResultFailureReason.ERROR,
        success: false,
        score: 0,
        response: { output: 'answer transformed' },
        metadata: { incomplete: true },
        tokenUsage: { total: 23, numRequests: 1 },
      });
      expect(JSON.stringify(summary.results[0])).not.toContain('removed-by-transform');
      expect(response.output).toEqual({ message: 'answer', discarded: 'removed-by-transform' });

      finishAssertion();
      await vi.advanceTimersByTimeAsync(0);
      expect((await record.toEvaluateSummary()).results).toEqual(summary.results);
    },
  );

  it.each([1, 2])('retains %i completed probes without accepting late evidence', async (count) => {
    const traceId = '1234567890abcdef1234567890abcdef';
    vi.spyOn(evaluatorTracing, 'generateTraceContextIfNeeded').mockResolvedValue({
      traceparent: `00-${traceId}-1234567890abcdef-01`,
      evaluationId: 'partial-eval',
    });
    vi.useFakeTimers();
    let resolve!: (response: ProviderResponse) => void;
    let options: CallApiOptionsParams | undefined;
    const history: { prompt: string; output: string; graderPassed: boolean }[] = [];
    const usage = { numRequests: 0, total: 0, attacker: { numRequests: 2, total: 7 } };
    const provider: ApiProvider = {
      id: () => 'synthetic-adaptive-provider',
      callApi: vi.fn((_prompt, _context, callOptions) => {
        options = callOptions;
        for (let i = 1; i <= count; i++) {
          history.push({ prompt: `Probe ${i}`, output: `Response ${i}`, graderPassed: true });
          usage.numRequests = i;
          usage.total = i * 10;
          options?.onProgress?.({
            output: `Response ${i}`,
            metadata: { redteamHistory: history },
            tokenUsage: usage,
          });
        }
        return new Promise<ProviderResponse>((finish) => {
          resolve = finish;
        });
      }),
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = new Eval({});
    const evaluation = evaluate(suite, record, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await evaluation;

    const summary = await record.toEvaluateSummary();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]).toMatchObject({
      success: false,
      score: 0,
      failureReason: ResultFailureReason.ERROR,
      error: expect.stringContaining('timed out after 50ms'),
      traceId,
      evaluationId: 'partial-eval',
      response: { output: `Response ${count}` },
      metadata: { incomplete: true, redteamHistory: [...history] },
      tokenUsage: { numRequests: count, total: count * 10, attacker: { numRequests: 2, total: 7 } },
    });
    expect(summary.results[0].gradingResult).toBeNull();
    expect(summary.stats).toMatchObject({
      successes: 0,
      failures: 0,
      errors: 1,
      tokenUsage: { numRequests: count },
    });
    expect(record.prompts[0].metrics).toMatchObject({
      testErrorCount: 1,
      tokenUsage: { numRequests: count },
    });

    // A provider can ignore cancellation and mutate its previous checkpoint.
    history[0].output = 'Late mutation';
    history.push({ prompt: 'Late probe', output: 'Late output', graderPassed: true });
    usage.numRequests = 100;
    options?.onProgress?.({
      output: 'Late checkpoint',
      metadata: { redteamHistory: history },
      tokenUsage: usage,
    });
    resolve({ output: 'Late success', tokenUsage: { numRequests: 100 } });
    await vi.advanceTimersByTimeAsync(0);

    const afterLateResponse = await record.toEvaluateSummary();
    expect(afterLateResponse.results).toHaveLength(1);
    expect(afterLateResponse.results[0].metadata?.redteamHistory).toHaveLength(count);
    expect(afterLateResponse.results[0].metadata?.redteamHistory[0].output).toBe('Response 1');
    expect(afterLateResponse.results[0].tokenUsage?.numRequests).toBe(count);
    expect(vi.mocked(runExtensionHook).mock.calls.some((call) => call[1] === 'afterEach')).toBe(
      false,
    );
  });

  it.each([false, true])(
    'records zero probes when only coordination completed: %s',
    async (coordinated) => {
      vi.useFakeTimers();
      const provider: ApiProvider = {
        id: () => 'synthetic-empty-provider',
        callApi: vi.fn((_prompt, _context, options) => {
          if (coordinated) {
            options?.onProgress?.({
              metadata: { redteamHistory: [] },
              tokenUsage: { numRequests: 0, attacker: { numRequests: 1, total: 12 } },
            });
          }
          return new Promise<never>(() => {});
        }),
      };
      const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
      const record = new Eval({});
      const evaluation = evaluate(suite, record, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      await evaluation;
      const summary = await record.toEvaluateSummary();
      expect(summary.results[0]).toMatchObject({
        failureReason: ResultFailureReason.ERROR,
        success: false,
        tokenUsage: { numRequests: 0 },
      });
      if (coordinated) {
        expect(summary.results[0].tokenUsage?.attacker).toMatchObject({
          numRequests: 1,
          total: 12,
        });
        expect(summary.results[0].metadata?.redteamHistory).toEqual([]);
      }
    },
  );

  it.each([0, 1000])('preserves evidence on cancellation with timeoutMs=%i', async (timeoutMs) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const provider: ApiProvider = {
      id: () => 'synthetic-cancel-provider',
      callApi: vi.fn((_prompt, _context, options) => {
        options?.onProgress?.({
          output: 'Completed response',
          metadata: { redteamHistory: [{ prompt: 'Probe', output: 'Completed response' }] },
          tokenUsage: { numRequests: 1 },
        });
        return new Promise<never>(() => {});
      }),
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = new Eval({});
    const evaluation = evaluate(suite, record, { timeoutMs, abortSignal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error('cancelled by user'));
    await evaluation;
    const summary = await record.toEvaluateSummary();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]).toMatchObject({
      failureReason: ResultFailureReason.ERROR,
      success: false,
      error: expect.stringContaining('Evaluation aborted'),
      response: { output: 'Completed response' },
      tokenUsage: { numRequests: 1 },
      metadata: { incomplete: true },
    });
  });

  it('uses the normal persistence sanitizer for checkpoint metadata', async () => {
    const provider: ApiProvider = {
      id: () => 'synthetic-metadata-provider',
      callApi: vi.fn((_prompt, _context, options) => {
        options?.onProgress?.({
          output: 'Completed response',
          metadata: {
            redteamHistory: [{ prompt: 'Probe', output: 'Completed response' }],
            headers: { authorization: 'Bearer synthetic-secret', 'content-type': 'text/plain' },
          },
          tokenUsage: { numRequests: 1 },
        });
        return new Promise<never>(() => {});
      }),
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = await Eval.create({}, suite.prompts);
    vi.useFakeTimers();
    const evaluation = evaluate(suite, record, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await evaluation;
    const summary = await record.toEvaluateSummary();
    expect(summary.results[0].response?.output).toBe('Completed response');
    expect(summary.results[0].response?.metadata?.headers?.['content-type']).toBe('text/plain');
    expect(JSON.stringify(summary)).not.toContain('synthetic-secret');
  });

  it('retains completed strategy grading usage during outer provider pacing', async () => {
    vi.useFakeTimers();
    vi.mocked(sleep).mockImplementationOnce(() => new Promise(() => {}));
    const finalResponse: ProviderResponse = {
      output: 'Completed response',
      tokenUsage: { numRequests: 1, total: 11 },
      metadata: {
        storedGraderResult: {
          pass: true,
          score: 1,
          reason: 'Synthetic grade',
          tokensUsed: { total: 23, numRequests: 1 },
        },
      },
    };
    let lateProgress: CallApiOptionsParams['onProgress'];
    const provider: ApiProvider = {
      id: () => 'synthetic-graded-provider',
      delay: 100,
      callApi: vi.fn(async (_prompt, _context, options) => {
        options?.onProgress?.({
          output: 'Completed response',
          tokenUsage: { numRequests: 1, total: 11, assertions: { total: 23, numRequests: 1 } },
        });
        lateProgress = options?.onProgress;
        return finalResponse;
      }),
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = new Eval({});
    const evaluation = evaluate(suite, record, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(0);
    lateProgress?.({ output: 'Late callback after return', tokenUsage: { numRequests: 100 } });
    await vi.advanceTimersByTimeAsync(50);
    await evaluation;
    const summary = await record.toEvaluateSummary();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]).toMatchObject({
      success: false,
      score: 0,
      failureReason: ResultFailureReason.ERROR,
      response: { output: 'Completed response' },
      tokenUsage: { numRequests: 1, total: 11, assertions: { total: 23, numRequests: 1 } },
    });
    expect(summary.stats.tokenUsage.assertions).toMatchObject({ total: 23, numRequests: 1 });
    // The checkpoint cannot add internal grading to the normal response a second time.
    expect(finalResponse.tokenUsage?.assertions).toBeUndefined();
  });

  it.each([0, 1, 2])(
    'preserves cumulative history and media when final history has %i entries',
    async (finalHistoryLength) => {
      vi.useFakeTimers();
      vi.mocked(sleep).mockImplementationOnce(() => new Promise(() => {}));
      const history = [
        {
          prompt: 'First probe',
          output: 'Backtracked response',
          outputImage: { data: 'YQ==', format: 'png' },
        },
        {
          prompt: 'Second probe',
          output: 'Completed response',
          outputAudio: { data: 'Yg==', format: 'wav' },
        },
      ];
      const images = [{ data: 'YQ==', mimeType: 'image/png' }];
      const provider: ApiProvider = {
        id: () => 'synthetic-history-provider',
        delay: 100,
        callApi: vi.fn(async (_prompt, _context, options) => {
          options?.onProgress?.({
            output: 'Completed response',
            images,
            tokenUsage: { numRequests: 2, total: 22 },
            metadata: { redteamHistory: history },
          });
          return {
            output: 'Completed response',
            tokenUsage: { numRequests: 2, total: 22 },
            metadata: {
              stopReason: 'Completed strategy',
              redteamHistory: history
                .slice(0, finalHistoryLength)
                .map(({ prompt, output }) => ({ prompt, output })),
            },
          };
        }),
      };
      const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
      const record = new Eval({});
      const evaluation = evaluate(suite, record, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      await evaluation;
      const summary = await record.toEvaluateSummary();
      expect(summary.results[0]).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ERROR,
        tokenUsage: { numRequests: 2 },
        response: { images },
        metadata: { redteamHistory: history, stopReason: 'Completed strategy' },
      });
    },
  );

  it('uses AbortError so target wrappers stop instead of retrying after a timeout', async () => {
    vi.useFakeTimers();
    let attackerCalls = 0;
    const target: ApiProvider = {
      id: () => 'synthetic-abort-target',
      callApi: async (_prompt, _context, options) => {
        const signal = options!.abortSignal!;
        signal.throwIfAborted();
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        );
      },
    };
    const provider: ApiProvider = {
      id: () => 'synthetic-iterative-provider',
      callApi: async (prompt, context, options) => {
        for (let i = 0; i < 3; i++) {
          attackerCalls++;
          await getTargetResponse(target, prompt, context, options);
        }
        return { output: 'Unexpected completion' };
      },
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = new Eval({});
    const evaluation = evaluate(suite, record, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await evaluation;
    await vi.advanceTimersByTimeAsync(0);
    expect(attackerCalls).toBe(1);
    expect((await record.toEvaluateSummary()).results[0].failureReason).toBe(
      ResultFailureReason.ERROR,
    );
  });

  it.each(['timeout', 'abort'])(
    'retains recoverable evidence when persistence fails during %s',
    async (interruption) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const provider: ApiProvider = {
        id: () => 'synthetic-save-failure-provider',
        callApi: vi.fn((_prompt, _context, options) => {
          options?.onProgress?.({ output: 'Recoverable response', tokenUsage: { numRequests: 1 } });
          return new Promise<never>(() => {});
        }),
      };
      const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
      const record = new Eval({});
      vi.spyOn(record, 'addResult').mockRejectedValue(new Error('SQLITE_BUSY'));
      const evaluation = evaluate(suite, record, {
        timeoutMs: interruption === 'timeout' ? 50 : 0,
        abortSignal: controller.signal,
      });
      await vi.advanceTimersByTimeAsync(interruption === 'timeout' ? 50 : 0);
      if (interruption === 'abort') {
        controller.abort();
      }
      await evaluation;
      expect(record.resultPersistenceFailed).toBe(true);
      expect(await record.getFailedResultsByTestIdx(0)).toEqual([
        expect.objectContaining({
          success: false,
          failureReason: ResultFailureReason.ERROR,
          response: expect.objectContaining({ output: 'Recoverable response' }),
        }),
      ]);
    },
  );

  it('keeps hook-added input columns when an in-flight request is cancelled', async () => {
    const controller = new AbortController();
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach' && 'test' in context) {
        context.test.vars = { ...context.test.vars, hookInput: 'captured input' };
      }
      return context;
    });
    const provider: ApiProvider = {
      id: () => 'synthetic-hook-provider',
      callApi: vi.fn((_prompt, _context, options) => {
        options?.onProgress?.({ output: 'Completed response', tokenUsage: { numRequests: 1 } });
        return new Promise<never>(() => {});
      }),
    };
    const suite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('Probe')],
      tests: [{}],
      extensions: ['file://synthetic-hook.js'],
    };
    const record = await Eval.create({}, suite.prompts);
    vi.useFakeTimers();
    const evaluation = evaluate(suite, record, { timeoutMs: 0, abortSignal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await evaluation;
    const table = await record.getTablePage({ filters: [] });
    expect(table.head.vars).toContain('hookInput');
    expect(table.body[0].vars).toContain('captured input');
  });

  it('uses a completed response once when it beats the timeout', async () => {
    const provider: ApiProvider = {
      id: () => 'synthetic-completing-provider',
      callApi: vi.fn(async (_prompt, _context, options) => {
        options?.onProgress?.({ output: 'Partial', tokenUsage: { numRequests: 1 } });
        return { output: 'Complete', tokenUsage: { numRequests: 2 } };
      }),
    };
    const suite: TestSuite = { providers: [provider], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = new Eval({});
    await evaluate(suite, record, { timeoutMs: 1000 });
    const summary = await record.toEvaluateSummary();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]).toMatchObject({
      success: true,
      response: { output: 'Complete' },
      tokenUsage: { numRequests: 2 },
    });
    expect(summary.results[0].metadata?.incomplete).toBeUndefined();
    expect(summary.stats.tokenUsage.numRequests).toBe(2);
  });
});
