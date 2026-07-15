import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import * as remoteGeneration from '../../../src/redteam/remoteGeneration';
import { addMultilingual } from '../../../src/redteam/strategies/multilingual';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

vi.mock('../../../src/redteam/providers/shared');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('../../../src/cache');

describe('multilingual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(false);
    vi.mocked(redteamProviderManager.getMultilingualProvider).mockResolvedValue(undefined);
  });

  it('routes locally loaded providers through the generation usage wrapper', async () => {
    const loadedProvider = createMockProvider({
      id: 'loaded',
      response: createProviderResponse({ output: JSON.stringify({ es: 'sin seguimiento' }) }),
    });
    const trackedProvider = createMockProvider({
      id: 'tracked',
      response: createProviderResponse({ output: JSON.stringify({ es: 'con seguimiento' }) }),
    });
    const wrapGenerationProvider = vi.fn().mockReturnValue(trackedProvider);

    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(loadedProvider);

    const result = await addMultilingual([{ vars: { prompt: 'test' } }] as any, 'prompt', {
      languages: ['es'],
      __wrapGenerationProvider: wrapGenerationProvider,
    });

    expect(wrapGenerationProvider).toHaveBeenCalledWith(loadedProvider);
    expect(trackedProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result[0]?.vars?.prompt).toBe('con seguimiento');
  });

  it('reports usage from remote multilingual generation', async () => {
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        result: [
          {
            vars: { prompt: 'con seguimiento' },
            metadata: { originalText: 'test', language: 'es' },
          },
        ],
        tokenUsage: { total: 11, prompt: 7, completion: 4, numRequests: 1 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const trackGenerationTokenUsage = vi.fn();

    const result = await addMultilingual([{ vars: { prompt: 'test' } }] as any, 'prompt', {
      languages: ['es'],
      __trackGenerationTokenUsage: trackGenerationTokenUsage,
    });

    expect(result[0]?.vars?.prompt).toBe('con seguimiento');
    expect(trackGenerationTokenUsage).toHaveBeenCalledWith({
      tokenUsage: { total: 11, prompt: 7, completion: 4, numRequests: 1 },
      cached: false,
    });
  });

  it('reports each failed remote multilingual attempt across retries', async () => {
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('Network timeout'));
    const trackGenerationTokenUsage = vi.fn();

    await addMultilingual(
      [{ vars: { prompt: 'test one' } }, { vars: { prompt: 'test two' } }] as any,
      'prompt',
      {
        languages: ['es'],
        __trackGenerationTokenUsage: trackGenerationTokenUsage,
      },
    );

    expect(fetchWithCache).toHaveBeenCalledTimes(3);
    expect(trackGenerationTokenUsage).toHaveBeenCalledTimes(3);
    expect(trackGenerationTokenUsage).toHaveBeenNthCalledWith(1, {
      tokenUsage: undefined,
      cached: false,
    });
    expect(trackGenerationTokenUsage).toHaveBeenNthCalledWith(2, {
      tokenUsage: undefined,
      cached: false,
    });
    expect(trackGenerationTokenUsage).toHaveBeenNthCalledWith(3, {
      tokenUsage: undefined,
      cached: false,
    });
  });
});
