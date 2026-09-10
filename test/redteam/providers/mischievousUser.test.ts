import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RedteamMischievousUserProvider from '../../../src/redteam/providers/mischievousUser';
import { createMockProvider } from '../../factories/provider';

import type { CallApiContextParams } from '../../../src/types/index';

const mockUserProviderCallApi = vi.fn();

vi.mock('../../../src/globalConfig/accounts', async (importOriginal) => ({
  ...(await importOriginal()),
  isLoggedIntoCloud: vi.fn(() => true),
}));

vi.mock('../../../src/providers/promptfoo', async (importOriginal) => ({
  ...(await importOriginal()),
  PromptfooSimulatedUserProvider: vi.fn(function () {
    return {
      callApi: mockUserProviderCallApi,
      id: vi.fn(() => 'mock-simulated-user'),
      options: {},
    };
  }),
}));

describe('RedteamMischievousUserProvider', () => {
  let provider: RedteamMischievousUserProvider;
  let targetProvider: ReturnType<typeof createMockProvider>;
  let context: CallApiContextParams;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserProviderCallApi.mockReset();

    targetProvider = createMockProvider({ id: 'target' });
    context = {
      originalProvider: targetProvider,
      vars: { instructions: 'test instructions' },
      prompt: { raw: 'test prompt', label: 'test prompt' },
    };
    provider = new RedteamMischievousUserProvider({
      injectVar: 'instructions',
      maxTurns: 2,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockUserProviderCallApi.mockReset();
  });

  it('separates simulated-user usage from target usage and probes', async () => {
    mockUserProviderCallApi
      .mockResolvedValueOnce({
        output: 'user response 1',
        tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: 'user response 2',
        tokenUsage: { prompt: 12, completion: 6, total: 18, numRequests: 1 },
      });
    targetProvider.callApi
      .mockResolvedValueOnce({
        output: 'target response 1',
        tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: 'target response 2',
        tokenUsage: { prompt: 25, completion: 15, total: 40, numRequests: 1 },
      });

    const result = await provider.callApi('test prompt', context);

    expect(result.tokenUsage).toMatchObject({
      prompt: 45,
      completion: 25,
      total: 70,
      numRequests: 2,
      attacker: {
        prompt: 22,
        completion: 11,
        total: 33,
        numRequests: 2,
      },
    });
  });

  it('records a stop decision as attacker usage without adding a target probe', async () => {
    mockUserProviderCallApi.mockResolvedValueOnce({
      output: '###STOP###',
      tokenUsage: { prompt: 4, completion: 3, total: 7 },
    });

    const result = await provider.callApi('test prompt', context);

    expect(result.tokenUsage).toMatchObject({
      total: 0,
      numRequests: 0,
      attacker: { prompt: 4, completion: 3, total: 7, numRequests: 1 },
    });
    expect(targetProvider.callApi).not.toHaveBeenCalled();
  });

  it('preserves attacker usage from an error response', async () => {
    mockUserProviderCallApi.mockResolvedValueOnce({
      error: 'Simulated user failed',
      tokenUsage: { prompt: 6, completion: 5, total: 11 },
    });

    const result = await provider.callApi('test prompt', context);

    expect(result.error).toBe('Simulated user failed');
    expect(result.tokenUsage?.attacker).toMatchObject({
      prompt: 6,
      completion: 5,
      total: 11,
      numRequests: 1,
    });
    expect(targetProvider.callApi).not.toHaveBeenCalled();
  });

  it('does not count a preflight error as an attacker request', async () => {
    mockUserProviderCallApi.mockResolvedValueOnce({
      error: 'Remote generation is disabled',
      tokenUsage: { numRequests: 0 },
    });

    const result = await provider.callApi('test prompt', context);

    expect(result.error).toBe('Remote generation is disabled');
    expect(result.tokenUsage?.attacker).toMatchObject({ total: 0, numRequests: 0 });
    expect(targetProvider.callApi).not.toHaveBeenCalled();
  });

  it('preserves target and attacker usage when the target returns an error', async () => {
    mockUserProviderCallApi.mockResolvedValueOnce({
      output: 'user response',
      tokenUsage: { prompt: 3, completion: 2, total: 5 },
    });
    targetProvider.callApi.mockResolvedValueOnce({
      error: 'Target failed',
      tokenUsage: { prompt: 8, completion: 5, total: 13 },
    });

    const result = await provider.callApi('test prompt', context);

    expect(result.error).toBe('Target failed');
    expect(result.tokenUsage).toMatchObject({
      prompt: 8,
      completion: 5,
      total: 13,
      numRequests: 1,
      attacker: { prompt: 3, completion: 2, total: 5, numRequests: 1 },
    });
  });

  it('retains cached logical usage without charging Promptfoo response-cache hits', async () => {
    mockUserProviderCallApi.mockResolvedValueOnce({
      cached: true,
      output: 'user response',
      tokenUsage: { prompt: 60, completion: 40, total: 100, numRequests: 1 },
    });
    targetProvider.callApi.mockResolvedValueOnce({
      cached: true,
      output: 'target response',
      tokenUsage: { prompt: 120, completion: 80, total: 200, numRequests: 1 },
    });
    provider = new RedteamMischievousUserProvider({
      injectVar: 'instructions',
      maxTurns: 1,
    });

    const result = await provider.callApi('test prompt', context);

    expect(result.tokenUsage).toMatchObject({
      total: 200,
      prompt: 120,
      completion: 80,
      cached: 200,
      numRequests: 1,
      attacker: {
        total: 100,
        prompt: 60,
        completion: 40,
        cached: 100,
        numRequests: 1,
      },
      incurredTokenUsage: {
        total: 0,
        numRequests: 0,
        attacker: { total: 0, numRequests: 0 },
      },
    });
  });

  it('retains provider-side cached tokens from a fresh attacker request', async () => {
    mockUserProviderCallApi.mockResolvedValueOnce({
      output: '###STOP###',
      tokenUsage: { prompt: 10, completion: 2, cached: 8, total: 12, numRequests: 1 },
    });

    const result = await provider.callApi('test prompt', context);

    expect(result.tokenUsage?.attacker).toMatchObject({
      prompt: 10,
      completion: 2,
      cached: 8,
      total: 12,
      numRequests: 1,
    });
  });
});
