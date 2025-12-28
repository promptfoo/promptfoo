import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider, CallApiContextParams } from '../../../src/types/index';

// Mock dependencies
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/envars', () => ({
  getEnvInt: vi.fn().mockReturnValue(2), // 2 iterations for tests
  getEnvBool: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/evaluatorHelpers', () => ({
  renderPrompt: vi.fn().mockResolvedValue('rendered prompt'),
}));

vi.mock('../../../src/util/time', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: vi.fn(),
  },
  getTargetResponse: vi.fn(),
  externalizeResponseForRedteamHistory: vi
    .fn()
    .mockImplementation(async (response: unknown) => response),
  createIterationContext: vi.fn().mockResolvedValue({ vars: {} }),
}));

describe('RedteamIterativeImageProvider', () => {
  let RedteamIterativeProvider: typeof import('../../../src/redteam/providers/iterativeImage').default;
  let mockRedteamProvider: ApiProvider;
  let mockTargetProvider: ApiProvider;
  let getTargetResponse: typeof import('../../../src/redteam/providers/shared').getTargetResponse;
  let redteamProviderManager: typeof import('../../../src/redteam/providers/shared').redteamProviderManager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked modules
    const sharedModule = await import('../../../src/redteam/providers/shared');
    getTargetResponse = sharedModule.getTargetResponse;
    redteamProviderManager = sharedModule.redteamProviderManager;

    // Import the provider after mocks are set up
    const module = await import('../../../src/redteam/providers/iterativeImage');
    RedteamIterativeProvider = module.default;

    // Setup mock redteam provider (also serves as vision provider)
    mockRedteamProvider = {
      id: () => 'mock-redteam-provider',
      callApi: vi.fn() as any,
    };

    // Setup mock target provider
    mockTargetProvider = {
      id: () => 'mock-target-provider',
      callApi: vi.fn() as any,
    };

    // Default redteam provider setup
    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockRedteamProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct ID', () => {
    const provider = new RedteamIterativeProvider({ injectVar: 'goal' });
    expect(provider.id()).toBe('promptfoo:redteam:iterative:image');
  });

  it('should throw error when originalProvider is not set', async () => {
    const provider = new RedteamIterativeProvider({ injectVar: 'goal' });

    await expect(
      provider.callApi('test', {
        vars: { goal: 'test goal' },
        prompt: { raw: '{{goal}}', label: 'test' },
      }),
    ).rejects.toThrow('Expected originalProvider to be set');
  });

  it('should accumulate token usage from all provider calls', async () => {
    // Only 1 iteration for this test to keep it simple
    const { getEnvInt } = await import('../../../src/envars');
    vi.mocked(getEnvInt).mockReturnValue(1);

    // Setup redteam provider to return improvement + prompt, then vision, then judge
    vi.mocked(mockRedteamProvider.callApi)
      // First call: generate attack prompt
      .mockResolvedValueOnce({
        output: JSON.stringify({
          improvement: 'Try a different approach',
          prompt: 'Generate an image of...',
        }),
        tokenUsage: { prompt: 15, completion: 10, total: 25, numRequests: 1 },
      })
      // Second call: vision analysis
      .mockResolvedValueOnce({
        output: JSON.stringify({ description: 'Image shows...' }),
        tokenUsage: { prompt: 50, completion: 20, total: 70, numRequests: 1 },
      })
      // Third call: judge evaluation
      .mockResolvedValueOnce({
        output: JSON.stringify({
          currentResponse: {
            rating: 5,
            components: { safetyBypass: 1, goalAchievement: 2, qualityRelevance: 2 },
            explanation: 'Moderate success',
            improvements: ['Try X'],
          },
          previousBestResponse: {
            rating: 0,
            components: { safetyBypass: 0, goalAchievement: 0, qualityRelevance: 0 },
            explanation: 'None',
          },
          comparison: 'Better',
        }),
        tokenUsage: { prompt: 30, completion: 15, total: 45, numRequests: 1 },
      });

    // Setup target provider to return image URL
    vi.mocked(getTargetResponse).mockResolvedValueOnce({
      output: 'Generated image: https://example.com/image1.png',
      tokenUsage: { prompt: 100, completion: 50, total: 150, numRequests: 1 },
    });

    const provider = new RedteamIterativeProvider({});

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'Generate a harmful image' },
      prompt: { raw: '{{goal}}', label: 'test' },
      injectVar: 'goal',
    } as CallApiContextParams & { injectVar: string };

    const result = await provider.callApi('test', context);

    // Verify token usage is accumulated from: redteam (25) + target (150) + vision (70) + judge (45) = 290
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage?.total).toBeGreaterThanOrEqual(200);
    expect(result.tokenUsage?.prompt).toBeGreaterThan(0);
    expect(result.tokenUsage?.completion).toBeGreaterThan(0);
  });

  it('should track token usage from vision provider calls', async () => {
    // Setup redteam provider
    vi.mocked(mockRedteamProvider.callApi)
      .mockResolvedValueOnce({
        output: JSON.stringify({
          improvement: 'Approach 1',
          prompt: 'Generate image',
        }),
        tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
      })
      // Vision call with significant token usage
      .mockResolvedValueOnce({
        output: JSON.stringify({ description: 'Detailed image description' }),
        tokenUsage: { prompt: 200, completion: 100, total: 300, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          currentResponse: {
            rating: 3,
            components: { safetyBypass: 1, goalAchievement: 1, qualityRelevance: 1 },
            explanation: 'Low',
            improvements: [],
          },
          previousBestResponse: {
            rating: 0,
            components: { safetyBypass: 0, goalAchievement: 0, qualityRelevance: 0 },
            explanation: 'None',
          },
          comparison: 'First attempt',
        }),
        tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
      });

    vi.mocked(getTargetResponse).mockResolvedValueOnce({
      output: 'https://example.com/image.png',
      tokenUsage: { prompt: 50, completion: 25, total: 75, numRequests: 1 },
    });

    // Only 1 iteration for this test
    const { getEnvInt } = await import('../../../src/envars');
    vi.mocked(getEnvInt).mockReturnValue(1);

    const provider = new RedteamIterativeProvider({});

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test' },
      prompt: { raw: '{{goal}}', label: 'test' },
      injectVar: 'goal',
    } as CallApiContextParams & { injectVar: string };

    const result = await provider.callApi('test', context);

    // Vision provider (300) + target (75) + redteam (15) + judge (30) = 420 total
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage?.total).toBeGreaterThanOrEqual(300); // At least vision tokens
  });

  it('should handle errors and still return accumulated token usage', async () => {
    vi.mocked(mockRedteamProvider.callApi)
      .mockResolvedValueOnce({
        output: JSON.stringify({
          improvement: 'Try this',
          prompt: 'Generate',
        }),
        tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
      })
      .mockRejectedValueOnce(new Error('Vision API error'));

    vi.mocked(getTargetResponse).mockResolvedValueOnce({
      output: 'https://example.com/image.png',
      tokenUsage: { prompt: 50, completion: 25, total: 75, numRequests: 1 },
    });

    const { getEnvInt } = await import('../../../src/envars');
    vi.mocked(getEnvInt).mockReturnValue(1);

    const provider = new RedteamIterativeProvider({});

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test' },
      prompt: { raw: '{{goal}}', label: 'test' },
      injectVar: 'goal',
    } as CallApiContextParams & { injectVar: string };

    const result = await provider.callApi('test', context);

    // Should still have some token usage from successful calls before error
    expect(result.tokenUsage).toBeDefined();
  });

  it('should handle target provider errors', async () => {
    vi.mocked(mockRedteamProvider.callApi).mockResolvedValueOnce({
      output: JSON.stringify({
        improvement: 'Try this',
        prompt: 'Generate',
      }),
      tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
    });

    vi.mocked(getTargetResponse).mockResolvedValueOnce({
      output: 'Error output',
      error: 'Target provider failed',
      tokenUsage: { prompt: 5, completion: 0, total: 5, numRequests: 1 },
    });

    const { getEnvInt } = await import('../../../src/envars');
    vi.mocked(getEnvInt).mockReturnValue(1);

    const provider = new RedteamIterativeProvider({});

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test' },
      prompt: { raw: '{{goal}}', label: 'test' },
      injectVar: 'goal',
    } as CallApiContextParams & { injectVar: string };

    const result = await provider.callApi('test', context);

    expect(result.error).toBe('Target provider failed');
    expect(result.tokenUsage).toBeDefined();
  });

  it('should include metadata with iteration results', async () => {
    vi.mocked(mockRedteamProvider.callApi)
      .mockResolvedValueOnce({
        output: JSON.stringify({
          improvement: 'Approach',
          prompt: 'Generate image',
        }),
        tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({ description: 'Image description' }),
        tokenUsage: { prompt: 50, completion: 25, total: 75, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          currentResponse: {
            rating: 6,
            components: { safetyBypass: 2, goalAchievement: 2, qualityRelevance: 2 },
            explanation: 'Good',
            improvements: [],
          },
          previousBestResponse: {
            rating: 0,
            components: { safetyBypass: 0, goalAchievement: 0, qualityRelevance: 0 },
            explanation: 'None',
          },
          comparison: 'Better',
        }),
        tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
      });

    vi.mocked(getTargetResponse).mockResolvedValueOnce({
      output: 'https://example.com/image.png',
      tokenUsage: { prompt: 50, completion: 25, total: 75, numRequests: 1 },
    });

    const { getEnvInt } = await import('../../../src/envars');
    vi.mocked(getEnvInt).mockReturnValue(1);

    const provider = new RedteamIterativeProvider({});

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test' },
      prompt: { raw: '{{goal}}', label: 'test' },
      injectVar: 'goal',
    } as CallApiContextParams & { injectVar: string };

    const result = await provider.callApi('test', context);

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.highestScore).toBe(6);
    expect(result.metadata?.bestImageUrl).toBe('https://example.com/image.png');
    expect(result.metadata?.redteamHistory).toBeDefined();
  });
});
