import { describe, expect, it, vi } from 'vitest';
import { SequenceProvider } from '../../src/providers/sequence';

import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../src/types';

function providerWith(responses: ProviderResponse[]): ApiProvider {
  const callApi = vi.fn();
  responses.forEach((response) => callApi.mockResolvedValueOnce(response));
  return { id: () => 'mock', callApi } as unknown as ApiProvider;
}

function contextFor(originalProvider: ApiProvider): CallApiContextParams {
  return { originalProvider, vars: {} } as unknown as CallApiContextParams;
}

function sequence() {
  return new SequenceProvider({
    id: 'sequence',
    config: { inputs: ['first {{ prompt }}', 'second {{ prompt }}'] },
  });
}

describe('SequenceProvider', () => {
  it('keeps the cost of earlier steps when a later step fails', async () => {
    const original = providerWith([
      { output: 'first', tokenUsage: { total: 2, prompt: 1, completion: 1, numRequests: 1 } },
      {
        error: 'second step failed',
        tokenUsage: { total: 1, prompt: 1, completion: 0, numRequests: 1 },
      },
    ]);

    const result = await sequence().callApi('hello', contextFor(original));

    expect(result.error).toBe('second step failed');
    expect(result.tokenUsage?.total).toBe(3);
    expect(result.tokenUsage?.numRequests).toBe(2);
  });

  it('still accumulates usage across successful steps', async () => {
    const original = providerWith([
      { output: 'first', tokenUsage: { total: 2, prompt: 1, completion: 1, numRequests: 1 } },
      { output: 'second', tokenUsage: { total: 1, prompt: 1, completion: 0, numRequests: 1 } },
    ]);

    const result = await sequence().callApi('hello', contextFor(original));

    expect(result.output).toBe('first\n---\nsecond');
    expect(result.tokenUsage?.total).toBe(3);
    expect(result.tokenUsage?.numRequests).toBe(2);
  });
});
