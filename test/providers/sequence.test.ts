import { describe, expect, it, vi } from 'vitest';
import { SequenceProvider } from '../../src/providers/sequence';

import type { ApiProvider, ProviderResponse } from '../../src/types';

function createSequenceCall(responses: ProviderResponse[]) {
  const callApi = vi.fn(async () => responses.shift()!);
  const originalProvider = { callApi } as unknown as ApiProvider;
  const provider = new SequenceProvider({
    id: 'sequence',
    config: { inputs: responses.map((_, index) => `step ${index + 1}`) },
  });

  return {
    callApi,
    provider,
    context: { originalProvider, vars: {} },
  };
}

describe('SequenceProvider', () => {
  it('should keep guardrail flags from all steps and retain the first flagged reason', async () => {
    const { provider, context } = createSequenceCall([
      {
        output: 'first response',
        guardrails: { flagged: true, flaggedInput: true, reason: 'input blocked' },
      },
      {
        output: 'second response',
        guardrails: { flagged: true, flaggedOutput: true, reason: 'output blocked' },
      },
      { output: 'final response', guardrails: { flagged: false } },
    ]);

    const response = await provider.callApi('prompt', context);

    expect(response).toMatchObject({
      output: 'first response\n---\nsecond response\n---\nfinal response',
      guardrails: {
        flagged: true,
        flaggedInput: true,
        flaggedOutput: true,
        reason: 'input blocked',
      },
    });
  });

  it('should retain guardrails stored in the final redteam history entry', async () => {
    const { provider, context } = createSequenceCall([
      {
        output: 'first response',
        metadata: { redteamHistory: [{ guardrails: { flagged: true, reason: 'blocked' } }] },
      },
      { output: 'second response', guardrails: { flagged: false } },
    ]);

    const response = await provider.callApi('prompt', context);

    expect(response.guardrails).toMatchObject({ flagged: true, reason: 'blocked' });
  });

  it('should sum reported costs and exclude cached calls from incurred cost', async () => {
    const { provider, context } = createSequenceCall([
      { output: 'cached response', cached: true, cost: 0.02 },
      { output: 'fresh response', cost: 0.03, incurredCost: 0.01 },
    ]);

    const response = await provider.callApi('prompt', context);

    expect(response.cost).toBeCloseTo(0.05);
    expect(response.incurredCost).toBeCloseTo(0.01);
  });

  it.each([false, true])(
    'accounts for a cached error after a first step with cached=%s',
    async (cached) => {
      const { provider, context } = createSequenceCall([
        {
          output: 'first response',
          cached,
          cost: 0.02,
          tokenUsage: { prompt: 2, completion: 3, total: 5, numRequests: 1 },
        },
        {
          error: 'second step failed',
          cached: true,
          cost: 0.03,
          tokenUsage: { prompt: 1, completion: 1, total: 2, numRequests: 1 },
        },
      ]);

      const response = await provider.callApi('prompt', context);

      expect(response).toMatchObject({
        error: 'second step failed',
        cached,
        cost: 0.05,
        incurredCost: cached ? 0 : 0.02,
        tokenUsage: { total: 7, cached: cached ? 7 : 2, numRequests: 2 },
      });
    },
  );

  it('should ignore non-finite reported costs', async () => {
    const { provider, context } = createSequenceCall([
      { output: 'first response', cost: 0.02 },
      { output: 'second response', cost: Number.POSITIVE_INFINITY },
    ]);

    const response = await provider.callApi('prompt', context);

    expect(response.cost).toBe(0.02);
    expect(response.incurredCost).toBe(0.02);
  });
});
