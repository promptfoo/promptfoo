import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import * as remoteGeneration from '../../../src/redteam/remoteGeneration';
import { addMultilingual } from '../../../src/redteam/strategies/multilingual';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

vi.mock('../../../src/redteam/providers/shared');
vi.mock('../../../src/redteam/remoteGeneration');

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
});
