import './setup';

import { expect, it, vi } from 'vitest';
import { runEval } from '../../src/evaluator';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { createDeferred } from '../util/utils';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

function createTarget(): ApiProvider {
  return {
    id: () => 'diagnostic-target',
    callApi: vi
      .fn<ApiProvider['callApi']>()
      .mockResolvedValue({ output: 'Target answer', tokenUsage: createEmptyTokenUsage() }),
  };
}

function runRow(
  target: ApiProvider,
  registry: RateLimitRegistry,
  signal: AbortSignal,
  grader?: ApiProvider,
) {
  return runEval({
    delay: 0,
    testIdx: 0,
    promptIdx: 0,
    repeatIndex: 0,
    isRedteam: false,
    provider: target,
    prompt: { raw: 'Test prompt', label: 'test-label' },
    test: grader
      ? { assert: [{ type: 'llm-rubric', value: 'Answer should be valid', provider: grader }] }
      : {},
    conversations: {},
    registers: {},
    abortSignal: signal,
    rateLimitRegistry: registry,
  });
}

describeEvaluator('scheduler cancellation diagnostics', () => {
  it.each(
    (['target', 'grader'] as const).flatMap((phase) =>
      (['queue', 'backoff'] as const).flatMap((wait) =>
        (['Error', 'string'] as const).map((reasonKind) => ({ phase, wait, reasonKind })),
      ),
    ),
  )(
    'retains $reasonKind cancellation diagnostics for a $phase in $wait',
    async ({ phase, wait, reasonKind }) => {
      vi.useFakeTimers();
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const controller = new AbortController();
      const target = createTarget();
      const grader: ApiProvider = {
        id: () => 'diagnostic-grader',
        callApi: vi.fn<ApiProvider['callApi']>().mockResolvedValue({
          output: JSON.stringify({ pass: true, reason: 'would pass' }),
          tokenUsage: createEmptyTokenUsage(),
        }),
      };
      const limited = phase === 'target' ? target : grader;
      const held = createDeferred<ProviderResponse>();
      let active: Promise<ProviderResponse> | undefined;
      if (wait === 'queue') {
        active = registry.execute(limited, () => held.promise);
        await vi.advanceTimersByTimeAsync(0);
      } else {
        vi.mocked(limited.callApi).mockResolvedValueOnce({
          error: '429 rate limit',
          metadata: {
            http: {
              status: 429,
              statusText: 'Too Many Requests',
              headers: { 'retry-after-ms': '60000' },
            },
          },
        });
      }
      let results: Awaited<ReturnType<typeof runEval>> | undefined;
      const pending = runRow(
        target,
        registry,
        controller.signal,
        phase === 'grader' ? grader : undefined,
      ).then((value) => {
        results = value;
        return value;
      });
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(
          Object.values(registry.getMetrics()).some((metrics) =>
            wait === 'queue' ? metrics.queueDepth === 1 : metrics.retriedRequests === 1,
          ),
        ).toBe(true);
        const message = `deployment restart during ${phase} ${wait}`;
        controller.abort(reasonKind === 'Error' ? new Error(message) : message);
        await vi.advanceTimersByTimeAsync(0);
        expect(results).toBeDefined();
        await pending;
        expect(results?.[0].success).toBe(false);
        expect(results?.[0].error).toContain(message);
        // This is the diagnostic serialized by callers; Error.cause is not enough.
        expect(JSON.stringify({ error: results?.[0].error })).toContain(message);
        await vi.advanceTimersByTimeAsync(120000);
        expect(limited.callApi).toHaveBeenCalledTimes(wait === 'queue' ? 0 : 1);
      } finally {
        held.resolve({ output: 'active caller finished' });
        await active;
        registry.dispose();
        vi.unstubAllEnvs();
      }
    },
  );

  it('retains the target error response and metadata when caller cancellation races completion', async () => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const controller = new AbortController();
    const response = createDeferred<ProviderResponse>();
    const target = createTarget();
    vi.mocked(target.callApi).mockImplementationOnce(() => response.promise);
    const pending = runRow(target, registry, controller.signal);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(target.callApi).toHaveBeenCalledOnce();
      controller.abort(new Error('unrelated caller cancellation'));
      const failure: ProviderResponse = {
        error: 'Original upstream preparation failed',
        metadata: {
          http: { status: 503, statusText: 'Service Unavailable' },
          requestId: 'upstream-diagnostic',
        },
      };
      response.resolve(failure);
      await vi.advanceTimersByTimeAsync(0);
      const [result] = await pending;
      expect(result.success).toBe(false);
      expect(result.error).toBe(failure.error);
      expect(result.response?.error).toBe(failure.error);
      expect(result.response?.metadata).toEqual(failure.metadata);
      expect(JSON.stringify(result.response)).toContain('upstream-diagnostic');
      await vi.advanceTimersByTimeAsync(120000);
      expect(target.callApi).toHaveBeenCalledOnce();
    } finally {
      registry.dispose();
      vi.unstubAllEnvs();
    }
  });
});
