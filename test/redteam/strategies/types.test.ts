import { describe, expect, it } from 'vitest';
import { withPersistableGenerationProvider } from '../../../src/redteam/strategies/types';

describe('withPersistableGenerationProvider', () => {
  it('persists a provider ID for generated attack-provider configs', () => {
    expect(
      withPersistableGenerationProvider(
        { strategyText: 'test' },
        { generationProviderSpec: 'anthropic:claude-sonnet-4' },
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
        generationProvider: runtimeProvider as any,
      }),
    ).toBe(config);
  });
});
