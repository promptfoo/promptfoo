import { describe, expect, it, vi } from 'vitest';
import {
  normalizeConfigForPersistence,
  normalizePersistedConfigForResume,
} from '../../../src/util/config/persistence';

import type { ApiProvider, UnifiedConfig } from '../../../src/types/index';

describe('config persistence', () => {
  it('persists instantiated providers with replayable ids and metadata', () => {
    const provider = {
      id: () => 'echo',
      label: 'Echo target',
      delay: 0,
      callApi: async () => ({ output: 'ok' }),
    } satisfies ApiProvider;

    expect(
      normalizeConfigForPersistence({
        providers: [provider] as any,
      }),
    ).toEqual({
      providers: [
        {
          id: 'echo',
          label: 'Echo target',
          delay: 0,
        },
      ],
    });
  });

  it('does not inspect result rows when persisted providers are already replayable', async () => {
    const loadResultProviders = vi.fn().mockResolvedValue([{ id: 'unused' }]);
    const config = {
      providers: ['echo', { id: 'openai:chat:gpt-4.1', label: 'OpenAI' }],
    } satisfies Partial<UnifiedConfig>;

    await expect(normalizePersistedConfigForResume(config, loadResultProviders)).resolves.toBe(
      config,
    );
    expect(loadResultProviders).not.toHaveBeenCalled();
  });

  it('repairs legacy provider summaries using provider ids from result rows', async () => {
    const loadResultProviders = vi.fn().mockResolvedValue([{ id: 'echo', label: 'Echo target' }]);
    const config = {
      providers: [{ label: 'Echo target', delay: 0 }],
    } as unknown as Partial<UnifiedConfig>;

    await expect(normalizePersistedConfigForResume(config, loadResultProviders)).resolves.toEqual({
      providers: [{ id: 'echo', label: 'Echo target', delay: 0 }],
    });
    expect(loadResultProviders).toHaveBeenCalledTimes(1);
  });

  it('disambiguates legacy providers with duplicate labels using config', async () => {
    const loadResultProviders = vi.fn().mockResolvedValue([
      { id: 'openai:chat:model-a', label: 'Shared label', config: { model: 'a' } },
      { id: 'openai:chat:model-b', label: 'Shared label', config: { model: 'b' } },
    ]);
    const config = {
      providers: [
        { label: 'Shared label', config: { model: 'a' } },
        { label: 'Shared label', config: { model: 'b' } },
      ],
    } as unknown as Partial<UnifiedConfig>;

    await expect(normalizePersistedConfigForResume(config, loadResultProviders)).resolves.toEqual({
      providers: [
        { id: 'openai:chat:model-a', label: 'Shared label', config: { model: 'a' } },
        { id: 'openai:chat:model-b', label: 'Shared label', config: { model: 'b' } },
      ],
    });
  });
});
