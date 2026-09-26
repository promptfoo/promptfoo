import './setup';

import { expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { EchoProvider } from '../../src/providers/echo';
import { redteamProviderManager } from '../../src/redteam/providers/shared';
import { isRateLimitWrapped } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { sleep } from '../../src/util/time';
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
      const provider: ApiProvider = {
        id: () => 'offline-delayed',
        callApi: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
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
