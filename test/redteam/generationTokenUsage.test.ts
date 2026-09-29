import { describe, expect, it, vi } from 'vitest';
import {
  recordGenerationTokenUsage,
  trackAdditionalGenerationProvider,
  trackGenerationTokenUsage,
} from '../../src/redteam/generationTokenUsage';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';

import type { ApiProvider, TokenUsage } from '../../src/types/index';

function createProvider(callApi: ApiProvider['callApi']): ApiProvider {
  return { id: () => 'generation-provider', callApi };
}

describe('generation token usage', () => {
  it('preserves cached generation in the logical footprint without incurring usage', async () => {
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

    expect(usage).toMatchObject({
      total: 30,
      prompt: 20,
      completion: 10,
      cached: 30,
      numRequests: 1,
      incurredTokenUsage: { total: 0, numRequests: 0 },
    });
  });

  it('does not replay historical incurred usage from cached composite generation', async () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(
        vi.fn().mockResolvedValue({
          output: 'cached composite generation',
          cached: true,
          tokenUsage: {
            total: 30,
            prompt: 20,
            completion: 10,
            numRequests: 1,
            incurredTokenUsage: {
              total: 30,
              prompt: 20,
              completion: 10,
              numRequests: 1,
              assertions: { total: 7, numRequests: 1 },
            },
          },
        }),
      ),
      usage,
    );

    await provider.callApi('generate a test');

    expect(usage).toMatchObject({
      total: 30,
      prompt: 20,
      completion: 10,
      cached: 30,
      numRequests: 1,
      incurredTokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
        numRequests: 0,
        assertions: { total: 0, numRequests: 0 },
      },
    });
  });

  it('retains explicit incurred accounting for fresh composite generation', async () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(
        vi.fn().mockResolvedValue({
          output: 'fresh composite generation',
          tokenUsage: {
            total: 30,
            numRequests: 2,
            incurredTokenUsage: { total: 12, numRequests: 1 },
          },
        }),
      ),
      usage,
    );

    await provider.callApi('generate a test');

    expect(usage).toMatchObject({
      total: 30,
      numRequests: 2,
      incurredTokenUsage: { total: 12, numRequests: 1 },
    });
  });

  it.each([false, undefined])(
    'counts reported zero-token generation requests when cached is %s',
    async (cached) => {
      const usage: TokenUsage = {};
      const provider = trackGenerationTokenUsage(
        createProvider(
          vi.fn().mockResolvedValue({
            output: 'unmetered generation',
            cached,
            tokenUsage: { ...createEmptyTokenUsage(), numRequests: 1 },
          }),
        ),
        usage,
      );

      await provider.callApi('generate a test');

      expect(usage).toMatchObject({ total: 0, numRequests: 1 });
    },
  );

  it.each([false, undefined])(
    'preserves explicit zero-request generation usage when cached is %s',
    async (cached) => {
      const usage: TokenUsage = {};
      const provider = trackGenerationTokenUsage(
        createProvider(
          vi.fn().mockResolvedValue({
            output: 'unmetered generation',
            cached,
            tokenUsage: createEmptyTokenUsage(),
          }),
        ),
        usage,
      );

      await provider.callApi('generate a test');

      expect(usage).toMatchObject({
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
      });
    },
  );

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

  it('keeps fresh generation incurred when cached responses follow it', async () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(
        vi
          .fn()
          .mockResolvedValueOnce({
            output: 'fresh generation',
            tokenUsage: { total: 20, prompt: 12, completion: 8, numRequests: 1 },
          })
          .mockResolvedValueOnce({
            output: 'cached generation',
            cached: true,
            tokenUsage: { total: 30, prompt: 20, completion: 10, numRequests: 1 },
          }),
      ),
      usage,
    );

    await provider.callApi('generate the first test');
    await provider.callApi('generate the second test');

    expect(usage).toMatchObject({
      total: 50,
      prompt: 32,
      completion: 18,
      cached: 30,
      numRequests: 2,
      incurredTokenUsage: { total: 20, prompt: 12, completion: 8, numRequests: 1 },
    });
  });

  it('counts failed provider requests even when token usage is unavailable', async () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(vi.fn().mockRejectedValue(new Error('generation timed out'))),
      usage,
    );

    await expect(provider.callApi('generate a test')).rejects.toThrow('generation timed out');

    expect(usage).toMatchObject({ total: 0, numRequests: 1 });
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

  it('preserves cached specialized generation without incurring usage', async () => {
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

    expect(usage).toMatchObject({
      total: 45,
      cached: 45,
      numRequests: 1,
      incurredTokenUsage: { total: 0, numRequests: 0 },
    });
  });

  it('preserves cached direct remote generation without incurring usage', () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(vi.fn().mockResolvedValue({ output: 'unused' })),
      usage,
    );

    recordGenerationTokenUsage(provider, {
      cached: true,
      tokenUsage: { total: 40, numRequests: 2 },
    });

    expect(usage).toMatchObject({
      total: 40,
      cached: 40,
      numRequests: 2,
      incurredTokenUsage: { total: 0, numRequests: 0 },
    });
  });

  it('discards historical incurred accounting from cached remote generation', () => {
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(vi.fn().mockResolvedValue({ output: 'unused' })),
      usage,
    );

    recordGenerationTokenUsage(provider, {
      cached: true,
      tokenUsage: {
        total: 40,
        numRequests: 2,
        incurredTokenUsage: { total: 25, numRequests: 1 },
      },
    });

    expect(usage).toMatchObject({
      total: 40,
      cached: 40,
      numRequests: 2,
      incurredTokenUsage: { total: 0, numRequests: 0 },
    });
  });
});
