import { describe, expect, it, vi } from 'vitest';
import {
  recordGenerationTokenUsage,
  trackAdditionalGenerationProvider,
  trackGenerationTokenUsage,
} from '../../src/redteam/generationTokenUsage';

import type { ApiProvider, TokenUsage } from '../../src/types/index';

function createProvider(callApi: ApiProvider['callApi']): ApiProvider {
  return { id: () => 'generation-provider', callApi };
}

describe('generation token usage', () => {
  it('does not count cached provider responses or their historical token usage', async () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(
        vi.fn().mockResolvedValue({
          output: 'cached generation',
          cached: true,
          tokenUsage: { total: 30, prompt: 20, completion: 10, numRequests: 1 },
        }),
      ),
      usage,
    );

    await provider.callApi('generate a test');

    expect(usage).toEqual({});
  });

  it('counts actual provider requests that contain prompt-cache token details', async () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(
        vi.fn().mockResolvedValue({
          output: 'fresh generation',
          cached: false,
          tokenUsage: { total: 30, prompt: 20, completion: 10, cached: 15 },
        }),
      ),
      usage,
    );

    await provider.callApi('generate a test');

    expect(usage).toMatchObject({
      total: 30,
      prompt: 20,
      completion: 10,
      cached: 15,
      numRequests: 1,
    });
  });

  it('counts failed provider requests even when token usage is unavailable', async () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(vi.fn().mockRejectedValue(new Error('generation timed out'))),
      usage,
    );

    await expect(provider.callApi('generate a test')).rejects.toThrow('generation timed out');

    expect(usage).toEqual({ numRequests: 1 });
  });

  it('preserves token usage from failed provider requests exactly once', async () => {
    const usage: TokenUsage = {};
    const error = Object.assign(new Error('generation failed'), {
      tokenUsage: { total: 14, prompt: 9, completion: 5 },
    });
    const provider = trackGenerationTokenUsage(
      createProvider(vi.fn().mockRejectedValue(error)),
      usage,
    );

    await expect(provider.callApi('generate a test')).rejects.toThrow('generation failed');

    expect(usage).toMatchObject({ total: 14, prompt: 9, completion: 5, numRequests: 1 });
  });

  it('applies the same cache rules to specialized generation providers', async () => {
    const usage: TokenUsage = {};
    const parent = trackGenerationTokenUsage(
      createProvider(vi.fn().mockResolvedValue({ output: 'unused' })),
      usage,
    );
    const specialized = trackAdditionalGenerationProvider(
      createProvider(
        vi.fn().mockResolvedValue({
          output: 'cached specialized generation',
          cached: true,
          tokenUsage: { total: 45, numRequests: 1 },
        }),
      ),
      parent,
    );

    await specialized.callApi('generate a specialized test');

    expect(usage).toEqual({});
  });

  it('ignores cached direct remote generation responses', () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(vi.fn().mockResolvedValue({ output: 'unused' })),
      usage,
    );

    recordGenerationTokenUsage(provider, {
      cached: true,
      tokenUsage: { total: 40, numRequests: 2 },
    });

    expect(usage).toEqual({});
  });
});
