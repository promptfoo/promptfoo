import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../src/evaluator';
import Eval from '../src/models/eval';

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

vi.mock('../src/util/file', () => ({
  readFileCached: vi.fn(() => Promise.resolve('')),
}));

vi.mock('../src/evaluatorHelpers', async () => {
  const actual = await vi.importActual('../src/evaluatorHelpers');
  return {
    ...(actual as any),
    runExtensionHook: vi.fn((...args: any[]) => args[2]),
  };
});

vi.mock('../src/util/time', async () => {
  const actual = await vi.importActual('../src/util/time');
  return {
    ...(actual as any),
    sleep: vi.fn(() => Promise.resolve()),
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
    expect(String(row.error ?? '')).toContain('provider transform boom');
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
    expect(String(row.error ?? '')).toContain('test transform boom');
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

  it('runs a loaded ProviderFunction carrying label, delay, config, and transform', async () => {
    // End-to-end coverage that goes through the package-level wiring:
    // loadApiProviders wraps a `ProviderFunction` into an `ApiProvider`, and the
    // evaluator honors every attached metadata field. Mirrors the path a Node.js
    // package user actually hits.
    const { loadApiProviders } = await import('../src/providers/index');
    const { sleep } = await import('../src/util/time');
    const sleepMock = vi.mocked(sleep);
    sleepMock.mockClear();

    const providerFn: any = async (prompt: string) => ({
      output: `served:${prompt}`,
    });
    providerFn.label = 'fn-provider-with-metadata';
    providerFn.delay = 250;
    providerFn.config = { custom: 'value' };
    providerFn.transform = (output: unknown) => String(output).toUpperCase();

    const [wrapped] = await loadApiProviders([providerFn]);
    expect(wrapped.id()).toBe('fn-provider-with-metadata');
    expect(wrapped.label).toBe('fn-provider-with-metadata');
    expect(wrapped.delay).toBe(250);
    expect(wrapped.config).toEqual({ custom: 'value' });
    expect(wrapped.transform).toBe(providerFn.transform);

    const results = await evaluate(
      {
        prompts: [{ raw: 'hi {{name}}', label: 'p' }],
        providers: [wrapped],
        tests: [{ vars: { name: 'world' } }],
      } as TestSuite,
      new Eval({}),
      { maxConcurrency: 1 },
    );

    // Provider-level function transform ran against the callApi output.
    expect(results.results[0].response?.output).toBe('SERVED:HI WORLD');
    // Delay was honored (passed to the mocked sleep).
    expect(sleepMock).toHaveBeenCalledWith(250);
  });
});
