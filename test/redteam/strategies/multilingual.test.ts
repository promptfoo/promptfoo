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
        generationProviderSelection: {
          provider: requestProvider,
          source: 'explicit',
        },
      },
    );

    expect(redteamProviderManager.getMultilingualProvider).not.toHaveBeenCalled();
    expect(redteamProviderManager.getProvider).not.toHaveBeenCalled();
    expect(requestProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result[0]?.vars?.prompt).toBe('con proveedor actual');
  });

  it('keeps the multilingual JSON provider for the built-in default path', async () => {
    const multilingualProvider = createMockProvider({
      id: 'multilingual-json',
      response: createProviderResponse({ output: JSON.stringify({ es: 'especializado' }) }),
    });
    vi.mocked(redteamProviderManager.getMultilingualProvider).mockResolvedValue(
      multilingualProvider,
    );

    const result = await addMultilingual(
      [{ vars: { prompt: 'test' } }] as any,
      'prompt',
      { languages: ['es'] },
      {
        generationProviderSelection: {
          provider: createMockProvider({ id: 'default-regular' }),
          source: 'default',
        },
      },
    );

    expect(redteamProviderManager.getMultilingualProvider).toHaveBeenCalled();
    expect(multilingualProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result[0]?.vars?.prompt).toBe('especializado');
  });

  it('keeps explicit providers local instead of sending them to remote generation', async () => {
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
    const requestProvider = createMockProvider({
      id: 'anthropic:claude-sonnet-4-20250514',
      response: createProviderResponse({ output: JSON.stringify({ es: 'local-explicit' }) }),
    });
    Object.assign(requestProvider, { apiKey: 'resolved-secret' });
    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(requestProvider);
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
        generationProviderSelection: {
          provider: requestProvider as any,
          source: 'explicit',
          localProviderSpec: 'anthropic:claude-sonnet-4-20250514',
          persistableId: 'anthropic:claude-sonnet-4-20250514',
        },
      },
    );

    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(redteamProviderManager.getProvider).toHaveBeenCalledWith({
      provider: 'anthropic:claude-sonnet-4-20250514',
      jsonOnly: true,
      preferSmallModel: true,
    });
    expect(requestProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('sends only the remote multilingual contract for the default path', async () => {
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
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
        targetId: 'cloud-target-123',
        env: { CANARY: 'env-secret' },
        apiKey: 'config-secret',
        headers: { Authorization: 'Bearer header-secret' },
      },
      {
        generationProviderSelection: {
          provider: createMockProvider({ id: 'default-regular' }),
          source: 'default',
        },
      },
    );

    const body = vi.mocked(fetchWithCache).mock.calls[0]?.[1]?.body;
    expect(body).toBeTypeOf('string');
    expect(JSON.parse(body as string)).toMatchObject({
      task: 'multilingual',
      injectVar: 'prompt',
      config: {
        languages: ['es'],
        batchSize: 2,
        maxConcurrency: 3,
      },
      targetId: 'cloud-target-123',
    });
    expect(JSON.parse(body as string).config).not.toHaveProperty('remoteChunkSize');
    expect(body).not.toContain('env-secret');
    expect(body).not.toContain('config-secret');
    expect(body).not.toContain('header-secret');
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
      {
        generationProviderSelection: {
          provider: requestProvider,
          source: 'explicit',
        },
      },
    );

    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(requestProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result[0]?.vars?.prompt).toBe('local');
  });
});
