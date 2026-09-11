import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeProvider } from '../../../src/models/evalResult';
import { neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import {
  createMockProvider,
  createProviderResponse,
  type MockApiProvider,
} from '../../factories/provider';

import type { ApiProvider, CallApiContextParams } from '../../../src/types/index';

const mockFetchWithProxy = vi.fn();
const mockRenderPrompt = vi.fn();

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: (...args: unknown[]) => mockFetchWithProxy(...args),
}));

vi.mock('../../../src/evaluatorHelpers', () => ({
  renderPrompt: (...args: unknown[]) => mockRenderPrompt(...args),
}));

vi.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn().mockReturnValue('test@example.com'),
}));

vi.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationExplicitlyDisabledError: vi.fn(
    (strategyName) =>
      `${strategyName} requires remote generation, which has been explicitly disabled.`,
  ),
  getRemoteGenerationHeaders: vi.fn((extra) => ({ 'Content-Type': 'application/json', ...extra })),
  getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test.api/generate'),
  neverGenerateRemote: vi.fn().mockReturnValue(false),
}));

describe('BestOfNProvider - Runtime Behavior', () => {
  let BestOfNProvider: typeof import('../../../src/redteam/providers/bestOfN').default;
  let mockTargetProvider: MockApiProvider;

  const createMockContext = (targetProvider: ApiProvider): CallApiContextParams => ({
    originalProvider: targetProvider,
    vars: { input: 'test input' },
    prompt: { raw: 'test prompt', label: 'test' },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(neverGenerateRemote).mockReset();
    vi.mocked(neverGenerateRemote).mockReturnValue(false);
    mockRenderPrompt.mockReset();
    mockRenderPrompt.mockImplementation((_prompt: unknown, vars: unknown) => {
      const input =
        typeof vars === 'object' &&
        vars !== null &&
        'input' in vars &&
        typeof (vars as { input?: unknown }).input === 'string'
          ? (vars as { input: string }).input
          : undefined;
      return input || 'rendered prompt';
    });

    // Dynamic import after mocks are set up
    const module = await import('../../../src/redteam/providers/bestOfN');
    BestOfNProvider = module.default;

    mockTargetProvider = createMockProvider({
      response: createProviderResponse({ output: 'target response' }),
    });

    // Mock successful response from remote API
    mockFetchWithProxy.mockResolvedValue({
      json: async () => ({
        modifiedPrompts: ['candidate 1', 'candidate 2'],
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should pass abortSignal to fetchWithProxy', async () => {
    const provider = new BestOfNProvider({
      injectVar: 'input',
    });

    const abortController = new AbortController();
    const context = createMockContext(mockTargetProvider);

    await provider.callApi('test prompt', context, { abortSignal: abortController.signal });

    expect(mockFetchWithProxy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      abortController.signal,
    );
  });

  it('should include target context in remote generation requests', async () => {
    const provider = new BestOfNProvider({
      injectVar: 'input',
      targetId: 'cloud-target-123',
    });

    await provider.callApi('test prompt', createMockContext(mockTargetProvider));

    const request = mockFetchWithProxy.mock.calls[0]?.[1] as { body?: string } | undefined;
    expect(request?.body).toBeDefined();
    expect(JSON.parse(request?.body ?? '{}')).toMatchObject({
      targetId: 'cloud-target-123',
      task: 'jailbreak:best-of-n',
    });
  });

  it('should pass options to target provider callApi', async () => {
    const provider = new BestOfNProvider({
      injectVar: 'input',
    });

    const abortController = new AbortController();
    const context = createMockContext(mockTargetProvider);
    const options = { abortSignal: abortController.signal };

    await provider.callApi('test prompt', context, options);

    // The target provider should be called with the options
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      options,
    );
  });

  it('preserves fresh target usage when a cached candidate finishes after a fresh candidate', async () => {
    const provider = new BestOfNProvider({ injectVar: 'input', maxConcurrency: 1 });
    mockTargetProvider.callApi
      .mockResolvedValueOnce({
        output: 'Fresh candidate failed',
        error: 'Candidate was rejected',
        cost: 0.06,
        tokenUsage: { total: 60, prompt: 40, completion: 20, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: 'Cached candidate succeeded',
        cached: true,
        cost: 0.1,
        tokenUsage: { total: 100, prompt: 65, completion: 35, numRequests: 1 },
      });

    const result = await provider.callApi('test prompt', createMockContext(mockTargetProvider));

    expect(result.cached).toBe(false);
    expect(result.cost).toBeCloseTo(0.16);
    expect(result.incurredCost).toBeCloseTo(0.06);
    expect(result.tokenUsage).toMatchObject({
      total: 160,
      prompt: 105,
      completion: 55,
      cached: 100,
      numRequests: 2,
      incurredTokenUsage: { total: 60, prompt: 40, completion: 20, numRequests: 1 },
    });
  });

  it('keeps an aggregate cached when every candidate response was cached', async () => {
    const provider = new BestOfNProvider({ injectVar: 'input', maxConcurrency: 1 });
    mockTargetProvider.callApi
      .mockResolvedValueOnce({
        output: 'First cached candidate failed',
        error: 'Candidate was rejected',
        cached: true,
        cost: 0.08,
        tokenUsage: { total: 80, prompt: 50, completion: 30, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: 'Second cached candidate succeeded',
        cached: true,
        cost: 0.1,
        tokenUsage: { total: 100, prompt: 65, completion: 35, numRequests: 1 },
      });

    const result = await provider.callApi('test prompt', createMockContext(mockTargetProvider));

    expect(result.cached).toBe(true);
    expect(result.cost).toBeCloseTo(0.18);
    expect(result.incurredCost).toBe(0);
    expect(result.tokenUsage).toMatchObject({
      total: 180,
      cached: 180,
      numRequests: 2,
      incurredTokenUsage: { total: 0, numRequests: 0 },
    });
  });

  it('preserves fresh target usage when the final failed candidate was cached', async () => {
    const provider = new BestOfNProvider({ injectVar: 'input', maxConcurrency: 1 });
    mockTargetProvider.callApi
      .mockResolvedValueOnce({
        error: 'Fresh candidate was rejected',
        cost: 0.06,
        tokenUsage: { total: 60, prompt: 40, completion: 20, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        error: 'Cached candidate was rejected',
        cached: true,
        cost: 0.1,
        tokenUsage: { total: 100, prompt: 65, completion: 35, numRequests: 1 },
      });

    const result = await provider.callApi('test prompt', createMockContext(mockTargetProvider));

    expect(result.cached).toBe(false);
    expect(result.cost).toBeCloseTo(0.16);
    expect(result.incurredCost).toBeCloseTo(0.06);
    expect(result.tokenUsage).toMatchObject({
      total: 160,
      cached: 100,
      numRequests: 2,
      incurredTokenUsage: { total: 60, numRequests: 1 },
    });
  });

  it('aggregates all fresh candidate costs without adding an unnecessary incurred-cost split', async () => {
    const provider = new BestOfNProvider({ injectVar: 'input', maxConcurrency: 1 });
    mockTargetProvider.callApi
      .mockResolvedValueOnce({
        error: 'Fresh candidate was rejected',
        cost: 0.06,
        tokenUsage: { total: 60, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: 'Fresh candidate succeeded',
        cost: 0.1,
        tokenUsage: { total: 100, numRequests: 1 },
      });

    const result = await provider.callApi('test prompt', createMockContext(mockTargetProvider));

    expect(result.cost).toBeCloseTo(0.16);
    expect(result.incurredCost).toBeUndefined();
    expect(result.tokenUsage).toMatchObject({ total: 160, numRequests: 2 });
  });

  it('preserves incurred costs already reported by composite candidate responses', async () => {
    const provider = new BestOfNProvider({ injectVar: 'input', maxConcurrency: 1 });
    mockTargetProvider.callApi
      .mockResolvedValueOnce({
        error: 'Composite candidate was rejected',
        cost: 0.1,
        incurredCost: 0.04,
        tokenUsage: {
          total: 100,
          numRequests: 2,
          incurredTokenUsage: { total: 40, numRequests: 1 },
        },
      })
      .mockResolvedValueOnce({
        output: 'Fresh candidate succeeded',
        cost: 0.06,
        tokenUsage: { total: 60, numRequests: 1 },
      });

    const result = await provider.callApi('test prompt', createMockContext(mockTargetProvider));

    expect(result.cost).toBeCloseTo(0.16);
    expect(result.incurredCost).toBeCloseTo(0.1);
    expect(result.tokenUsage).toMatchObject({
      total: 160,
      numRequests: 3,
      incurredTokenUsage: { total: 100, numRequests: 2 },
    });
  });

  it('should re-throw AbortError and not swallow it', async () => {
    const provider = new BestOfNProvider({
      injectVar: 'input',
    });

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetchWithProxy.mockRejectedValue(abortError);

    const context = createMockContext(mockTargetProvider);

    await expect(provider.callApi('test prompt', context)).rejects.toThrow(
      'The operation was aborted',
    );
  });

  it('should swallow non-AbortError exceptions and return error response', async () => {
    const provider = new BestOfNProvider({
      injectVar: 'input',
    });

    const regularError = new Error('Network error');
    mockFetchWithProxy.mockRejectedValue(regularError);

    const context = createMockContext(mockTargetProvider);

    const result = await provider.callApi('test prompt', context);

    // Non-AbortError should be caught and returned as an error response
    expect(result.error).toContain('Network error');
  });

  it.each([42, true, null, { prompt: 'candidate 0' }])(
    'should skip non-string candidate prompt from remote generation: %j',
    async (invalidPrompt) => {
      const provider = new BestOfNProvider({
        injectVar: 'input',
      });
      const context = createMockContext(mockTargetProvider);

      mockFetchWithProxy.mockResolvedValue({
        json: async () => ({
          modifiedPrompts: [invalidPrompt, 'candidate 2'],
        }),
      });

      await provider.callApi('test prompt', context);

      expect(mockRenderPrompt).toHaveBeenCalledTimes(1);
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockTargetProvider.callApi).toHaveBeenCalledWith(
        'candidate 2',
        expect.any(Object),
        undefined,
      );
    },
  );

  it.each([
    'file://etc/passwd',
    ' FILE://etc/passwd',
    '\tFiLe://etc/passwd',
    'package:@promptfoo/fake:getSecret',
    ' PACKAGE:@promptfoo/fake:getSecret',
    '\tPaCkAgE:@promptfoo/fake:getSecret',
  ])('should skip unsafe candidate prompt from remote generation: %s', async (unsafePrompt) => {
    const provider = new BestOfNProvider({
      injectVar: 'input',
    });
    const context = createMockContext(mockTargetProvider);

    mockFetchWithProxy.mockResolvedValue({
      json: async () => ({
        modifiedPrompts: [unsafePrompt, 'candidate 2'],
      }),
    });

    await provider.callApi('test prompt', context);

    expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith(
      'candidate 2',
      expect.any(Object),
      undefined,
    );
  });

  it('should pass the injected variable through renderPrompt without special loading or template rendering', async () => {
    const provider = new BestOfNProvider({
      injectVar: 'input',
    });
    const context = createMockContext(mockTargetProvider);

    await provider.callApi('test prompt', context);

    expect(mockRenderPrompt).toHaveBeenCalledWith(
      context.prompt,
      {
        ...context.vars,
        input: 'candidate 1',
      },
      context.filters,
      mockTargetProvider,
      ['input'],
    );
  });
});

describe('BestOfNProvider - Config Serialization', () => {
  let BestOfNProvider: typeof import('../../../src/redteam/providers/bestOfN').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(neverGenerateRemote).mockReset();
    vi.mocked(neverGenerateRemote).mockReturnValue(false);
    const module = await import('../../../src/redteam/providers/bestOfN');
    BestOfNProvider = module.default;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should expose config property with all constructor options', () => {
    const options = {
      injectVar: 'query',
      maxConcurrency: 5,
      nSteps: 10,
      maxCandidatesPerStep: 20,
    };

    const provider = new BestOfNProvider(options);

    expect(provider.config).toEqual({
      injectVar: 'query',
      maxConcurrency: 5,
      nSteps: 10,
      maxCandidatesPerStep: 20,
    });
  });

  it('should apply default maxConcurrency when not provided', () => {
    const provider = new BestOfNProvider({
      injectVar: 'query',
    });

    expect(provider.config.maxConcurrency).toBe(3);
  });

  it('should throw an actionable error when remote generation is explicitly disabled', () => {
    vi.mocked(neverGenerateRemote).mockReturnValue(true);

    expect(() => new BestOfNProvider({ injectVar: 'query' })).toThrow(
      'Best-of-N strategy requires remote generation, which has been explicitly disabled.',
    );
  });

  it('should preserve config through sanitizeProvider for database storage', () => {
    const provider = new BestOfNProvider({
      injectVar: 'query',
      maxConcurrency: 5,
      nSteps: 10,
    });

    const sanitized = sanitizeProvider(provider);

    expect(sanitized.id).toBe('promptfoo:redteam:best-of-n');
    expect(sanitized.config).toEqual({
      injectVar: 'query',
      maxConcurrency: 5,
      nSteps: 10,
      maxCandidatesPerStep: undefined,
    });
  });

  it('should allow recreating provider from sanitized config', () => {
    const originalProvider = new BestOfNProvider({
      injectVar: 'query',
      maxConcurrency: 5,
      nSteps: 10,
    });

    // Simulate what happens when saved to database and loaded via retry strategy
    const sanitized = sanitizeProvider(originalProvider);
    const recreatedProvider = new BestOfNProvider(sanitized.config);

    expect(recreatedProvider.config).toEqual(originalProvider.config);
    expect(recreatedProvider.id()).toBe(originalProvider.id());
  });
});
