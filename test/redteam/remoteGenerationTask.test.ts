import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { getUserEmail } from '../../src/globalConfig/accounts';
import { trackGenerationTokenUsage } from '../../src/redteam/generationTokenUsage';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
} from '../../src/redteam/remoteGeneration';
import { postRemoteGenerationTask } from '../../src/redteam/remoteGenerationTask';

import type { StrategyRuntimeContext } from '../../src/redteam/strategies/types';
import type { ApiProvider, TokenUsage } from '../../src/types/index';

vi.mock('../../src/cache');
vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/redteam/remoteGeneration');

function createTrackedContext(usage: TokenUsage): StrategyRuntimeContext {
  const provider: ApiProvider = {
    id: () => 'generation-provider',
    callApi: vi.fn().mockResolvedValue({ output: 'unused' }),
  };

  return {
    generationProviderSelection: {
      provider: trackGenerationTokenUsage(provider, usage),
      source: 'default',
    },
  };
}

describe('postRemoteGenerationTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserEmail).mockReturnValue('test@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://example.com/task');
    vi.mocked(getRemoteGenerationHeaders).mockImplementation((extra) => ({
      'Content-Type': 'application/json',
      ...extra,
    }));
  });

  it('records generation usage returned by a fresh remote strategy response', async () => {
    const usage: TokenUsage = {};
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        result: [],
        tokenUsage: { total: 30, prompt: 20, completion: 10, numRequests: 3 },
      },
      status: 200,
      statusText: 'OK',
    });

    await postRemoteGenerationTask({ task: 'math-prompt' }, createTrackedContext(usage));

    expect(usage).toMatchObject({ total: 30, prompt: 20, completion: 10, numRequests: 3 });
  });

  it('preserves cached remote strategy usage without incurring it again', async () => {
    const usage: TokenUsage = {};
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: true,
      data: { tokenUsage: { total: 45, prompt: 30, completion: 15, numRequests: 2 } },
      status: 200,
      statusText: 'OK',
    });

    await postRemoteGenerationTask({ task: 'citation' }, createTrackedContext(usage));

    expect(usage).toMatchObject({
      total: 45,
      prompt: 30,
      completion: 15,
      cached: 45,
      numRequests: 2,
      incurredTokenUsage: { total: 0, numRequests: 0 },
    });
  });

  it('records coalesced concurrent generation usage only for the request owner', async () => {
    const usage: TokenUsage = {};
    const runtimeContext = createTrackedContext(usage);
    const response = {
      cached: false,
      data: {
        result: [],
        tokenUsage: { total: 30, prompt: 20, completion: 10, numRequests: 3 },
      },
      status: 200,
      statusText: 'OK',
    };
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce({ ...response, coalesced: true });

    await Promise.all([
      postRemoteGenerationTask({ task: 'citation', topic: 'duplicate' }, runtimeContext),
      postRemoteGenerationTask({ task: 'citation', topic: 'duplicate' }, runtimeContext),
    ]);

    expect(usage).toMatchObject({ total: 30, prompt: 20, completion: 10, numRequests: 3 });
  });

  it('does not invent model requests for deterministic tasks without reported usage', async () => {
    const usage: TokenUsage = {};
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { modifiedPrompts: ['deterministic result'] },
      status: 200,
      statusText: 'OK',
    });

    await postRemoteGenerationTask({ task: 'jailbreak:likert' }, createTrackedContext(usage));

    expect(usage).toEqual({});
  });

  it('records reported usage from an unsuccessful remote response exactly once', async () => {
    const usage: TokenUsage = {};
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: {
        error: 'generation failed after calling the provider',
        tokenUsage: { total: 12, prompt: 8, completion: 4, numRequests: 1 },
      },
      status: 500,
      statusText: 'Internal Server Error',
    });

    await postRemoteGenerationTask({ task: 'citation' }, createTrackedContext(usage));

    expect(usage).toMatchObject({ total: 12, prompt: 8, completion: 4, numRequests: 1 });
  });

  it('does not invent model usage for an unsuccessful HTTP response without usage', async () => {
    const usage: TokenUsage = {};
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { error: 'request was rejected before model execution' },
      status: 401,
      statusText: 'Unauthorized',
    });

    await postRemoteGenerationTask({ task: 'citation' }, createTrackedContext(usage));

    expect(usage).toEqual({});
  });

  it('preserves token usage carried by a rejected remote request', async () => {
    const usage: TokenUsage = {};
    const error = Object.assign(new Error('generation failed'), {
      tokenUsage: { total: 14, prompt: 9, completion: 5 },
    });
    vi.mocked(fetchWithCache).mockRejectedValue(error);

    await expect(
      postRemoteGenerationTask({ task: 'citation' }, createTrackedContext(usage)),
    ).rejects.toThrow('generation failed');

    expect(usage).toMatchObject({ total: 14, prompt: 9, completion: 5, numRequests: 1 });
  });

  it('records a coalesced remote generation failure only once', async () => {
    const usage: TokenUsage = {};
    const runtimeContext = createTrackedContext(usage);
    const error = Object.assign(new Error('generation failed'), {
      tokenUsage: { total: 14, prompt: 9, completion: 5 },
    });
    vi.mocked(fetchWithCache).mockRejectedValue(error);

    const results = await Promise.allSettled([
      postRemoteGenerationTask({ task: 'citation', topic: 'duplicate' }, runtimeContext),
      postRemoteGenerationTask({ task: 'citation', topic: 'duplicate' }, runtimeContext),
    ]);

    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(usage).toMatchObject({ total: 14, prompt: 9, completion: 5, numRequests: 1 });
  });

  it('tracks the same remote failure separately for independent accounting scopes', async () => {
    const firstUsage: TokenUsage = {};
    const secondUsage: TokenUsage = {};
    const error = Object.assign(new Error('generation failed'), {
      tokenUsage: { total: 14, prompt: 9, completion: 5 },
    });
    vi.mocked(fetchWithCache).mockRejectedValue(error);

    await Promise.allSettled([
      postRemoteGenerationTask({ task: 'citation' }, createTrackedContext(firstUsage)),
      postRemoteGenerationTask({ task: 'citation' }, createTrackedContext(secondUsage)),
    ]);

    expect(firstUsage).toMatchObject({ total: 14, numRequests: 1 });
    expect(secondUsage).toMatchObject({ total: 14, numRequests: 1 });
  });

  it('does not invent model usage when a remote request fails without a token breakdown', async () => {
    const usage: TokenUsage = {};
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('generation timed out'));

    await expect(
      postRemoteGenerationTask({ task: 'citation' }, createTrackedContext(usage)),
    ).rejects.toThrow('generation timed out');

    expect(usage).toEqual({});
  });

  it('preserves custom headers and cache-busting for GCG requests', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      data: { responses: ['generated'] },
      status: 200,
      statusText: 'OK',
    });

    await postRemoteGenerationTask({ task: 'gcg' }, undefined, {
      headers: { 'x-promptfoo-silent': 'true' },
      bustCache: true,
    });

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://example.com/task',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-promptfoo-silent': 'true',
        },
        body: JSON.stringify({ task: 'gcg', email: 'test@example.com' }),
      },
      expect.any(Number),
      'json',
      true,
    );
  });
});
