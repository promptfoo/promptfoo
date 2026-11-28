import { afterEach, describe, expect, it, vi } from 'vitest';
import { SequenceProvider } from '../../src/providers/sequence';

import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../src/types/index';

function contextWithSteps(...responses: ProviderResponse[]): {
  context: CallApiContextParams;
  callApi: ReturnType<typeof vi.fn>;
} {
  const callApi = vi.fn();
  for (const response of responses) {
    callApi.mockResolvedValueOnce(response);
  }
  const originalProvider = { id: () => 'mock-target', callApi } as unknown as ApiProvider;
  return {
    context: { originalProvider, prompt: { raw: 'p', label: 'p' }, vars: {} },
    callApi,
  };
}

function sequence(inputs: string[]) {
  return new SequenceProvider({ id: 'sequence', config: { inputs } });
}

describe('SequenceProvider', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('sends each input in order and joins the outputs', async () => {
    const { context, callApi } = contextWithSteps({ output: 'one' }, { output: 'two' });

    const result = await sequence(['first {{prompt}}', 'second']).callApi('hello', context);

    expect(callApi).toHaveBeenNthCalledWith(1, 'first hello', context, undefined);
    expect(callApi).toHaveBeenNthCalledWith(2, 'second', context, undefined);
    expect(result.output).toBe('one\n---\ntwo');
    expect(result.error).toBeUndefined();
  });

  it('reports the summed cost of every step when the sequence succeeds', async () => {
    const { context } = contextWithSteps(
      { output: 'one', cost: 0.02 },
      { output: 'two', cost: 0.01 },
    );

    const result = await sequence(['a', 'b']).callApi('p', context);

    expect(result.cost).toBeCloseTo(0.03);
  });

  it('keeps the cost and token usage of earlier steps when a later step fails', async () => {
    const { context, callApi } = contextWithSteps(
      { output: 'one', cost: 0.02, tokenUsage: { prompt: 10, completion: 5, total: 15 } },
      { error: 'step two failed', cost: 0.01, tokenUsage: { prompt: 4, completion: 0, total: 4 } },
      { output: 'never sent' },
    );

    const result = await sequence(['a', 'b', 'c']).callApi('p', context);

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(result.error).toBe('step two failed');
    expect(result.cost).toBeCloseTo(0.03);
    expect(result.tokenUsage).toMatchObject({ prompt: 14, completion: 5, total: 19 });
  });

  it('counts a cached step as cost but not as incurred cost', async () => {
    const { context } = contextWithSteps(
      { output: 'one', cost: 0.02, cached: true },
      { output: 'two', cost: 0.01 },
    );

    const result = await sequence(['a', 'b']).callApi('p', context);

    expect(result.cost).toBeCloseTo(0.03);
    expect(result.incurredCost).toBeCloseTo(0.01);
  });

  it("replaces a failing step's own incurred cost with the sequence total", async () => {
    const { context } = contextWithSteps(
      { output: 'one', cost: 0.02, cached: true },
      { error: 'step two failed', cost: 0.01, incurredCost: 0.01 },
    );

    const result = await sequence(['a', 'b']).callApi('p', context);

    expect(result.cost).toBeCloseTo(0.03);
    expect(result.incurredCost).toBeCloseTo(0.01);

    const { context: uncachedContext } = contextWithSteps(
      { output: 'one', cost: 0.02 },
      { error: 'step two failed', cost: 0.01, incurredCost: 0.01 },
    );

    const uncached = await sequence(['a', 'b']).callApi('p', uncachedContext);

    expect(uncached.cost).toBeCloseTo(0.03);
    expect(uncached.incurredCost ?? uncached.cost).toBeCloseTo(0.03);
  });

  it('does not mark a sequence as cached when only the failing step was cached', async () => {
    const { context } = contextWithSteps(
      { output: 'one', cost: 0.02, tokenUsage: { prompt: 10, completion: 5, total: 15 } },
      { error: 'parser rejected the cached reply', cost: 0, cached: true },
    );

    const result = await sequence(['a', 'b']).callApi('p', context);

    expect(result.error).toBe('parser rejected the cached reply');
    expect(result.cached).toBeFalsy();
    expect(result.cost).toBeCloseTo(0.02);
    expect(result.incurredCost ?? result.cost).toBeCloseTo(0.02);
  });

  it('marks the sequence as cached when every step was cached', async () => {
    const { context } = contextWithSteps(
      { output: 'one', cost: 0.02, cached: true },
      { output: 'two', cost: 0.01, cached: true },
    );

    const result = await sequence(['a', 'b']).callApi('p', context);

    expect(result.cached).toBe(true);
    expect(result.cost).toBeCloseTo(0.03);
    expect(result.incurredCost).toBe(0);
  });

  it('keeps an incurred cost that a step reports without a cost', async () => {
    const { context } = contextWithSteps({ error: 'failed', incurredCost: 0.02 });

    const result = await sequence(['a']).callApi('p', context);

    expect(result.cost).toBeUndefined();
    expect(result.incurredCost).toBeCloseTo(0.02);
  });

  it('leaves cost unset when no step reports one', async () => {
    const { context } = contextWithSteps({ output: 'one' }, { output: 'two' });

    const result = await sequence(['a', 'b']).callApi('p', context);

    expect(result.cost).toBeUndefined();
    expect(result.incurredCost).toBeUndefined();
  });
});
