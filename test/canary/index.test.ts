import { describe, expect, it } from 'vitest';
import { generateProviderHash, generateShortProviderHash, getProviderId } from '../../src/canary';

import type { ApiProvider } from '../../src/types/providers';

function createProvider(id: string, config: Record<string, unknown>): ApiProvider {
  return {
    id: () => id,
    config,
    callApi: async () => ({ output: 'ok' }),
  };
}

describe('canary provider hashing', () => {
  it('creates stable hashes for equivalent nested provider config', () => {
    const providerA = createProvider('openai:gpt-4.1', {
      temperature: 0.2,
      nested: {
        beta: true,
        alpha: ['first', { zed: 1, apple: 2 }],
      },
    });
    const providerB = createProvider('openai:gpt-4.1', {
      nested: {
        alpha: ['first', { apple: 2, zed: 1 }],
        beta: true,
      },
      temperature: 0.2,
    });

    expect(generateProviderHash(providerA)).toBe(generateProviderHash(providerB));
  });

  it('changes hashes when provider behavior changes', () => {
    const baseProvider = { id: 'openai:gpt-4.1', config: { temperature: 0.2 } };
    const changedProvider = { id: 'openai:gpt-4.1', config: { temperature: 0.8 } };

    expect(generateProviderHash(baseProvider)).not.toBe(generateProviderHash(changedProvider));
  });

  it('returns short hashes and provider IDs consistently', () => {
    const provider = createProvider('echo', { mode: 'canary' });

    expect(generateShortProviderHash(provider)).toHaveLength(8);
    expect(generateShortProviderHash(provider, 12)).toHaveLength(12);
    expect(getProviderId(provider)).toBe('echo');
    expect(getProviderId({ config: {} })).toBe('unknown');
  });
});
