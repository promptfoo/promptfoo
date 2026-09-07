import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions/index';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import { createDeferred } from '../util/utils';

import type { ApiProvider, Assertion, CallApiOptionsParams } from '../../src/types/index';

vi.mock('../../src/redteam/remoteGeneration', () => ({ shouldGenerateRemote: () => false }));
vi.mock('../../src/providers/defaults', () => ({ getDefaultProviders: async () => ({}) }));
afterEach(() => vi.restoreAllMocks());

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
});
