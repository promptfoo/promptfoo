import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  redteamProviderManager,
  setRedteamProviderLoader,
} from '../../../src/redteam/providers/shared';
import {
  getStrategyGenerationProvider,
  withPersistableGenerationProvider,
} from '../../../src/redteam/strategies/types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getStrategyGenerationProvider', () => {
  it('reuses cached provider variants instead of reloading their spec', async () => {
    const cachedJsonProvider = { id: () => 'cached-json' } as any;
    const getProvider = vi
      .spyOn(redteamProviderManager, 'getProvider')
      .mockResolvedValue(cachedJsonProvider);

    const result = await getStrategyGenerationProvider({
      runtimeContext: {
        generationProviderSelection: {
          provider: { id: () => 'cached-regular' } as any,
          source: 'cache',
          localProviderSpec: 'openai:chat:cached-provider',
        },
      },
      jsonOnly: true,
      preferSmallModel: true,
    });

    expect(result).toBe(cachedJsonProvider);
    expect(getProvider).toHaveBeenCalledWith({ jsonOnly: true, preferSmallModel: true });
  });

  it('keeps the selected cached JSON provider when another request replaces the cache', async () => {
    const firstProvider = { id: () => 'first-provider', callApi: vi.fn() } as any;
    const firstJsonProvider = { id: () => 'first-json-provider', callApi: vi.fn() } as any;
    const secondProvider = { id: () => 'second-provider', callApi: vi.fn() } as any;
    const secondJsonProvider = { id: () => 'second-json-provider', callApi: vi.fn() } as any;
    const loader = vi
      .fn()
      .mockResolvedValueOnce([firstProvider])
      .mockResolvedValueOnce([firstJsonProvider])
      .mockResolvedValueOnce([secondProvider])
      .mockResolvedValueOnce([secondJsonProvider]);
    const restoreLoader = setRedteamProviderLoader(loader);

    try {
      await redteamProviderManager.setProvider('first-provider');
      const selection = await redteamProviderManager.getProviderSelection();
      await redteamProviderManager.setProvider('second-provider');

      const result = await getStrategyGenerationProvider({
        runtimeContext: { generationProviderSelection: selection },
        jsonOnly: true,
        preferSmallModel: true,
      });

      expect(result.id()).toBe('first-json-provider');
      expect(result).toBe(firstJsonProvider);
    } finally {
      redteamProviderManager.clearProvider();
      restoreLoader();
    }
  });

  it('prefers the dedicated multilingual cache for cached selections', async () => {
    const multilingualProvider = { id: () => 'cached-multilingual' } as any;
    const getMultilingualProvider = vi
      .spyOn(redteamProviderManager, 'getMultilingualProvider')
      .mockResolvedValue(multilingualProvider);
    const getProvider = vi.spyOn(redteamProviderManager, 'getProvider');

    const result = await getStrategyGenerationProvider({
      runtimeContext: {
        generationProviderSelection: {
          provider: { id: () => 'cached-regular' } as any,
          source: 'cache',
          localProviderSpec: 'openai:chat:cached-provider',
        },
      },
      preferMultilingualProvider: true,
    });

    expect(result).toBe(multilingualProvider);
    expect(getMultilingualProvider).toHaveBeenCalledTimes(1);
    expect(getProvider).not.toHaveBeenCalled();
  });
});

describe('withPersistableGenerationProvider', () => {
  it('persists a provider ID for generated attack-provider configs', () => {
    expect(
      withPersistableGenerationProvider(
        { strategyText: 'test' },
        {
          generationProviderSelection: {
            provider: {} as any,
            source: 'explicit',
            persistableId: 'anthropic:claude-sonnet-4',
          },
        },
      ),
    ).toEqual({
      strategyText: 'test',
      redteamProvider: 'anthropic:claude-sonnet-4',
    });
  });

  it('does not add provider options or live providers to generated configs', () => {
    const config = { strategyText: 'test' };
    const runtimeProvider = {
      id: () => 'anthropic:claude-sonnet-4',
      callApi: () => Promise.resolve({ output: 'test' }),
      apiKey: 'resolved-secret',
    };

    expect(
      withPersistableGenerationProvider(config, {
        generationProviderSelection: {
          provider: runtimeProvider as any,
          source: 'explicit',
        },
      }),
    ).toBe(config);
  });

  it('preserves a step-local provider override', () => {
    const config = { redteamProvider: 'openai:gpt-4.1' };

    expect(
      withPersistableGenerationProvider(config, {
        generationProviderSelection: {
          provider: {} as any,
          source: 'explicit',
          persistableId: 'anthropic:claude-sonnet-4',
        },
      }),
    ).toBe(config);
  });
});
