import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions/index';
import logger from '../../src/logger';
import { callGradingProvider } from '../../src/matchers/providers';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider, Assertion, CallApiOptionsParams } from '../../src/types/index';

vi.mock('../../src/redteam/remoteGeneration', () => ({ shouldGenerateRemote: () => false }));
vi.mock('../../src/providers/defaults', () => ({ getDefaultProviders: async () => ({}) }));
afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false' });
});

const operations = [
  ['callClassificationApi', { type: 'classifier', value: 'positive' }],
  ['callModerationApi', { type: 'moderation' }],
  ['callSimilarityApi', { type: 'similar', value: 'expected' }],
  ['callEmbeddingApi', { type: 'similar', value: 'expected' }],
] as const;

describe.each(operations)('%s assertion cancellation', (method, assertion) => {
  it('forwards evaluator cancellation to the specialized grading request', async () => {
    const entered = createDeferred<void>();
    const controller = new AbortController();
    const operation = vi.fn((...args: unknown[]) => {
      const options = args.at(-1) as CallApiOptionsParams;
      expect(options?.abortSignal).toBe(controller.signal);
      entered.resolve();
      return new Promise((resolve) =>
        options.abortSignal!.addEventListener(
          'abort',
          () => resolve({ error: 'cancelled grading' }),
          { once: true },
        ),
      );
    });
    const grader = {
      id: () => 'fixture:grader',
      callApi: vi.fn<ApiProvider['callApi']>().mockResolvedValue({}),
      [method]: operation,
    };
    const result = withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
      runAssertions({
        prompt: 'hello',
        provider: {
          id: () => 'fixture:target',
          callApi: vi.fn<ApiProvider['callApi']>().mockResolvedValue({}),
        },
        providerResponse: { output: 'response' },
        test: { assert: [{ ...assertion, provider: grader as ApiProvider } as Assertion] },
      }),
    );
    await entered.promise;
    controller.abort();
    expect((await result).reason).toContain('cancelled grading');
  });
  it('cancels while waiting for an adaptive scheduler slot without dispatching the grader', async () => {
    const registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
    const controller = new AbortController();
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const queued = createDeferred<void>();
    const operation = vi.fn().mockResolvedValue({});
    const grader = {
      id: () => 'fixture:grader',
      callApi: vi.fn().mockResolvedValue({}),
      [method]: operation,
    };
    const owner = registry.execute(grader, () => {
      entered.resolve();
      return release.promise;
    });
    await entered.promise;
    registry.once('request:started', () => queued.resolve());
    const pending = withProviderCallExecutionContext(
      { abortSignal: controller.signal, rateLimitRegistry: registry },
      () =>
        runAssertions({
          prompt: 'hello',
          provider: grader,
          providerResponse: { output: 'response' },
          test: { assert: [{ ...assertion, provider: grader as ApiProvider } as Assertion] },
        }),
    ).catch((error) => ({ reason: String(error) }));
    try {
      await queued.promise;
      expect(Object.values(registry.getMetrics())[0].queueDepth).toBe(
        method === 'callEmbeddingApi' ? 2 : 1,
      );
      controller.abort(new Error('cancelled grading wait'));
      expect((await pending).reason).toContain('cancelled grading wait');
      expect(operation).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        queueDepth: 0,
        activeRequests: 1,
      });
    } finally {
      controller.abort();
      release.resolve();
      await owner;
      registry.dispose();
    }
  });
});

describe('grouped grading cancellation diagnostics', () => {
  it.each(['unrelated failure', 'abort reason', 'AbortError'] as const)(
    'handles a late %s after the caller stops waiting',
    async (kind) => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
      const queue = new ProviderGroupedCallQueue();
      const controller = new AbortController();
      const reason = new Error('cancel grading');
      const finish = createDeferred<{ output: string }>();
      const provider: ApiProvider = {
        id: () => 'fixture:grader',
        callApi: vi.fn<ApiProvider['callApi']>(),
      };
      const pending = withProviderCallExecutionContext(
        { abortSignal: controller.signal, providerCallQueue: queue },
        () => callGradingProvider(provider, 'fixture', () => finish.promise),
      );
      const rejected = expect(pending).rejects.toBe(reason);
      const running = queue.run(queue.takeNextGroup()[0]);
      controller.abort(reason);
      await rejected;
      await running;
      expect(errorSpy).not.toHaveBeenCalled();

      const failure =
        kind === 'unrelated failure'
          ? new SyntaxError('invalid grader response')
          : kind === 'abort reason'
            ? reason
            : new DOMException('request cancelled', 'AbortError');
      finish.reject(failure);
      await expect(finish.promise).rejects.toBe(failure);

      if (kind === 'unrelated failure') {
        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
          'Assertion grading failed after cancellation',
          { provider: 'fixture:grader', error: expect.stringContaining('invalid grader response') },
        );
      } else {
        expect(errorSpy).not.toHaveBeenCalled();
      }
      await expect(pending).rejects.toBe(reason);
    },
  );
});
