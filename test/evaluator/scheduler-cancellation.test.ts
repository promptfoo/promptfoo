import './setup';

import { expect, it, vi } from 'vitest';
import { runEval } from '../../src/evaluator';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider } from '../../src/types/providers';

describeEvaluator('evaluator scheduler cancellation', () => {
  it.each(['target', 'grader'] as const)(
    'settles runEval during %s backoff through the actual registry',
    async (phase) => {
      vi.useFakeTimers();
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const controller = new AbortController();
      const target: ApiProvider = {
        id: () => 'target-provider',
        callApi: vi.fn().mockResolvedValue({
          output: 'Target answer',
          tokenUsage: createEmptyTokenUsage(),
        }),
      };
      const grader: ApiProvider = {
        id: () => 'grading-provider',
        callApi: vi.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, reason: 'would pass' }),
          tokenUsage: createEmptyTokenUsage(),
        }),
      };
      const limited = phase === 'target' ? target : grader;
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
      let results: Awaited<ReturnType<typeof runEval>> | undefined;
      const pending = runEval({
        delay: 0,
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: false,
        provider: target,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {
          assert: [{ type: 'llm-rubric', value: 'Answer should be valid', provider: grader }],
        },
        conversations: {},
        registers: {},
        abortSignal: controller.signal,
        rateLimitRegistry: registry,
      }).then((value) => {
        results = value;
        return value;
      });

      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(limited.callApi).toHaveBeenCalledOnce();
        expect(
          Object.values(registry.getMetrics()).some((metrics) => metrics.retriedRequests === 1),
        ).toBe(true);
        controller.abort();
        await vi.advanceTimersByTimeAsync(0);
        // A timeout row alone could hide a scheduler retry still sleeping.
        expect(results).toBeDefined();
        await pending;
        expect(results?.[0].success).toBe(false);
        expect(results?.[0].error).toMatch(/aborted/i);
        await vi.advanceTimersByTimeAsync(120000);
        expect(limited.callApi).toHaveBeenCalledOnce();
        expect(
          Object.values(registry.getMetrics()).every(
            (metrics) => metrics.activeRequests === 0 && metrics.queueDepth === 0,
          ),
        ).toBe(true);
      } finally {
        registry.dispose();
        vi.unstubAllEnvs();
      }
    },
  );
});
