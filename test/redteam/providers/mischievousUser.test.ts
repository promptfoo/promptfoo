import { beforeEach, describe, expect, it, vi } from 'vitest';
import RedteamMischievousUserProvider from '../../../src/redteam/providers/mischievousUser';
import { createMockProvider } from '../../factories/provider';

import type { ApiProvider } from '../../../src/types/index';

const mockUserProviderCallApi = vi.fn();
const mockUserProviderId = vi.fn();
const mockPromptfooSimulatedUserProvider = vi.hoisted(() => vi.fn());

vi.mock('../../../src/providers/promptfoo', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    PromptfooSimulatedUserProvider: mockPromptfooSimulatedUserProvider,
  };
});

describe('RedteamMischievousUserProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPromptfooSimulatedUserProvider.mockReset().mockImplementation(function () {
      return {
        callApi: mockUserProviderCallApi,
        id: mockUserProviderId,
        options: {},
      };
    });
    mockUserProviderId.mockReset().mockReturnValue('mock-user-provider');
    mockUserProviderCallApi.mockResolvedValue({
      output: 'user response',
      tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
    });
  });

  it('preserves simulated-user spend while counting only target probes', async () => {
    const targetProvider = createMockProvider({
      id: 'target',
      callApi: vi.fn<ApiProvider['callApi']>().mockResolvedValue({
        output: 'agent response',
        tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
      }),
    });

    const provider = new RedteamMischievousUserProvider({
      injectVar: 'objective',
      maxTurns: 1,
    });

    const result = await provider.callApi('test prompt', {
      originalProvider: targetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
    });

    expect(result.tokenUsage).toEqual({
      prompt: 30,
      completion: 15,
      cached: 0,
      total: 45,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
  });
});
