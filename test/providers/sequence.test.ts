import { describe, expect, it } from 'vitest';
import { SequenceProvider } from '../../src/providers/sequence';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createMockProvider } from '../factories/provider';

import type { ProviderResponse } from '../../src/types/index';

function runSequence(responses: ProviderResponse[]) {
  const originalProvider = createMockProvider();
  for (const response of responses) {
    originalProvider.callApi.mockResolvedValueOnce(response);
  }
  const provider = new SequenceProvider({ config: { inputs: ['one', 'two'] } });
  return provider.callApi('prompt', {
    originalProvider,
    prompt: { raw: 'prompt', label: 'prompt' },
    vars: {},
  });
}

describe('SequenceProvider cost', () => {
  it('includes the incurred cost of a failed attempt when the sequence is retried', async () => {
    const originalProvider = createMockProvider();
    originalProvider.callApi
      .mockResolvedValueOnce({
        error: 'temporary failure',
        cost: 0.01,
        metadata: {
          retryableErrorKind: 'transient_availability',
          http: {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'retry-after-ms': '0' },
          },
        },
      })
      .mockResolvedValueOnce({ output: 'one', cost: 0.01, cached: true })
      .mockResolvedValueOnce({ output: 'two', cost: 0.02 });
    const provider = new SequenceProvider({ config: { inputs: ['one', 'two'] } });
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    try {
      const result = await wrapProviderWithRateLimiting(provider, registry).callApi('prompt', {
        originalProvider,
        prompt: { raw: 'prompt', label: 'prompt' },
        vars: {},
      });

      expect(originalProvider.callApi.mock.calls.map(([input]) => input)).toEqual([
        'one',
        'one',
        'two',
      ]);
      expect(result.output).toBe('one\n---\ntwo');
      expect(result.cost).toBeCloseTo(0.04);
      expect(result.incurredCost).toBeCloseTo(0.03);
    } finally {
      registry.dispose();
    }
  });

  it('sums reported costs and excludes cached charges from incurred cost', async () => {
    const result = await runSequence([
      { output: 'one', cost: 0.01, cached: true },
      { output: 'two', cost: 0.02, incurredCost: 0.015 },
    ]);

    expect(result.output).toBe('one\n---\ntwo');
    expect(result.cost).toBeCloseTo(0.03);
    expect(result.incurredCost).toBeCloseTo(0.015);
  });

  it('leaves the totals unknown when a fresh call does not report cost', async () => {
    const result = await runSequence([{ output: 'one', cost: 0.01 }, { output: 'two' }]);

    expect(result.cost).toBeUndefined();
    expect(result.incurredCost).toBeUndefined();
  });

  it('preserves an explicitly reported zero cost', async () => {
    const result = await runSequence([
      { output: 'one', cost: 0 },
      { output: 'two', cost: 0 },
    ]);

    expect(result.cost).toBe(0);
    expect(result.incurredCost).toBe(0);
  });
});
