import { describe, expect, it } from 'vitest';
import { withPersistableGenerationProvider } from '../../../src/redteam/strategies/types';

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
