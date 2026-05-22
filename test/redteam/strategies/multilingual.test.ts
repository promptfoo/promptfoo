import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import * as remoteGeneration from '../../../src/redteam/remoteGeneration';
import {
  addMultilingual,
  addMultilingualWithMetadata,
  translateBatch,
} from '../../../src/redteam/strategies/multilingual';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

vi.mock('../../../src/cache');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));
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

  it('preserves shared local translation usage at the task level', async () => {
    const mockProvider = createMockProvider({
      id: 'mock',
      response: createProviderResponse({
        output: JSON.stringify({ es: 'hola', fr: 'bonjour' }),
        tokenUsage: { total: 12, prompt: 7, completion: 5, numRequests: 1 },
      }),
    });
    vi.mocked(redteamProviderManager.getMultilingualProvider).mockResolvedValue(mockProvider);

    const result = await addMultilingualWithMetadata(
      [{ vars: { prompt: 'hello' } }] as any,
      'prompt',
      {
        languages: ['es', 'fr'],
      },
    );

    expect(result.result).toHaveLength(2);
    expect(result.tokenUsage).toMatchObject({
      total: 12,
      prompt: 7,
      completion: 5,
      numRequests: 1,
    });
  });

  it('preserves remote multilingual task usage at the task level', async () => {
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
    vi.mocked(remoteGeneration.getRemoteGenerationUrl).mockReturnValue('https://example.test/task');
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        result: [
          {
            vars: { prompt: 'hola' },
            metadata: { originalText: 'hello', language: 'es' },
          },
        ],
        task: 'multilingual',
        tokenUsage: { total: 14, prompt: 8, completion: 6, numRequests: 1 },
      },
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    const result = await addMultilingualWithMetadata(
      [{ vars: { prompt: 'hello' } }] as any,
      'prompt',
      {
        languages: ['es'],
        remoteChunkSize: 1,
      },
    );

    expect(result.result).toHaveLength(1);
    expect(result.tokenUsage).toMatchObject({
      total: 14,
      prompt: 8,
      completion: 6,
      numRequests: 1,
    });
  });

  it('warns when local generation cannot produce all requested translations', async () => {
    const mockProvider = createMockProvider({
      id: 'mock',
      response: createProviderResponse({
        output: '{}',
      }),
    });
    vi.mocked(redteamProviderManager.getMultilingualProvider).mockResolvedValue(mockProvider);

    const result = await addMultilingualWithMetadata(
      [{ vars: { prompt: 'hello' } }] as any,
      'prompt',
      { languages: ['es'] },
    );

    expect(result.result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      '[Multilingual] Generated fewer translated test cases than requested',
      { expected: 1, generated: 0, source: 'local' },
    );
  });

  it('warns when remote generation returns partial language coverage', async () => {
    vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
    vi.mocked(remoteGeneration.getRemoteGenerationUrl).mockReturnValue('https://example.test/task');
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        result: [
          {
            vars: { prompt: 'hola' },
            metadata: { originalText: 'hello', language: 'es' },
          },
        ],
        task: 'multilingual',
      },
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    const result = await addMultilingualWithMetadata(
      [{ vars: { prompt: 'hello' } }] as any,
      'prompt',
      { languages: ['es', 'fr'], remoteChunkSize: 1 },
    );

    expect(result.result).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[Multilingual] Generated fewer translated test cases than requested',
      { expected: 2, generated: 1, source: 'remote' },
    );
  });
});
