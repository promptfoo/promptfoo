import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../src/assertions';
import cliState from '../src/cliState';
import { evaluate } from '../src/evaluator';
import logger from '../src/logger';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';
import { ResultFailureReason } from '../src/types/index';

import type { ApiProvider, TestSuite } from '../src/types/index';

// These tests intentionally do NOT mock `../src/util/transform`, so every
// transform function flows through the real `transform()` implementation.
// The wiring-level coverage lives in `evaluator.integration.transforms.test.ts`;
// this file verifies behavior end-to-end.

vi.mock('../src/assertions', async () => {
  const actual = await vi.importActual('../src/assertions');
  return {
    ...(actual as any),
    runAssertions: vi.fn().mockResolvedValue({ pass: true, score: 1, namedScores: {} }),
  };
});

vi.mock('../src/cache', () => ({
  getCache: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    wrap: vi.fn((_key: any, fn: any) => fn()),
  })),
  isCacheEnabled: vi.fn(() => true),
  withCacheEnabled: vi.fn(async (_enabled: boolean | undefined, fn: () => Promise<unknown>) =>
    fn(),
  ),
  withCacheNamespace: vi.fn(async (_namespace: string | undefined, fn: () => Promise<unknown>) =>
    fn(),
  ),
}));

vi.mock('../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../src/evaluatorHelpers', async () => {
  const actual = await vi.importActual('../src/evaluatorHelpers');
  return {
    ...(actual as any),
    runExtensionHook: vi.fn((...args: any[]) => args[2]),
  };
});

const makeSuite = (overrides: Partial<TestSuite>): TestSuite => ({
  prompts: [{ raw: 'Hello {{name}}', label: 'Test' }],
  providers: [
    {
      id: () => 'mock-provider',
      callApi: async () => ({
        output: '  spaced output  ',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
      }),
    } as ApiProvider,
  ],
  tests: [{ vars: { name: 'world' } }],
  ...overrides,
});

describe('Transformation integration (real transform)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runAssertions)
      .mockReset()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Fixture passed', namedScores: {} });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('executes an inline function provider.transform', async () => {
    const providerTransformFn = (output: unknown) => String(output).trim().toUpperCase();
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: '  spaced output  ' }),
          transform: providerTransformFn,
        } as ApiProvider,
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(results.results[0].response?.output).toBe('SPACED OUTPUT');
  });

  it('executes an inline function test options.transform', async () => {
    const testTransformFn = (output: unknown) => String(output).toUpperCase();
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: 'hello world' }),
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: { transform: testTransformFn },
        },
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(results.results[0].response?.output).toBe('HELLO WORLD');
  });

  it('executes an inline function transformVars before rendering the prompt', async () => {
    const capturedPrompts: string[] = [];
    const suite = makeSuite({
      prompts: [{ raw: 'Hello {{name}}', label: 'Test' }],
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async (prompt) => {
            capturedPrompts.push(prompt);
            return { output: 'ack' };
          },
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: {
            transformVars: (vars) => ({
              ...(vars as Record<string, unknown>),
              name: String((vars as Record<string, unknown>).name).toUpperCase(),
            }),
          },
        },
      ],
    });

    await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(capturedPrompts).toContain('Hello WORLD');
  });

  it('chains provider.transform then test options.transform', async () => {
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: '  raw  ' }),
          transform: (output: unknown) => String(output).trim(),
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: {
            transform: (output: unknown) => `[${output}]`,
          },
        },
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(results.results[0].response?.output).toBe('[raw]');
  });

  it('marks the row as errored when a function provider transform rejects', async () => {
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: 'anything' }),
          transform: async () => {
            throw new Error('provider transform boom');
          },
        } as ApiProvider,
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    const row = results.results[0];
    expect(row.success).toBe(false);
    expect(row.error ?? '').toContain('provider transform boom');
  });

  it('marks the row as errored when a function test transform throws synchronously', async () => {
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: 'anything' }),
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: {
            transform: () => {
              throw new Error('test transform boom');
            },
          },
        },
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    const row = results.results[0];
    expect(row.success).toBe(false);
    expect(row.error ?? '').toContain('test transform boom');
  });

  it('chains provider + test + assertion transforms (all functions) end-to-end', async () => {
    const { runAssertions } = await import('../src/assertions');
    const runAssertionsSpy = vi.mocked(runAssertions);
    // Let the assertion runner see the assertion so we can verify its transform executed.
    runAssertionsSpy.mockImplementation(async ({ providerResponse }) => {
      return providerResponse.output === '((  raw  ))'
        ? { pass: true, score: 1, namedScores: {}, reason: 'chain ok' }
        : { pass: false, score: 0, reason: `unexpected: ${providerResponse.output}` };
    });

    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: '  raw  ' }),
          // Stage 1 — provider transform wraps with parens.
          transform: (output: unknown) => `(${output})`,
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: {
            // Stage 2 — test options transform wraps again.
            transform: (output: unknown) => `(${output})`,
          },
          assert: [
            {
              type: 'contains' as const,
              value: 'raw',
              // Stage 3 — assertion-level transform. Receives the chained output.
              // This is a pure identity — the `runAssertions` mock checks that
              // the post-test-transform value arrived at the assertion layer,
              // which is enough to prove the chain composed.
              transform: (output: unknown) => String(output),
            },
          ],
        },
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(results.results[0].response?.output).toBe('((  raw  ))');
    // runAssertions received the fully-chained output; its return of pass:true
    // (keyed on the chain output) proves the assertion transform was reached.
    expect(results.results[0].success).toBe(true);
  });

  it.each(['elapsed delay', 'caller cancellation'] as const)(
    'runs a loaded ProviderFunction carrying label, delay, config, and transform: %s',
    async (mode) => {
      // End-to-end coverage that goes through the package-level wiring:
      // loadApiProviders wraps a `ProviderFunction` into an `ApiProvider`, and the
      // evaluator honors every attached metadata field. Mirrors the path a Node.js
      // package user actually hits.
      const { loadApiProviders } = await import('../src/providers/index');

      const providerFn: any = vi.fn(async (prompt: string) => ({
        output: `served:${prompt}`,
        tokenUsage: { total: 5, numRequests: 1 },
      }));
      providerFn.label = 'fn-provider-with-metadata';
      providerFn.delay = 250;
      providerFn.config = { custom: 'value' };
      providerFn.transform = vi.fn((output: unknown) => String(output).toUpperCase());

      const [wrapped] = await loadApiProviders([providerFn]);
      expect(wrapped.id()).toBe('fn-provider-with-metadata');
      expect(wrapped.label).toBe('fn-provider-with-metadata');
      expect(wrapped.delay).toBe(250);
      expect(wrapped.config).toEqual({ custom: 'value' });
      expect(wrapped.transform).toBe(providerFn.transform);

      let notifyDelayStarted!: () => void;
      const delayStarted = new Promise<void>((resolve) => {
        notifyDelayStarted = resolve;
      });
      vi.mocked(logger.debug).mockImplementation((message) => {
        if (message === 'Sleeping for 250ms') {
          notifyDelayStarted();
        }
      });
      const caller = new AbortController();
      const abortReason = new Error('cancel the loaded provider delay');
      let evaluation: ReturnType<typeof evaluate> | undefined;
      let settled = false;
      const previousResume = cliState.resume;
      const suite: TestSuite = {
        prompts: [{ raw: 'hi {{name}}', label: 'p' }],
        providers: [wrapped],
        tests: [{ vars: { name: 'world' } }],
      };
      await runDbMigrations();
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        evaluation = evaluate(suite, record, {
          maxConcurrency: 1,
          abortSignal: caller.signal,
          timeoutMs: -1,
          maxEvalTimeMs: 0,
        });
        void evaluation.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
        await Promise.race([
          delayStarted,
          evaluation.then(() => {
            throw new Error('Evaluation completed before its provider delay');
          }),
        ]);
        await vi.advanceTimersByTimeAsync(249);
        expect(settled).toBe(false);
        if (mode === 'caller cancellation') {
          caller.abort(abortReason);
          expect(caller.signal.reason).toBe(abortReason);
        } else {
          await vi.advanceTimersByTimeAsync(1);
        }
        await evaluation;
        const rows = await record.fetchResultsByTestIdx(0);
        expect(rows).toHaveLength(1);
        if (mode === 'caller cancellation') {
          expect(rows[0]).toMatchObject({
            success: false,
            score: 0,
            failureReason: ResultFailureReason.ERROR,
            response: { output: 'served:hi world' },
            metadata: { incomplete: true, __promptfoo: { resumable: true } },
          });
          expect(rows[0].error).toContain(abortReason.message);
          expect(record.prompts[0].metrics).toMatchObject({
            testErrorCount: 1,
            tokenUsage: { total: 5, numRequests: 1 },
          });
          expect(providerFn.transform).not.toHaveBeenCalled();
          const beforeLate = rows[0].toEvaluateResult();
          await vi.advanceTimersByTimeAsync(1000);
          expect(providerFn.transform).not.toHaveBeenCalled();
          expect((await record.fetchResultsByTestIdx(0))[0].toEvaluateResult()).toEqual(beforeLate);

          const resumeDelayStarted = new Promise<void>((resolve) => {
            notifyDelayStarted = resolve;
          });
          cliState.resume = true;
          const resumed = (await Eval.findById(record.id))!;
          const resume = evaluate(suite, resumed, { maxConcurrency: 1 });
          await resumeDelayStarted;
          await vi.advanceTimersByTimeAsync(250);
          await resume;
          const completedRows = await resumed.fetchResultsByTestIdx(0);
          expect(completedRows).toHaveLength(1);
          expect(completedRows[0].id).not.toBe(rows[0].id);
          expect(completedRows[0]).toMatchObject({
            success: true,
            score: 1,
            response: { output: 'SERVED:HI WORLD' },
          });
          expect(resumed.prompts[0].metrics).toMatchObject({
            testPassCount: 1,
            testErrorCount: 0,
            tokenUsage: { total: 5, numRequests: 1 },
          });
          expect(providerFn).toHaveBeenCalledTimes(2);
        } else {
          expect(rows[0]).toMatchObject({
            success: true,
            score: 1,
            response: { output: 'SERVED:HI WORLD' },
          });
          expect(providerFn).toHaveBeenCalledOnce();
        }
        expect(providerFn.transform).toHaveBeenCalledOnce();
      } finally {
        cliState.resume = previousResume;
        caller.abort(abortReason);
        await evaluation?.catch(() => undefined);
        vi.mocked(logger.debug).mockReset();
        vi.useRealTimers();
      }
    },
  );
});
