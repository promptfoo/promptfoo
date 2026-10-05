import { describe, expect, it, vi } from 'vitest';
import {
  recordGenerationTokenUsage,
  trackAdditionalGenerationProvider,
  trackGenerationTokenUsage,
} from '../../src/redteam/generationTokenUsage';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { createDeferred } from '../util/utils';

import type { ApiProvider, TokenUsage } from '../../src/types/index';

function createProvider(callApi: ApiProvider['callApi']): ApiProvider {
  return { id: () => 'generation-provider', callApi };
}

describe('generation token usage', () => {
  it('blocks a cancelled generation call without recording a request', async () => {
    const controller = new AbortController();
    const error = new Error('generation cancelled');
    const callApi = vi.fn().mockResolvedValue({ output: 'unused' });
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(createProvider(callApi), usage, controller.signal);
    controller.abort(error);

    await expect(provider.callApi('generate')).rejects.toBe(error);

    expect(callApi).not.toHaveBeenCalled();
    expect(usage).toEqual({});
  });

  it.each(['generation', 'request'] as const)(
    'forwards cancellation from the %s signal while preserving call options',
    async (source) => {
      const generation = new AbortController();
      const request = new AbortController();
      const callApi = vi.fn().mockResolvedValue({ output: 'generated' });
      const provider = trackGenerationTokenUsage(createProvider(callApi), {}, generation.signal);
      await provider.callApi('generate', undefined, {
        abortSignal: request.signal,
        includeLogProbs: true,
      });
      const forwarded = callApi.mock.calls[0][2];
      expect(forwarded.includeLogProbs).toBe(true);
      expect(forwarded.abortSignal.aborted).toBe(false);

      const error = new Error('cancelled');
      (source === 'generation' ? generation : request).abort(error);
      expect(forwarded.abortSignal.reason).toBe(error);
      await expect(
        provider.callApi('retry', undefined, { abortSignal: request.signal }),
      ).rejects.toBe(error);
      expect(callApi).toHaveBeenCalledOnce();
    },
  );

  it('isolates simultaneous generation scopes sharing a borrowed provider', async () => {
    const cancelled = new AbortController();
    const active = new AbortController();
    const response = createDeferred<{ output: string }>();
    const callApi = vi.fn<ApiProvider['callApi']>().mockImplementation(() => response.promise);
    const borrowed = createProvider(callApi);
    const first = trackGenerationTokenUsage(borrowed, {}, cancelled.signal);
    const second = trackGenerationTokenUsage(borrowed, {}, active.signal);
    const firstCall = first.callApi('first');
    const secondCall = second.callApi('second');

    const error = new Error('first cancelled');
    cancelled.abort(error);
    expect(callApi.mock.calls[0][2]?.abortSignal?.aborted).toBe(true);
    expect(callApi.mock.calls[1][2]?.abortSignal?.aborted).toBe(false);
    response.resolve({ output: 'completed' });
    await Promise.all([firstCall, secondCall]);

    await expect(first.callApi('retry')).rejects.toBe(error);
    await expect(second.callApi('continue')).resolves.toMatchObject({ output: 'completed' });
    await expect(borrowed.callApi('later run')).resolves.toMatchObject({ output: 'completed' });
    expect(callApi).toHaveBeenCalledTimes(4);
  });

  it('propagates cancellation to a specialized generation provider', async () => {
    const controller = new AbortController();
    const usage: TokenUsage = {};
    const parent = trackGenerationTokenUsage(
      createProvider(vi.fn<ApiProvider['callApi']>()),
      usage,
      controller.signal,
    );
    const callApi = vi.fn().mockResolvedValue({ output: 'unused' });
    const child = trackAdditionalGenerationProvider(createProvider(callApi), parent);
    const error = new Error('generation cancelled');
    controller.abort(error);

    await expect(child.callApi('generate')).rejects.toBe(error);

    expect(callApi).not.toHaveBeenCalled();
    expect(usage).toEqual({});
  });

  it('records incurred usage when an active call completes after cancellation', async () => {
    const controller = new AbortController();
    const response = createDeferred<{ output: string; tokenUsage: TokenUsage }>();
    const usage: TokenUsage = {};
    const provider = trackGenerationTokenUsage(
      createProvider(() => response.promise),
      usage,
      controller.signal,
    );
    const call = provider.callApi('generate');
    controller.abort(new Error('generation cancelled'));
    response.resolve({ output: 'completed', tokenUsage: { total: 5, numRequests: 1 } });

    await expect(call).resolves.toMatchObject({ output: 'completed' });
    expect(usage).toMatchObject({ total: 5, numRequests: 1 });
  });

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
