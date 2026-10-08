import './setup';

import { afterEach, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import * as evaluatorTracing from '../../src/tracing/evaluatorTracing';
import { ResultFailureReason } from '../../src/types/index';
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
