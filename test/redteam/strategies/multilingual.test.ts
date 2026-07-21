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

    const result = await addMultilingual(
      [{ vars: { prompt: 'test' } }] as any,
      'prompt',
      {
        languages: ['es'],
      },
      {
        wrapGenerationProvider,
      },
    );

    expect(wrapGenerationProvider).toHaveBeenCalledWith(loadedProvider);
    expect(trackedProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result[0]?.vars?.prompt).toBe('con seguimiento');
  });

  it('uses the request-scoped generation provider for local fallback', async () => {
    const requestProvider = createMockProvider({
      id: 'request-provider',
      response: createProviderResponse({ output: JSON.stringify({ es: 'con proveedor actual' }) }),
    });

    const result = await addMultilingual(
      [{ vars: { prompt: 'test' } }] as any,
      'prompt',
      {
        languages: ['es'],
      },
      {
        generationProvider: requestProvider,
      },
    );

    expect(redteamProviderManager.getMultilingualProvider).not.toHaveBeenCalled();
    expect(redteamProviderManager.getProvider).not.toHaveBeenCalled();
    expect(requestProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result[0]?.vars?.prompt).toBe('con proveedor actual');
  });

  it('keeps runtime providers out of remote generation payloads', async () => {
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
    const requestProvider = {
      id: () => 'anthropic:claude-sonnet-4-20250514',
      callApi: vi.fn(),
      apiKey: 'resolved-secret',
    };
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        result: [
          {
            vars: { prompt: 'remoto' },
            metadata: { originalText: 'test', language: 'es' },
          },
        ],
      },
      status: 200,
      statusText: 'OK',
    } as any);

    await addMultilingual(
      [{ vars: { prompt: 'test' } }] as any,
      'prompt',
      {
        languages: ['es'],
        batchSize: 2,
        maxConcurrency: 3,
        remoteChunkSize: 4,
        env: { CANARY: 'env-secret' },
        apiKey: 'config-secret',
        headers: { Authorization: 'Bearer header-secret' },
      },
      {
        generationProvider: requestProvider as any,
        generationProviderSpec: 'anthropic:claude-sonnet-4-20250514',
      },
    );

    const requestBody = vi.mocked(fetchWithCache).mock.calls[0]?.[1]?.body;
    expect(requestBody).toBeTypeOf('string');
    expect(requestBody).not.toContain('resolved-secret');
    expect(requestBody).not.toContain('env-secret');
    expect(requestBody).not.toContain('config-secret');
    expect(requestBody).not.toContain('header-secret');
    expect(JSON.parse(requestBody as string).config).toEqual({
      languages: ['es'],
      batchSize: 2,
      maxConcurrency: 3,
      remoteChunkSize: 4,
    });
  });

  it('stays local when a runtime provider has no serializable spec', async () => {
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
    const requestProvider = createMockProvider({
      id: 'runtime-only',
      response: createProviderResponse({ output: JSON.stringify({ es: 'local' }) }),
    });

    const result = await addMultilingual(
      [{ vars: { prompt: 'test' } }] as any,
      'prompt',
      { languages: ['es'] },
      { generationProvider: requestProvider },
    );

    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(requestProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result[0]?.vars?.prompt).toBe('local');
  });
});
