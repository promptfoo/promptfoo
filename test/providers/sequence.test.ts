import { describe, expect, it } from 'vitest';
import { SequenceProvider } from '../../src/providers/sequence';
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
