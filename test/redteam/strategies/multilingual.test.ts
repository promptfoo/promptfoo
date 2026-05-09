import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import * as remoteGeneration from '../../../src/redteam/remoteGeneration';
import { addMultilingual, translateBatch } from '../../../src/redteam/strategies/multilingual';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

vi.mock('../../../src/redteam/providers/shared');
vi.mock('../../../src/redteam/remoteGeneration');

describe('multilingual strategy token usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(false);
  });

  it('returns accumulated usage from local translation batches', async () => {
    const mockProvider = createMockProvider({
      id: 'mock',
      response: createProviderResponse({
        output: JSON.stringify({ es: 'hola' }),
        tokenUsage: { total: 9, prompt: 5, completion: 4 },
      }),
    });
    vi.mocked(redteamProviderManager.getMultilingualProvider).mockResolvedValue(mockProvider);

    const result = await translateBatch('hello', ['es']);

    expect(result.translations).toEqual({ es: 'hola' });
    expect(result.tokenUsage).toMatchObject({
      total: 9,
      prompt: 5,
      completion: 4,
      numRequests: 1,
    });
  });

  it('preserves one-row one-language translation usage in providerTokenUsage', async () => {
    const mockProvider = createMockProvider({
      id: 'mock',
      response: createProviderResponse({
        output: JSON.stringify({ es: 'hola' }),
        tokenUsage: { total: 9, prompt: 5, completion: 4 },
      }),
    });
    vi.mocked(redteamProviderManager.getMultilingualProvider).mockResolvedValue(mockProvider);

    const result = await addMultilingual([{ vars: { prompt: 'hello' } }] as any, 'prompt', {
      languages: ['es'],
    });

    expect(result[0]?.metadata?.providerTokenUsage).toMatchObject({
      total: 9,
      prompt: 5,
      completion: 4,
      numRequests: 1,
    });
  });

  it('does not duplicate shared translation usage across fan-out rows', async () => {
    const mockProvider = createMockProvider({
      id: 'mock',
      response: createProviderResponse({
        output: JSON.stringify({ es: 'hola', fr: 'bonjour' }),
        tokenUsage: { total: 12, prompt: 7, completion: 5, numRequests: 1 },
      }),
    });
    vi.mocked(redteamProviderManager.getMultilingualProvider).mockResolvedValue(mockProvider);

    const result = await addMultilingual([{ vars: { prompt: 'hello' } }] as any, 'prompt', {
      languages: ['es', 'fr'],
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.metadata).not.toHaveProperty('providerTokenUsage');
    expect(result[1]?.metadata).not.toHaveProperty('providerTokenUsage');
  });
});
