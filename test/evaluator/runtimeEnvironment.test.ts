import './setup';

import { expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate, runEval } from '../../src/evaluator';
import * as comparisonMatchers from '../../src/matchers/comparison';
import Eval from '../../src/models/eval';
import { EchoProvider } from '../../src/providers/echo';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import * as targetWrapping from '../../src/redteam/mcpTargetProvider';
import {
  callTargetProvider,
  getTargetResponse,
  redteamProviderManager,
} from '../../src/redteam/providers/shared';
import { getProviderDelay } from '../../src/scheduler/providerCallExecutionContext';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import { isRateLimitWrapped } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { sleep } from '../../src/util/time';
import { mockProcessEnv } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, EnvOverrides, TestSuite } from '../../src/types/index';

function createSuite(provider: ApiProvider, env: EnvOverrides = {}): TestSuite {
  return { providers: [provider], prompts: [toPrompt('hello')], tests: [{}], env };
}

function createProvider(id = 'offline'): ApiProvider {
  return { id: () => id, callApi: vi.fn().mockResolvedValue({ output: 'ok' }) };
}

describeEvaluator('evaluation environment defaults', () => {
  it('keeps progress callback delays numeric while applying an inherited delay', async () => {
    const progressCallback = vi.fn();
    await evaluate(createSuite(createProvider(), { PROMPTFOO_DELAY_MS: '7' }), new Eval({}), {
      progressCallback,
    });
    expect(progressCallback).toHaveBeenCalled();
    expect(progressCallback.mock.calls.map((call) => call[3].delay)).toEqual([0]);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(7);
    const step = progressCallback.mock.calls[0][3];
    expect(step).not.toHaveProperty('delayOmitted');
    vi.mocked(sleep).mockClear();
    await runEval({ ...step, delay: 500, abortSignal: undefined });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(500);
  });

  it.each([
    { providerDelay: undefined, evalDelay: undefined, expected: 7 },
    { providerDelay: undefined, evalDelay: 0, expected: 0 },
    { providerDelay: undefined, evalDelay: 5, expected: 5 },
    { providerDelay: 3, evalDelay: 5, expected: 3 },
    { providerDelay: 0, evalDelay: 5, expected: 0 },
  ])('resolves delay precedence without changing the provider: %j', async (testCase) => {
    const provider = { ...createProvider(), delay: testCase.providerDelay };
    const suite = createSuite(provider, { PROMPTFOO_DELAY_MS: '7' });
    const record = new Eval({});

    await evaluate(suite, record, { delay: testCase.evalDelay });

    expect(provider.delay).toBe(testCase.providerDelay);
    if (testCase.expected > 0) {
      expect(sleep).toHaveBeenCalledExactlyOnceWith(testCase.expected);
    } else {
      expect(sleep).not.toHaveBeenCalled();
    }
    expect((await record.getResults())[0]).toMatchObject({ success: true });
  });

  it('keeps different delays when a provider is reused across evaluations', async () => {
    const provider = createProvider();
    await evaluate(createSuite(provider, { PROMPTFOO_DELAY_MS: '2' }), new Eval({}), {});
    await evaluate(createSuite(provider, { PROMPTFOO_DELAY_MS: '4' }), new Eval({}), {});

    expect(sleep).toHaveBeenNthCalledWith(1, 2);
    expect(sleep).toHaveBeenNthCalledWith(2, 4);
    expect(provider.delay).toBeUndefined();
  });

  it.each([undefined, 3])(
    'applies a self-delaying provider delay %s exactly once',
    async (delay) => {
      const provider = new EchoProvider({ delay });
      await evaluate(createSuite(provider, { PROMPTFOO_DELAY_MS: '7' }), new Eval({}), {});

      expect(sleep).toHaveBeenCalledExactlyOnceWith(delay ?? 7);
      expect(provider.delay).toBe(delay);
    },
  );

  it.each([
    { providerDelay: undefined, evalDelay: undefined, expected: 9 },
    { providerDelay: undefined, evalDelay: 7, expected: 7 },
    { providerDelay: undefined, evalDelay: 0, expected: 0 },
    { providerDelay: 3, evalDelay: 7, expected: 3 },
    { providerDelay: undefined, evalDelay: 7, expected: 7, wrapped: true },
  ])('preserves pacing inside delegated provider calls: %j', async (testCase) => {
    const events: string[] = [];
    const target: ApiProvider = {
      id: () => 'offline-target',
      delay: testCase.providerDelay,
      callApi: async () => {
        events.push('call');
        return { output: 'ok' };
      },
    };
    const targetForContext = testCase.wrapped ? { ...target } : target;
    const wrapper = testCase.wrapped
      ? vi
          .spyOn(targetWrapping, 'maybeWrapMcpProviderForRedteam')
          .mockImplementation((provider) => (provider === target ? targetForContext : provider))
      : undefined;
    vi.mocked(sleep).mockImplementation(async (delay) => {
      events.push(`sleep:${delay}`);
    });
    const suite = createSuite(target, { PROMPTFOO_DELAY_MS: '9' });
    suite.tests = [
      {
        provider: {
          id: () => 'offline-delegate',
          callApi: async (_prompt, context) => {
            expect(context?.originalProvider).toBe(targetForContext);
            expect(getProviderDelay(createProvider('unrelated'))).toBeUndefined();
            await getTargetResponse(targetForContext, 'hello', context);
            return getTargetResponse(targetForContext, 'hello again', context);
          },
        },
      },
    ];

    try {
      await evaluate(suite, new Eval({}), { delay: testCase.evalDelay });
    } finally {
      wrapper?.mockRestore();
    }

    expect(events).toEqual(
      testCase.expected > 0
        ? [
            'call',
            `sleep:${testCase.expected}`,
            'call',
            `sleep:${testCase.expected}`,
            `sleep:${testCase.expected}`,
          ]
        : ['call', 'call'],
    );
    expect(target.delay).toBe(testCase.providerDelay);
    expect(getProviderDelay(target)).toBe(testCase.providerDelay);
  });

  it('paces each delegated call to a self-delaying target with an inherited delay', async () => {
    const target = new EchoProvider();
    const suite = createSuite(target, { PROMPTFOO_DELAY_MS: '7' });
    suite.tests = [
      {
        provider: {
          id: () => 'offline-delegate',
          callApi: async (_prompt, context) => {
            await callTargetProvider(target, 'hello', context);
            expect(sleep).toHaveBeenCalledExactlyOnceWith(7);
            return callTargetProvider(target, 'hello again', context);
          },
        },
      },
    ];
    const record = new Eval({});
    await evaluate(suite, record, {});
    expect((await record.getResults())[0]).toMatchObject({ success: true });
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(target.delay).toBeUndefined();
  });

  it.each([undefined, 3, 0])('applies SageMaker target delay %s exactly once', async (delay) => {
    const target = new SageMakerCompletionProvider('fixture', {
      delay,
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const send = vi.fn().mockResolvedValue({ Body: Buffer.from(JSON.stringify({ output: 'ok' })) });
    vi.spyOn(target, 'getSageMakerRuntimeInstance').mockResolvedValue({
      send,
    } as unknown as Awaited<ReturnType<typeof target.getSageMakerRuntimeInstance>>);
    const record = new Eval({});
    await evaluate(createSuite(target, { PROMPTFOO_DELAY_MS: '7' }), record, {});
    expect((await record.getResults())[0]).toMatchObject({ success: true });
    expect(send).toHaveBeenCalledOnce();
    if (delay === 0) {
      expect(sleep).not.toHaveBeenCalled();
    } else {
      expect(sleep).toHaveBeenCalledExactlyOnceWith(delay ?? 7);
    }
  });

  it('isolates delegated delays when overlapping evaluations share the target', async () => {
    let started = 0;
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const target = createProvider('shared-offline-target');
    const observed: number[][] = [];
    const run = (delay: number) => {
      const suite = createSuite(target, { PROMPTFOO_DELAY_MS: String(delay) });
      suite.tests = [
        {
          provider: {
            id: () => 'offline-delegate',
            callApi: async (_prompt, context) => {
              if (++started === 2) {
                release();
              }
              await bothStarted;
              observed.push([delay, getProviderDelay(target)!]);
              await getTargetResponse(target, 'hello', context);
              return getTargetResponse(target, 'hello again', context);
            },
          },
        },
      ];
      return evaluate(suite, new Eval({}), {});
    };
    await Promise.all([run(2), run(4)]);

    expect(observed).toEqual(
      expect.arrayContaining([
        [2, 2],
        [4, 4],
      ]),
    );
    expect(
      vi
        .mocked(sleep)
        .mock.calls.map(([delay]) => delay)
        .sort(),
    ).toEqual([2, 2, 2, 4, 4, 4]);
    expect(target.delay).toBeUndefined();
    expect(getProviderDelay(target)).toBeUndefined();
  });

  it.each([
    { maxConcurrency: 1, delay: undefined, delayResolved: false, expected: 50 },
    { maxConcurrency: 2, delay: undefined, delayResolved: false, expected: 50 },
    { maxConcurrency: 1, delay: undefined, delayResolved: true, expected: 50 },
    { maxConcurrency: 2, delay: undefined, delayResolved: true, expected: 50 },
    { maxConcurrency: 1, delay: 0, delayResolved: true, expected: 0 },
    { maxConcurrency: 2, delay: 0, delayResolved: true, expected: 0 },
    { maxConcurrency: 1, delay: 15, delayResolved: true, expected: 15 },
    { maxConcurrency: 2, delay: 15, delayResolved: true, expected: 15 },
  ])(
    'preserves resolved pacing and grader fallbacks: %j',
    async ({ maxConcurrency, delay, delayResolved, expected }) => {
      const restore = mockProcessEnv({ PROMPTFOO_DELAY_MS: undefined });
      const target = createProvider();
      const observed: Array<number | undefined> = [];
      const grader: ApiProvider = {
        id: () => 'offline-configured-grader',
        delay: 50,
        callApi: async (_prompt, context) => {
          observed.push(getProviderDelay(context?.originalProvider) ?? grader.delay);
          return { output: '{"pass":true,"score":1,"reason":"fixture"}' };
        },
      };
      const suite = createSuite(target, delayResolved ? { PROMPTFOO_DELAY_MS: '1000' } : undefined);
      suite.tests = [{ assert: [{ type: 'llm-rubric', value: 'fixture', provider: grader }] }];
      try {
        await evaluate(suite, new Eval({}), { maxConcurrency, delay, delayResolved });
        expect(observed).toEqual([expected]);
        expect(target.delay).toBeUndefined();
      } finally {
        restore();
      }
    },
  );

  it.each([
    { maxConcurrency: 2, delay: undefined, expected: 7 },
    { maxConcurrency: 2, delay: 0, expected: 0 },
    { maxConcurrency: 1, delay: undefined, expected: 7 },
    { maxConcurrency: 1, delay: 0, expected: 0 },
  ])(
    'preserves invocation delay through immediate and queued grading: %j',
    async ({ maxConcurrency, delay, expected }) => {
      const target = createProvider();
      const observed: Array<number | undefined> = [];
      const grader: ApiProvider = {
        id: () => 'offline-grader',
        callApi: async (_prompt, context) => {
          await Promise.resolve();
          expect(context?.originalProvider).toBe(target);
          observed.push(getProviderDelay(context?.originalProvider));
          return { output: '{"pass":true,"score":1,"reason":"fixture"}' };
        },
      };
      const suite = createSuite(target, { PROMPTFOO_DELAY_MS: '7' });
      suite.tests = [{ assert: [{ type: 'llm-rubric', value: 'fixture', provider: grader }] }];
      const queued = vi.spyOn(ProviderGroupedCallQueue.prototype, 'enqueue');
      const record = new Eval({});
      try {
        await evaluate(suite, record, { maxConcurrency, delay });
        expect(observed).toEqual([expected]);
        expect(queued).toHaveBeenCalledTimes(maxConcurrency === 1 ? 1 : 0);
        expect((await record.getResults())[0]).toMatchObject({ success: true, score: 1 });
        expect(target.delay).toBeUndefined();
        expect(getProviderDelay(target)).toBeUndefined();
      } finally {
        queued.mockRestore();
      }
    },
  );

  it.each([
    { delay: undefined, delayResolved: false, expected: 7 },
    { delay: 0, delayResolved: false, expected: 0 },
    { delay: undefined, delayResolved: true, expected: undefined },
    { delay: 0, delayResolved: true, expected: 0 },
    { delay: 15, delayResolved: true, expected: 15 },
  ])(
    'preserves invocation delay for comparison grading: %j',
    async ({ delay, delayResolved, expected }) => {
      const target = createProvider();
      const observed: Array<number | undefined> = [];
      const grader: ApiProvider = {
        id: () => 'offline-comparison-grader',
        callApi: async (_prompt, context) => {
          observed.push(getProviderDelay(context?.originalProvider));
          return { output: '0' };
        },
      };
      const suite = createSuite(target, { PROMPTFOO_DELAY_MS: '7' });
      suite.prompts = [toPrompt('first'), toPrompt('second')];
      suite.tests = [{ assert: [{ type: 'select-best', value: 'fixture' }] }];
      const compare = vi
        .spyOn(comparisonMatchers, 'matchesSelectBest')
        .mockImplementation(async (_criteria, outputs, _grading, _vars, context) => {
          await grader.callApi('fixture', context);
          return outputs.map(() => ({ pass: true, score: 1, reason: 'fixture' }));
        });
      const record = new Eval({});
      try {
        await evaluate(suite, record, { delay, delayResolved });
        expect(observed).toEqual([expected]);
        expect(target.delay).toBeUndefined();
        expect((await record.getResults()).every((result) => result.success)).toBe(true);
      } finally {
        compare.mockRestore();
      }
    },
  );

  it('isolates concurrent delay defaults on the same provider object', async () => {
    let calls = 0;
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider: ApiProvider = {
      id: () => 'shared-offline',
      callApi: async () => {
        if (++calls === 2) {
          release();
        }
        await bothStarted;
        return { output: 'ok' };
      },
    };
    await Promise.all(
      [2, 4].map((delay) =>
        evaluate(createSuite(provider, { PROMPTFOO_DELAY_MS: String(delay) }), new Eval({}), {}),
      ),
    );
    expect(
      vi
        .mocked(sleep)
        .mock.calls.map(([delay]) => delay)
        .sort(),
    ).toEqual([2, 4]);
    expect(provider.delay).toBeUndefined();
  });

  it.each([undefined, 0])(
    'preserves timeout override %s against an environment default',
    async (timeoutMs) => {
      vi.useFakeTimers();
      let release!: () => void;
      const responseReady = new Promise<void>((resolve) => {
        release = resolve;
      });
      const provider: ApiProvider = {
        id: () => 'offline-delayed',
        callApi: async () => {
          await responseReady;
          return { output: 'ok' };
        },
      };
      const record = new Eval({});
      const evaluation = evaluate(
        createSuite(provider, { PROMPTFOO_EVAL_TIMEOUT_MS: '1' }),
        record,
        { timeoutMs },
      );
      await vi.advanceTimersByTimeAsync(20);
      release();
      await vi.advanceTimersByTimeAsync(0);
      await evaluation;

      const [result] = await record.getResults();
      expect(result.success).toBe(timeoutMs === 0);
      if (timeoutMs === undefined) {
        expect(result.error).toContain('timed out after 1ms');
      }
    },
  );

  it('keeps the scheduler for internal helpers after an overlapping evaluation finishes', async () => {
    const execute = vi.spyOn(RateLimitRegistry.prototype, 'execute');
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const helperA = createProvider('helper-a');
    const helperB = createProvider('helper-b');
    const target = (id: string, helper: ApiProvider): ApiProvider => ({
      id: () => id,
      callApi: async () => {
        if (id === 'target-a') {
          markFirstStarted();
          await firstMayFinish;
        }
        const wrapped = await redteamProviderManager.getProvider({ provider: helper });
        expect(isRateLimitWrapped(wrapped)).toBe(true);
        return wrapped.callApi('hello');
      },
    });
    const first = evaluate(
      createSuite(target('target-a', helperA), { PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'true' }),
      new Eval({}),
      {},
    );
    try {
      await firstStarted;
      await evaluate(
        createSuite(target('target-b', helperB), { PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false' }),
        new Eval({}),
        {},
      );
      releaseFirst();
      await first;
      const registryFor = (id: string) =>
        execute.mock.contexts[execute.mock.calls.findIndex(([provider]) => provider.id() === id)];
      expect(registryFor('helper-a')).toBe(registryFor('target-a'));
      expect(registryFor('helper-b')).toBe(registryFor('target-b'));
      expect(registryFor('target-a')).not.toBe(registryFor('target-b'));
      expect(
        isRateLimitWrapped(await redteamProviderManager.getProvider({ provider: helperA })),
      ).toBe(false);
    } finally {
      releaseFirst();
      await first;
      execute.mockRestore();
    }
  });

  it('resolves the default provider temperature after import for each environment scope', async () => {
    const fileProvider = await cliState.withEnvFileOverrides(
      { PROMPTFOO_JAILBREAK_TEMPERATURE: '0.25' },
      () => redteamProviderManager.getDefaultProvider(),
    );
    const providers = await Promise.all(
      [0, 0.9].map((temperature) =>
        cliState.withEnv({ PROMPTFOO_JAILBREAK_TEMPERATURE: String(temperature) }, async () => {
          await Promise.resolve();
          return redteamProviderManager.getDefaultProvider();
        }),
      ),
    );
    expect(fileProvider.config.temperature).toBe(0.25);
    expect(providers.map((provider) => provider.config.temperature)).toEqual([0, 0.9]);
  });
});
