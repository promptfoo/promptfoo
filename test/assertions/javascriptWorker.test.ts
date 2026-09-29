import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions';
import { runJavascriptInWorker } from '../../src/assertions/javascriptWorker';
import { cloneJavascriptWorkerData } from '../../src/assertions/javascriptWorkerProtocol';
import cliState from '../../src/cliState';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';

import type { AssertionValueFunctionContext } from '../../src/types/index';

function context(): AssertionValueFunctionContext {
  return {
    prompt: 'fixture',
    vars: { expected: 'fixture' },
    test: {},
    logProbs: undefined,
    provider: undefined,
    providerResponse: { output: 'fixture' },
  };
}

function execute(value: string, assertionContext = context(), output: unknown = 'fixture') {
  return runJavascriptInWorker({
    value,
    functionBody: `return ${value}`,
    output,
    context: assertionContext,
  });
}

describe('isolated JavaScript assertions', () => {
  let basePath: string;
  beforeEach(async () => {
    basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-js-worker-'));
    await fs.writeFile(path.join(basePath, 'package.json'), '{"type":"module"}');
  });
  afterEach(async () => {
    await fs.rm(basePath, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('grades a harmless inline expression through the public assertion API', async () => {
    const result = await runAssertion({
      assertion: {
        type: 'javascript',
        executionMode: 'worker',
        value: 'output === context.vars.expected',
      },
      test: { vars: { expected: 'fixture' } },
      providerResponse: { output: 'fixture' },
    });
    expect(result).toMatchObject({ pass: true, score: 1 });
  });

  it('rejects worker mode for assertions that do not support it', async () => {
    await expect(
      runAssertion({
        assertion: { type: 'equals', executionMode: 'worker', value: 'fixture' },
        test: {},
        providerResponse: { output: 'fixture' },
      }),
    ).rejects.toThrow('supported only by JavaScript');
  });

  it('preserves the Node process shim in source workers', async () => {
    await expect(
      execute(
        "typeof process.cwd() === 'string' && process.mainModule.require('node:path').basename('/fixture/check') === 'check'",
      ),
    ).resolves.toBe(true);
  });

  it.each([
    ['mjs', 'export default (output) => output === "fixture";'],
    ['cjs', 'module.exports = (output) => output === "fixture";'],
    ['js', 'module.exports = (output) => output === "fixture";'],
    ['ts', 'export default (output: string) => output === "fixture";'],
  ])('uses the existing loader for a %s assertion', async (extension, source) => {
    await fs.writeFile(path.join(basePath, `check.${extension}`), source);
    await expect(
      cliState.withBasePath(basePath, () =>
        runAssertion({
          assertion: {
            type: 'javascript',
            executionMode: 'worker',
            value: `file://check.${extension}`,
          },
          test: {},
          providerResponse: { output: 'fixture' },
        }),
      ),
    ).resolves.toMatchObject({ pass: true, score: 1 });
  });

  it('loads a package export using the active configuration directory', async () => {
    const directory = path.join(basePath, 'node_modules', 'fixture-worker');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, 'package.json'),
      '{"name":"fixture-worker","type":"module","exports":"./index.mjs"}',
    );
    await fs.writeFile(
      path.join(directory, 'index.mjs'),
      'export const check = output => output === "fixture";',
    );
    await expect(
      cliState.withBasePath(basePath, () =>
        runAssertion({
          assertion: {
            type: 'javascript',
            executionMode: 'worker',
            value: 'package:fixture-worker:check',
          },
          test: {},
          providerResponse: { output: 'fixture' },
        }),
      ),
    ).resolves.toMatchObject({ pass: true, score: 1 });
  });

  it('keeps direct function assertions in-process unless worker mode is selected', async () => {
    const expected = 'fixture';
    const assertion = {
      type: 'javascript' as const,
      value: (output: string) => output === expected,
    };
    await expect(
      runAssertion({ assertion, test: {}, providerResponse: { output: expected } }),
    ).resolves.toMatchObject({ pass: true });
    await expect(
      runAssertion({
        assertion: { ...assertion, executionMode: 'worker' },
        test: {},
        providerResponse: { output: expected },
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: expect.stringContaining('function closures are unsupported'),
    });
  });

  it('normalizes scores and inverse assertions after worker execution', async () => {
    await expect(
      runAssertion({
        assertion: {
          type: 'not-javascript',
          executionMode: 'worker',
          value: '0.25',
          threshold: 0.5,
        },
        test: {},
        providerResponse: { output: 'fixture' },
      }),
    ).resolves.toMatchObject({ pass: true, score: 0.25 });
  });

  it('passes provider callbacks to the existing provider and applies cancellation', async () => {
    const controller = new AbortController();
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const callApi = vi.fn(
      async (_prompt?: string, _context?: unknown, _options?: { abortSignal?: AbortSignal }) => {
        markReady();
        return { output: 'ready' };
      },
    );
    const assertionContext = { ...context(), provider: { id: () => 'fixture', callApi } };
    const pending = withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
      execute(
        "context.provider.callApi('ready').then(() => new Promise(() => {}))",
        assertionContext,
      ),
    );
    const rejection = expect(pending).rejects.toThrow('aborted');
    await ready;
    controller.abort();
    await rejection;
    expect(callApi).toHaveBeenCalledWith('ready', undefined, {
      abortSignal: expect.any(AbortSignal),
    });
    expect(callApi.mock.calls[0]?.[2]?.abortSignal?.aborted).toBe(true);
  });

  it('returns provider callback results and rejects unsupported callback options', async () => {
    const callApi = vi.fn(async () => ({ output: 'callback' }));
    const assertionContext = {
      ...context(),
      provider: { id: () => 'fixture', config: { mode: 'local' }, callApi },
    };
    await expect(
      execute(
        "context.provider.callApi(context.provider.id()).then(r => r.output === 'callback')",
        assertionContext,
      ),
    ).resolves.toBe(true);
    await expect(
      execute(
        "context.provider.callApi('fixture', undefined, { abortSignal: new AbortController().signal })",
        assertionContext,
      ),
    ).rejects.toThrow('class instances are unsupported');
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('reports provider callback failures through the assertion result', async () => {
    const callApi = vi.fn(async () => {
      throw new Error('Fixture provider unavailable');
    });
    await expect(
      runAssertion({
        assertion: {
          type: 'javascript',
          executionMode: 'worker',
          value: "context.provider.callApi('fixture')",
        },
        provider: { id: () => 'fixture', callApi },
        test: {},
        providerResponse: { output: 'fixture' },
      }),
    ).resolves.toMatchObject({
      pass: false,
      score: 0,
      reason: expect.stringContaining('Fixture provider unavailable'),
    });
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('cancels pending provider callbacks when an assertion returns normally', async () => {
    let callbackSignal: AbortSignal | undefined;
    const callApi = vi.fn((_prompt, _context, options) => {
      callbackSignal = options.abortSignal;
      return new Promise<{ output: string }>((resolve) => {
        options.abortSignal.addEventListener('abort', () => resolve({ output: 'cancelled' }), {
          once: true,
        });
      });
    });
    await expect(
      execute("(context.provider.callApi('fixture'), true)", {
        ...context(),
        provider: { id: () => 'fixture', callApi },
      }),
    ).resolves.toBe(true);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callbackSignal?.aborted).toBe(true);
  });

  it('bounds concurrent provider callbacks and stops them when the worker fails', async () => {
    const signals: AbortSignal[] = [];
    const callApi = vi.fn((_prompt, _context, options) => {
      signals.push(options.abortSignal);
      return new Promise<{ output: string }>((resolve) => {
        options.abortSignal.addEventListener('abort', () => resolve({ output: 'cancelled' }), {
          once: true,
        });
      });
    });
    await expect(
      execute("Promise.all(Array.from({ length: 9 }, () => context.provider.callApi('fixture')))", {
        ...context(),
        provider: { id: () => 'fixture', callApi },
      }),
    ).rejects.toThrow('at most eight');
    expect(callApi).toHaveBeenCalledTimes(8);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('rejects a normal worker exit without a result instead of leaving the promise pending', async () => {
    await fs.writeFile(path.join(basePath, 'exit.mjs'), 'export default () => process.exit(0);');
    await expect(cliState.withBasePath(basePath, () => execute('file://exit.mjs'))).rejects.toThrow(
      'exited without a result (0)',
    );
  });

  it('rejects before execution when the evaluator is already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      withProviderCallExecutionContext({ abortSignal: controller.signal }, () => execute('true')),
    ).rejects.toThrow();
  });
});

describe('worker context data', () => {
  it('copies cyclic plain data without JSON loss', () => {
    const value: { count: bigint; cycle?: unknown } = { count: 2n };
    value.cycle = value;
    const clone = cloneJavascriptWorkerData(value);
    expect(clone.count).toBe(2n);
    expect(clone.cycle).toBe(clone);
  });

  it.each([() => true, new Date(), { callback: () => true }])(
    'rejects unsupported values',
    (value) => {
      expect(() => cloneJavascriptWorkerData(value)).toThrow(/plain|class/);
    },
  );

  it('rejects accessors without invoking them', () => {
    const getter = vi.fn(() => 'fixture');
    const value = Object.defineProperty({}, 'value', { get: getter, enumerable: true });
    expect(() => cloneJavascriptWorkerData(value)).toThrow('accessors');
    expect(getter).not.toHaveBeenCalled();
  });
});
